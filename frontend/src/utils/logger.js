const isDev = import.meta.env.DEV;

export const logger = {
    debug: (...args) => isDev && console.log('[DEBUG]', ...args),
    info: (...args) => isDev && console.info('[INFO]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    spoof: (...args) => isDev && console.log('[SPOOF]', ...args),
};
