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
  if (import.meta.env.DEV) {
    return 'local';
  }
  return import.meta.env.PROD ? 'prod' : 'local';
};
