// Centralized storage with port-based key prefixing
// This ensures PROD (4500) and DEV (4502) apps have isolated localStorage

const MIGRATION_FLAG = 'migrated';

/**
 * Get the current app port from URL
 * Defaults to 4500 (PROD) if no port or standard ports
 */
export function getAppPort() {
  if (typeof window === 'undefined') return '4500';
  const port = window.location.port;
  return (!port || port === '80' || port === '443') ? '4500' : port;
}

/**
 * Prefix a storage key with the app port
 * e.g., 'instances' -> 'cp-4500-instances' (PROD) or 'cp-4502-instances' (DEV)
 */
function prefixKey(key) {
  return `cp-${getAppPort()}-${key}`;
}

// Migration mappings: old key -> new short key
const KEY_MAPPINGS = {
  'claude-pocket-instances': 'instances',
  'claude-pocket-active-instance': 'active-instance',
  'relayUrl': 'relayUrl',
  'claude-working-dir': 'working-dir',
  'claude-recent-dirs': 'recent-dirs',
  'terminalFontSize': 'fontSize',
  'claude-pocket-command-history': 'history',
  'claude-pocket-repo-commands': 'repo-cmds',
  'claude-pocket-notification-settings': 'notifications',
  'app_pref_theme': 'theme',
};

/**
 * Storage utility with automatic port-based key prefixing
 */
export const storage = {
  /**
   * Get a value from localStorage with port-prefixed key
   */
  get(key) {
    return localStorage.getItem(prefixKey(key));
  },

  /**
   * Set a value in localStorage with port-prefixed key
   */
  set(key, value) {
    localStorage.setItem(prefixKey(key), value);
  },

  /**
   * Remove a value from localStorage with port-prefixed key
   */
  remove(key) {
    localStorage.removeItem(prefixKey(key));
  },

  /**
   * Get a JSON value from localStorage, with optional default
   */
  getJSON(key, defaultValue = null) {
    try {
      const val = this.get(key);
      return val ? JSON.parse(val) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  /**
   * Set a JSON value in localStorage
   */
  setJSON(key, value) {
    this.set(key, JSON.stringify(value));
  },
};

/**
 * One-time migration from old unprefixed keys to new port-prefixed keys
 * Called once on app startup
 */
export function migrateStorage() {
  const migrationKey = prefixKey(MIGRATION_FLAG);

  // Already migrated for this port
  if (localStorage.getItem(migrationKey)) return;

  console.log(`[Storage] Migrating localStorage for port ${getAppPort()}`);

  // Migrate each old key to new prefixed key
  for (const [oldKey, newShortKey] of Object.entries(KEY_MAPPINGS)) {
    const oldValue = localStorage.getItem(oldKey);
    if (oldValue !== null) {
      const newKey = prefixKey(newShortKey);
      // Only migrate if new key doesn't exist (don't overwrite)
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldValue);
        console.log(`[Storage] Migrated: ${oldKey} -> ${newKey}`);
      }
    }
  }

  // Mark migration complete for this port
  localStorage.setItem(migrationKey, Date.now().toString());
  console.log(`[Storage] Migration complete for port ${getAppPort()}`);
}

export default storage;
