const config = {
  // Server configuration
  port: parseInt(process.env.PORT, 10) || 4501,
  host: process.env.HOST || '0.0.0.0',

  // PTY configuration
  pty: {
    shell: process.env.SHELL || '/bin/zsh',
    cols: 50,
    rows: 24,
    cwd: null, // Set at start time from app Settings
    // `|| 10` (not a '10' default inside parseInt): a non-numeric
    // MAX_INSTANCES parses to NaN, and `size >= NaN` is always false, which
    // silently removes the instance cap altogether. Same pattern as `port`.
    maxInstances: parseInt(process.env.MAX_INSTANCES, 10) || 10,
    env: (() => {
      const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
      // Strip CLAUDECODE to prevent "nested session" error when relay runs inside Claude
      delete env.CLAUDECODE;
      // The CLIs spawned here are independent, long-lived top-level sessions, but
      // PM2 captures its environment at `pm2 start` - so deploying from Claude
      // Code's Bash tool (which `npm run deploy` is, via /deploy) bakes that tool's
      // CLAUDE_CODE_CHILD_SESSION=1 into the relay and every PTY beneath it. The
      // CLI then classifies itself as nested and drops out of --resume, --continue,
      // prompt history and `claude agents`, so a crash becomes unrecoverable.
      // Only this variable is stripped: the other inherited CLAUDE_CODE_* vars have
      // run in production for months with no observed effect.
      delete env.CLAUDE_CODE_CHILD_SESSION;
      return env;
    })(),
  },

  // Output buffer configuration (for session resumption)
  buffer: {
    // Size is the binding cap; the line cap is only a backstop.
    //
    // maxLines counts newlines in the raw PTY stream, and a full-screen TUI
    // pads every repainted frame with blank rows - so those newlines are
    // mostly not content. Measured on live buffers sitting at the old 4500-line
    // cap: 9-17% of the lines were non-empty, at 12-18 bytes each. A session
    // that had not yet hit the cap ran 84% non-empty at 44 bytes. So the cap
    // was evicting real history down to roughly 400-700 visible lines while the
    // buffer held 75KB against a 5MB limit - 1.5% of its byte budget. The old
    // comment here claimed 4500 lines "nearly matches client xterm.js
    // scrollback (5000)", which was the mistaken premise: raw stream newlines
    // are nowhere near rendered rows.
    //
    // At those ratios 1MB holds ~9000 content rows, comfortably past the
    // client's 5000-row scrollback - so the client is the real limit, which is
    // what we want. The cost is that a replay after a long session is up to
    // 1MB rather than ~75KB.
    maxLines: 100000, // Backstop for a degenerate all-newline stream only
    maxSize: 1024 * 1024, // 1MB - the cap that actually binds
    // Use port-specific filename to avoid conflicts between DEV/PROD relays
    persistPath: `.claude-pocket/output-buffer-${parseInt(process.env.PORT, 10) || 4501}.json`,
    saveDebounceMs: 500, // Debounce buffer saves
  },

  // Long task detection for notifications
  longTask: {
    thresholdMs: 10000,      // 10s for testing (was 60000)
  },

  // CORS configuration. The relay authenticates nobody, so this is the only
  // thing between a page the operator happens to visit and a REST surface that
  // spawns PTYs and reads the filesystem.
  //
  // null means "no allowlist" - ALLOWED_ORIGINS unset or '*'. That stays
  // permissive on purpose: tightening the default would lock out every APK
  // already on a phone, which reaches the relay from a Capacitor origin no
  // operator has listed. index.js compensates by never pairing a reflected
  // origin with a credentials grant.
  cors: {
    allowedOrigins:
      process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS !== '*'
        ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
        : null,
  },

  // WebSocket configuration
  ws: {
    path: '/ws',
    pingInterval: 30000,
    pingTimeout: 10000,
  },

  // CLI commands
  claudeCommand: process.env.CLAUDE_COMMAND || 'claude',
  antigravityCommand: process.env.ANTIGRAVITY_COMMAND || 'agy',
  codexCommand: process.env.CODEX_COMMAND || 'codex',
};

module.exports = config;
