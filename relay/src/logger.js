const pino = require('pino');

// Only use pino-pretty for local development (NODE_ENV undefined or 'development')
// GCP environments (dev, prod) use structured JSON for Cloud Logging compatibility
const isLocalDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    ...(isLocalDev && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                ignore: 'pid,hostname',
                translateTime: 'HH:MM:ss'
            }
        }
    }),
    // Structured JSON output for cloud environments (dev, prod)
    ...(!isLocalDev && {
        formatters: {
            level: (label) => ({ level: label })
        },
        timestamp: () => `,"time":"${new Date().toISOString()}"`
    })
});

module.exports = logger;
