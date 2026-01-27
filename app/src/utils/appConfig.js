/**
 * Get the app version
 * @returns {string} App version
 */
export const getAppVersion = () => {
  return '0.1.0';
};

/**
 * Detect the current environment
 * @returns {'prod' | 'dev' | 'local'} Current environment
 */
export const getEnvironment = () => {
  // Local development (vite dev server)
  if (import.meta.env.DEV) {
    return 'local';
  }
  // Use VITE_APP_ENV if set (distinguishes DEV from PROD builds)
  if (import.meta.env.VITE_APP_ENV) {
    return import.meta.env.VITE_APP_ENV;
  }
  // Fallback to prod for production builds
  return 'prod';
};
