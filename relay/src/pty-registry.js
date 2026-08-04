const PtyManager = require('./pty-manager');
const logger = require('./logger');
const config = require('./config');

// Maximum number of concurrent PTY instances
const MAX_INSTANCES = config.pty.maxInstances;

// Idle timeout for cleanup (30 minutes)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// Default instance ID for backward compatibility
const DEFAULT_INSTANCE_ID = 'default';

// "The user stopped this session" lives on the PtyManager object
// (PtyManager.stoppedByUser) and nowhere else. It therefore lasts exactly as
// long as that manager does: a relay restart or an idle eviction forgets it,
// and the next set-instance for that id is free to auto-start.
//
// An earlier revision tried to outlive the manager with a registry-level map
// of stopped ids. It was rewritten four times - expiring too eagerly, then
// never expiring, then evictable in a way that silently resurrected a stopped
// CLI - and each attempt to bound it broke something else. The map is gone.
// Callers that need a stop to stick must keep the manager alive
// (POST /api/pty/stop) rather than removing it; the app no longer reconnects a
// tab after a removal, so nothing re-sends set-instance for a manager-less id.

class PtyRegistry {
  constructor() {
    this.instances = new Map(); // instanceId -> PtyManager
    // instanceId -> timestamp. Every key here has a matching key in
    // this.instances; get() maintains that invariant, and remove() is the
    // only thing that deletes from either.
    this.lastAccessTime = new Map();

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

    // Return existing instance if available
    if (this.instances.has(id)) {
      this.lastAccessTime.set(id, Date.now());
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
        // Nothing has been written for this id yet, and that is deliberate:
        // lastAccessTime is only ever cleaned by remove(), which needs a
        // matching entry in this.instances, so a timestamp written for an
        // instance that was then never created would be uncollectable - it
        // survives idle cleanup (which requires `instance &&`) and grows the
        // map once per rejected connect for the life of the process. Write
        // the timestamp only on the paths that end with a live instance.
        throw new Error(`Maximum instances (${MAX_INSTANCES}) reached`);
      }
    }

    // Create new instance
    logger.info({ instanceId: id, workingDir }, 'Creating new PTY instance');
    const instance = new PtyManager(id, cliType);
    this.instances.set(id, instance);
    this.lastAccessTime.set(id, Date.now());

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
   * Removing destroys the PtyManager, and with it any stoppedByUser flag: the
   * next get() for this id builds a manager that will auto-start again. Where
   * a stop has to survive, keep the manager and call PtyManager.stop()
   * (POST /api/pty/stop) instead of removing it.
   * @param {string} instanceId - The instance identifier
   * @returns {boolean} Whether an instance was removed
   */
  remove(instanceId) {
    const id = instanceId || DEFAULT_INSTANCE_ID;
    const instance = this.instances.get(id);

    if (instance) {
      logger.info({ instanceId: id }, 'Removing PTY instance');
      instance.stop();
      this.instances.delete(id);
      this.lastAccessTime.delete(id);
      return true;
    }

    return false;
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
      this.remove(id);
    }

    if (toRemove.length > 0) {
      logger.info({ removed: toRemove.length, remaining: this.instances.size }, 'Idle instance cleanup complete');
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
