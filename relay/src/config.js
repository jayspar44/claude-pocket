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
    idleThresholdMs: 800,    // Wait for output to settle before detecting
    expiryMs: 60000,         // Auto-clear options after 60s
    minSubstantiveChars: 50, // Min chars to consider "substantive" output
    bufferLookback: 1500,    // Chars to scan for options
    confidenceThreshold: 30, // Min confidence score to detect options

    // Trigger phrases that indicate options follow
    triggerPhrases: [
      /(?:choose|select|pick)\s+(?:one|an option|from)/i,
      /which\s+(?:one|option|would you)/i,
      /enter\s+(?:your\s+)?choice/i,
      /available\s+options/i,
      /\?\s*$/m, // Question mark at end of line
    ],

    // Number patterns (relaxed - no capital letter required)
    numberPatterns: [
      /^(\d)[.):\]]\s+\S/,     // 1. text, 1) text, 1: text
      /^\[(\d)\]\s+\S/,        // [1] text
      /^\((\d)\)\s+\S/,        // (1) text
      /^[>❯►→]\s*(\d)[.)]\s+\S/, // > 1. text, ❯ 1. text (cursor/selection prefix)
    ],

    // Confidence boosters
    confidencePatterns: [
      /[✔✓✗✘●○]/,              // Status indicators
      /\s+·\s+/,               // Separator dots
      /connected|failed|pending/i, // Status words
    ],
  },

  // Long task detection for notifications
  longTask: {
    thresholdMs: 10000,      // 10s for testing (was 60000)
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
