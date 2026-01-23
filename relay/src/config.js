const config = {
  // Server configuration
  port: parseInt(process.env.PORT, 10) || 4501,
  host: process.env.HOST || '0.0.0.0',

  // PTY configuration
  pty: {
    shell: process.env.SHELL || '/bin/zsh',
    cols: 80,
    rows: 24,
    cwd: null, // Set at start time from app Settings
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  },

  // Output buffer configuration (for session resumption)
  buffer: {
    maxLines: 4500, // Nearly matches client xterm.js scrollback (5000)
    maxSize: 5 * 1024 * 1024, // 5MB max buffer size
    // Use port-specific filename to avoid conflicts between DEV/PROD relays
    persistPath: `.claude-pocket/output-buffer-${parseInt(process.env.PORT, 10) || 4501}.json`,
    saveDebounceMs: 500, // Debounce buffer saves
  },

  // Option detection configuration
  optionDetection: {
    idleThresholdMs: 200,    // Wait for output to settle before detecting
    expiryMs: 30000,         // Auto-clear options after 30s
    minSubstantiveChars: 20, // Min chars to consider "substantive" output
    bufferLookback: 1500,    // Chars to scan for options
  },

  // CORS configuration
  cors: {
    // Use callback function to properly reflect origin with credentials
    origin: process.env.ALLOWED_ORIGINS === '*'
      ? (origin, callback) => callback(null, origin || '*')
      : process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : (origin, callback) => callback(null, origin || '*'),
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
