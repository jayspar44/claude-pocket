/* global __BUILD_TIMESTAMP__ */

/**
 * Get the app version
 * @returns {string} App version from package.json
 */
export const getAppVersion = () => {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
};

/**
 * Detect the current environment
 * @returns {'prod' | 'dev' | 'local'} Current environment
 */
export const getEnvironment = () => {
  // Check if running in dev mode (local development)
  if (import.meta.env.DEV) {
    return 'local';
  }

  // Check API URL to determine if we're in dev or prod
  const apiUrl = import.meta.env.VITE_API_URL || '';

  // Check for local backend (localhost or Android emulator loopback)
  if (apiUrl.includes('localhost') || apiUrl.includes('10.0.2.2')) {
    return 'local';
  }

  if (apiUrl.includes('-dev')) {
    return 'dev';
  }

  if (apiUrl.includes('-prod')) {
    return 'prod';
  }

  // Default to prod for production builds
  return import.meta.env.PROD ? 'prod' : 'local';
};

/**
 * Check if a Date object is valid
 * @param {Date} d - Date to validate
 * @returns {boolean} True if valid date
 */
const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

/**
 * Format build timestamp as yyyy-mm-dd hh:mm (24hr)
 * @returns {string} Formatted build time
 */
const formatBuildTime = () => {
  if (typeof __BUILD_TIMESTAMP__ === 'undefined') return '';
  const d = new Date(__BUILD_TIMESTAMP__);
  if (!isValidDate(d)) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

// Cached backend info from health endpoint
let cachedBackendInfo = null;
let fetchPromise = null; // In-flight promise for deduplication

// Track last code update time (HMR in dev, or page load)
let lastCodeUpdate = new Date();
let hmrListeners = [];

/**
 * Register a callback for HMR updates (to trigger re-renders)
 * @param {function} callback - Function to call on HMR update
 * @returns {function} Unsubscribe function
 */
export const onHmrUpdate = (callback) => {
  hmrListeners.push(callback);
  return () => {
    hmrListeners = hmrListeners.filter(cb => cb !== callback);
  };
};

/**
 * Get the last code update time
 * @returns {Date} Last HMR update or page load time
 */
export const getLastCodeUpdate = () => lastCodeUpdate;

// Listen for Vite HMR updates (only in dev mode)
if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => {
    lastCodeUpdate = new Date();
    hmrListeners.forEach(cb => cb());
  });
}

/**
 * Fetch backend info from health endpoint (cached, with deduplication)
 * Uses the API service wrapper for consistency with project conventions.
 * @returns {Promise<object|null>} Backend info or null if failed
 */
export const fetchBackendInfo = async () => {
  // Return cached result if available
  if (cachedBackendInfo) return cachedBackendInfo;

  // Return in-flight promise to deduplicate concurrent calls
  if (fetchPromise) return fetchPromise;

  // Dynamic import to avoid circular dependency (services imports from utils)
  fetchPromise = (async () => {
    try {
      const { getHealth } = await import('../api/services');
      cachedBackendInfo = await getHealth();
      return cachedBackendInfo;
    } catch {
      return null;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
};

/**
 * Get backend info synchronously (returns cached or null)
 * @returns {object|null} Cached backend info
 */
export const getBackendInfo = () => cachedBackendInfo;

/**
 * Format a date as yyyy-mm-dd hh:mm (24hr)
 * @param {Date} d - Date to format
 * @returns {string} Formatted date string, or 'unknown' if invalid
 */
const formatDateTime = (d) => {
  if (!isValidDate(d)) return 'unknown';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

/**
 * Get formatted version string with environment and build time
 * In local dev: shows most recent of HMR update or backend restart
 * In production: shows backend start time or baked-in build time
 * @returns {string} Formatted version string (e.g., "v0.1.1 (dev) 2026-01-11 15:45")
 */
export const getVersionString = () => {
  const env = getEnvironment();
  const version = cachedBackendInfo?.version || getAppVersion();

  // In local dev mode, show the most recent update time
  if (import.meta.env.DEV) {
    const backendTime = cachedBackendInfo?.serverStartTime ? new Date(cachedBackendInfo.serverStartTime) : null;
    // Use the most recent: HMR update or backend restart
    const latestTime = backendTime && isValidDate(backendTime) && backendTime > lastCodeUpdate ? backendTime : lastCodeUpdate;
    const formatted = formatDateTime(latestTime);
    return `v${version} (${env}) ${formatted}`;
  }

  // Production: use backend start time if available
  if (cachedBackendInfo?.serverStartTime) {
    const d = new Date(cachedBackendInfo.serverStartTime);
    if (isValidDate(d)) {
      return `v${version} (${env}) ${formatDateTime(d)}`;
    }
  }

  // Fallback to baked-in values
  const buildTime = formatBuildTime();
  return `v${version} (${env}) ${buildTime}`;
};
