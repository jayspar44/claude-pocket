const PtyManager = require('./pty-manager');
const logger = require('./logger');
const config = require('./config');

// Maximum number of concurrent PTY instances
const MAX_INSTANCES = config.pty.maxInstances;

// Idle timeout for cleanup (30 minutes)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// Default instance ID for backward compatibility
const DEFAULT_INSTANCE_ID = 'default';

class PtyRegistry {
  constructor() {
    this.instances = new Map(); // instanceId -> PtyManager
    this.lastAccessTime = new Map(); // instanceId -> timestamp

    // instanceId -> timestamp of a user-initiated remove(). PtyManager.stop()
    // sets stoppedByUser on the manager object itself, but remove() deletes
    // that object entirely - without this, a later get() would construct a
    // brand-new manager with stoppedByUser defaulting back to false, and
    // set-instance would silently restart a session the user just stopped.
    // Only remove() calls that pass { userInitiated: true } record here -
    // housekeeping eviction (cleanupIdleInstances, removeOldestIdle) must
    // NOT, or an idle-evicted instance would stop being able to auto-start.
    // Pruned in cleanupIdleInstances() so an id nobody revisits doesn't
    // linger forever; cleared by clearUserStop() on any deliberate start.
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
        this.stoppedByUserAt.set(id, Date.now());
      }
      return true;
    }

    return false;
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

    // Bound stoppedByUserAt's growth: an id nobody has revisited within the
    // same idle window is forgotten, so a user who stops a session and never
    // comes back doesn't leave an entry sitting there forever.
    for (const [id, stoppedAt] of this.stoppedByUserAt) {
      if (now - stoppedAt > IDLE_TIMEOUT_MS) {
        this.stoppedByUserAt.delete(id);
      }
    }
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
