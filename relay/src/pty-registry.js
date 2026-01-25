const PtyManager = require('./pty-manager');
const logger = require('./logger');

// Maximum number of concurrent PTY instances
const MAX_INSTANCES = 10;

// Idle timeout for cleanup (30 minutes)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// Default instance ID for backward compatibility
const DEFAULT_INSTANCE_ID = 'default';

class PtyRegistry {
  constructor() {
    this.instances = new Map(); // instanceId -> PtyManager
    this.lastAccessTime = new Map(); // instanceId -> timestamp

    // Start idle cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupIdleInstances(), 60000);
  }

  /**
   * Get or create a PTY instance by ID
   * @param {string} instanceId - The instance identifier
   * @param {string} workingDir - Working directory (required for new instances)
   * @returns {PtyManager} The PTY manager instance
   */
  get(instanceId, workingDir) {
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
    const instance = new PtyManager(id);
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

      // Don't remove running instances or instances with connected clients
      if (instance && !instance.isRunning && instance.listeners.size === 0 && idleTime > IDLE_TIMEOUT_MS) {
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
      // Only consider stopped instances with no listeners
      if (instance && !instance.isRunning && instance.listeners.size === 0 && lastAccess < oldestTime) {
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
