const PtyManager = require('./pty-manager');
const logger = require('./logger');
const config = require('./config');

// Maximum number of concurrent PTY instances
const MAX_INSTANCES = config.pty.maxInstances;

// Idle timeout for cleanup (30 minutes)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// Default instance ID for backward compatibility
const DEFAULT_INSTANCE_ID = 'default';

// Hard cap on remembered user stops (see stoppedByUserAt). A record only ever
// matters while a client can still send set-instance for that id, i.e. while a
// tab with that id exists; the client's tab count is itself capped at
// MAX_INSTANCES (the relay reports the cap and the app enforces it), so the
// live set is at most MAX_INSTANCES ids per client. The multiplier leaves room
// for several clients pointed at one relay plus their in-flight churn, and
// eviction takes the least recently consulted entry - an id nothing has asked
// about since, which is what a deleted tab looks like from here.
const MAX_USER_STOP_RECORDS = MAX_INSTANCES * 8;

class PtyRegistry {
  constructor() {
    this.instances = new Map(); // instanceId -> PtyManager
    this.lastAccessTime = new Map(); // instanceId -> timestamp

    // instanceId -> timestamp the stop was recorded or last consulted.
    // PtyManager.stop() sets stoppedByUser on the manager object itself, but
    // remove() deletes that object entirely - without this, a later get()
    // would construct a brand-new manager with stoppedByUser defaulting back
    // to false, and set-instance would silently restart a session the user
    // just stopped.
    // Written by remove({ userInitiated: true }) and recordUserStop() only -
    // housekeeping eviction (cleanupIdleInstances, removeOldestIdle) must
    // NOT record, or an idle-evicted instance would stop being able to
    // auto-start.
    // Entries leave in one of two ways, neither of them elapsed time (see
    // cleanupIdleInstances): clearUserStop() on any deliberate start, and
    // capacity eviction at MAX_USER_STOP_RECORDS. Insertion order is kept
    // equal to consultation order by _rememberUserStop(), so the entry
    // evicted is always the one no client has asked about in longest.
    this.stoppedByUserAt = new Map();

    // Start idle cleanup interval. This is a background maintenance timer,
    // not user-facing work, so it must not hold the event loop open on its
    // own (e.g. keeping `node --test` or a script running forever).
    this.cleanupInterval = setInterval(() => this.cleanupIdleInstances(), 60000);
    this.cleanupInterval.unref();
  }

  /**
   * Get or create a PTY instance by ID
   * @param {string} instanceId - The instance identifier
   * @param {string} workingDir - Working directory (required for new instances)
   * @param {string} cliType - CLI type ('claude' or 'antigravity'), defaults to 'claude'
   * @returns {PtyManager} The PTY manager instance
   */
  get(instanceId, workingDir, cliType) {
    // Use default instance ID if not provided (backward compatibility)
    const id = instanceId || DEFAULT_INSTANCE_ID;

    // Update access time
    this.lastAccessTime.set(id, Date.now());

    // A get() is proof that something can still reach this id - a client sent
    // set-instance for it, or a route was called with it - so any remembered
    // stop for it is still live and must not be the one capacity eviction
    // takes. This is what makes the bound safe: every tab the user still has
    // refreshes its own record on connect, while an id whose tab is gone is
    // never touched again and drifts to the front of the queue.
    if (this.stoppedByUserAt.has(id)) {
      this._rememberUserStop(id);
    }

    // Return existing instance if available
    if (this.instances.has(id)) {
      const instance = this.instances.get(id);
      // Update working dir if provided and different
      if (workingDir && instance.currentWorkingDir !== workingDir) {
        logger.info({ instanceId: id, oldDir: instance.currentWorkingDir, newDir: workingDir },
          'Working directory changed, will apply on restart');
        instance.pendingWorkingDir = workingDir;
      }
      // Update cliType if provided and different (only when not running/starting)
      if (cliType && instance.cliType !== cliType) {
        if (!instance.isBusy) {
          logger.info({ instanceId: id, oldCliType: instance.cliType, newCliType: cliType },
            'CLI type changed');
          instance.cliType = cliType;
        } else {
          logger.warn({ instanceId: id, currentCliType: instance.cliType, requestedCliType: cliType },
            'Cannot change CLI type while running - stop instance first');
        }
      }
      return instance;
    }

    // Check max instances limit
    if (this.instances.size >= MAX_INSTANCES) {
      // Try to remove oldest idle instance
      const removed = this.removeOldestIdle();
      if (!removed) {
        throw new Error(`Maximum instances (${MAX_INSTANCES}) reached`);
      }
    }

    // Create new instance
    logger.info({ instanceId: id, workingDir }, 'Creating new PTY instance');
    const instance = new PtyManager(id, cliType);
    if (this.stoppedByUserAt.has(id)) {
      // A user explicitly stopped this id before its manager was removed;
      // seed the new manager so set-instance still declines to auto-start it.
      instance.stoppedByUser = true;
    }
    this.instances.set(id, instance);

    return instance;
  }

  /**
   * Check if an instance exists
   * @param {string} instanceId - The instance identifier
   * @returns {boolean}
   */
  has(instanceId) {
    return this.instances.has(instanceId || DEFAULT_INSTANCE_ID);
  }

  /**
   * Remove and stop a PTY instance
   * @param {string} instanceId - The instance identifier
   * @param {Object} [options]
   * @param {boolean} [options.userInitiated=false] - True when the removal
   *   is a direct result of explicit user action (DELETE /api/instances or
   *   DELETE /api/instances/:instanceId). Records the id so a later get()
   *   does not resurrect it. MUST be left false (the default) for
   *   housekeeping removals - cleanupIdleInstances() and removeOldestIdle()
   *   evict instances that merely went idle, not ones the user stopped, and
   *   must remain restartable on the next set-instance.
   * @returns {boolean} Whether an instance was removed
   */
  remove(instanceId, { userInitiated = false } = {}) {
    const id = instanceId || DEFAULT_INSTANCE_ID;
    const instance = this.instances.get(id);

    if (instance) {
      logger.info({ instanceId: id, userInitiated }, 'Removing PTY instance');
      instance.stop();
      this.instances.delete(id);
      this.lastAccessTime.delete(id);
      if (userInitiated) {
        this._rememberUserStop(id);
      }
      return true;
    }

    return false;
  }

  /**
   * Remember that the user stopped this instance, without removing it. Call
   * this from any path where the user stops a session but the manager object
   * survives (POST /api/pty/stop): PtyManager.stop() sets stoppedByUser on
   * the manager, but that flag dies with the object, and idle cleanup evicts
   * a stopped instance with no listeners after 30 minutes. Without this
   * record, the next get() builds a manager with stoppedByUser back to false
   * and set-instance restarts the session the user deliberately ended.
   * @param {string} instanceId - The instance identifier
   */
  recordUserStop(instanceId) {
    const id = instanceId || DEFAULT_INSTANCE_ID;
    this._rememberUserStop(id);
  }

  /**
   * Record (or refresh) the remembered stop for an id, keeping the map bounded.
   *
   * Two things happen here, and both are load-bearing:
   *
   * 1. delete-then-set, never a bare set. A Map iterates in insertion order,
   *    so re-inserting moves the id to the back of the queue and leaves the
   *    map ordered least- to most-recently-touched. The timestamp is the same
   *    fact in readable form (logs, /api debugging) - nothing branches on it,
   *    which is the point: elapsed time must never expire a stop.
   * 2. Capacity eviction from the front. Ids are minted per tab
   *    (`inst-<Date.now()>-<random>`) and never reused, so without a bound
   *    every stop of a since-deleted tab would sit in this map for the life of
   *    the relay process - months, on a PM2 host. Evicting the least recently
   *    consulted entry drops exactly those: a record for a tab the user still
   *    has is refreshed by that tab's next set-instance (see get()).
   *
   * The cost of a wrong eviction is bounded and recoverable - the id auto-
   * starts again on its next set-instance, i.e. the same behaviour as before
   * the user stopped it - and it takes MAX_USER_STOP_RECORDS stops of *other*
   * ids, with no intervening connect from the affected tab, to get there.
   * @param {string} id - The resolved instance identifier
   */
  _rememberUserStop(id) {
    this.stoppedByUserAt.delete(id);
    this.stoppedByUserAt.set(id, Date.now());

    while (this.stoppedByUserAt.size > MAX_USER_STOP_RECORDS) {
      const oldest = this.stoppedByUserAt.keys().next().value;
      this.stoppedByUserAt.delete(oldest);
      logger.info(
        { instanceId: oldest, limit: MAX_USER_STOP_RECORDS },
        'Evicting least recently consulted user-stop record'
      );
    }
  }

  /**
   * Clear the remembered "stopped by user" intent for an instance id. Call
   * this from any code path where the user deliberately starts a session -
   * every route/handler that calls PtyManager.start() in direct response to
   * explicit user action (POST /api/pty/start, POST /api/pty/restart,
   * POST /api/instances with autoStart, and the WS 'restart' message).
   * PtyManager.start() already clears the manager-local stoppedByUser flag,
   * but that has no effect on this registry-level record, which is what
   * seeds a *future* manager after another remove()+get() cycle. Safe to
   * call even when the id was never recorded (no-op).
   */
  clearUserStop(instanceId) {
    const id = instanceId || DEFAULT_INSTANCE_ID;
    this.stoppedByUserAt.delete(id);
  }

  /**
   * List all instances with their status
   * @returns {Array<Object>} Array of instance info objects
   */
  listInstances() {
    const result = [];
    for (const [id, instance] of this.instances) {
      result.push({
        instanceId: id,
        ...instance.getStatus(),
        lastAccessTime: this.lastAccessTime.get(id),
        idleMs: Date.now() - (this.lastAccessTime.get(id) || 0),
      });
    }
    return result;
  }

  /**
   * Get count of active instances
   * @returns {number}
   */
  getInstanceCount() {
    return this.instances.size;
  }

  /**
   * Clean up idle instances that haven't been accessed recently
   */
  cleanupIdleInstances() {
    const now = Date.now();
    const toRemove = [];

    for (const [id, lastAccess] of this.lastAccessTime) {
      const idleTime = now - lastAccess;
      const instance = this.instances.get(id);

      // Don't remove busy (running or starting) instances or instances with connected clients
      if (instance && !instance.isBusy && instance.listeners.size === 0 && idleTime > IDLE_TIMEOUT_MS) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      logger.info({ instanceId: id, idleMs: now - this.lastAccessTime.get(id) }, 'Cleaning up idle instance');
      // Not userInitiated: this is housekeeping eviction of an idle instance,
      // not the user stopping it, so it must remain free to auto-start.
      this.remove(id);
    }

    if (toRemove.length > 0) {
      logger.info({ removed: toRemove.length, remaining: this.instances.size }, 'Idle instance cleanup complete');
    }

    // stoppedByUserAt is deliberately NOT pruned here. A stop is a decision,
    // not a cache entry: expiring it after 30 minutes means the next app
    // launch silently restarts every CLI the user stopped, which is exactly
    // what the record exists to prevent. Elapsed time is the wrong key, and
    // this sweep has nothing else to offer - an id is absent from
    // this.instances both when its tab is gone for good and when the tab is
    // merely closed or the phone is asleep, and only the first of those may
    // forget.
    //
    // Growth is bounded elsewhere, on the write path: _rememberUserStop()
    // caps the map at MAX_USER_STOP_RECORDS and evicts by least-recently-
    // consulted, and clearUserStop() removes an entry as soon as the user
    // starts that session again.
  }

  /**
   * Remove the oldest idle instance
   * @returns {boolean} Whether an instance was removed
   */
  removeOldestIdle() {
    let oldestId = null;
    let oldestTime = Infinity;

    for (const [id, lastAccess] of this.lastAccessTime) {
      const instance = this.instances.get(id);
      // Only consider stopped (not busy) instances with no listeners
      if (instance && !instance.isBusy && instance.listeners.size === 0 && lastAccess < oldestTime) {
        oldestId = id;
        oldestTime = lastAccess;
      }
    }

    if (oldestId) {
      // Not userInitiated: eviction to make room for a new instance under
      // MAX_INSTANCES is housekeeping, not the user stopping this session.
      return this.remove(oldestId);
    }

    return false;
  }

  /**
   * Stop all instances and clean up
   */
  shutdown() {
    logger.info({ count: this.instances.size }, 'Shutting down all PTY instances');

    clearInterval(this.cleanupInterval);

    for (const [id, instance] of this.instances) {
      try {
        instance.saveBuffer();
        instance.stop();
      } catch (err) {
        logger.error({ instanceId: id, error: err.message }, 'Error stopping instance during shutdown');
      }
    }

    this.instances.clear();
    this.lastAccessTime.clear();
  }

  /**
   * Get the default instance (backward compatibility)
   * @returns {PtyManager|null}
   */
  getDefault() {
    return this.instances.get(DEFAULT_INSTANCE_ID) || null;
  }
}

// Singleton registry
const ptyRegistry = new PtyRegistry();

module.exports = ptyRegistry;
module.exports.DEFAULT_INSTANCE_ID = DEFAULT_INSTANCE_ID;
module.exports.MAX_USER_STOP_RECORDS = MAX_USER_STOP_RECORDS;
