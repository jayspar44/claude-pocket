const path = require('path');

const config = {
  // Server configuration
  port: parseInt(process.env.PORT, 10) || 4501,
  host: process.env.HOST || '0.0.0.0',

  // Claude Code working directory
  workingDir: process.env.WORKING_DIR || process.env.HOME,

  // PTY configuration
  pty: {
    shell: process.env.SHELL || '/bin/zsh',
    cols: 80,
    rows: 24,
    cwd: process.env.WORKING_DIR || process.env.HOME,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  },

  // Output buffer configuration (for session resumption)
  buffer: {
    maxLines: 500,
    maxSize: 1024 * 1024, // 1MB max buffer size
  },

  // CORS configuration - allow all origins for development
  cors: {
    // Use callback function to properly reflect origin with credentials
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : (origin, callback) => {
          // Allow all origins - reflect the request origin back
          callback(null, origin || '*');
        },
    credentials: true,
  },

  // WebSocket configuration
  ws: {
    path: '/ws',
    pingInterval: 30000,
    pingTimeout: 10000,
  },

  // Claude Code command
  claudeCommand: process.env.CLAUDE_COMMAND || 'claude',
};

module.exports = config;
