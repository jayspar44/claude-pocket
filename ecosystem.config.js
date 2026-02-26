const path = require('path');

// Ensure ~/.local/bin is in PATH for claude command
const HOME = process.env.HOME || '/Users/jayspar';
const PATH = `${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`;

// Auto-detect environment from folder name
const PROJECT_DIR = path.basename(process.cwd());
const IS_DEV = PROJECT_DIR.endsWith('-dev');

const ENV = IS_DEV ? 'DEV' : 'PROD';
const APP_PORT = IS_DEV ? 4502 : 4500;
const RELAY_PORT = IS_DEV ? 4503 : 4501;
const SUFFIX = IS_DEV ? '-dev' : '';

module.exports = {
  apps: [
    // Relay
    {
      name: `claude-pocket-relay${SUFFIX}`,
      cwd: './relay',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: RELAY_PORT,
        PATH,
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000,
      error_file: `~/.pm2/logs/relay${SUFFIX}-error.log`,
      out_file: `~/.pm2/logs/relay${SUFFIX}-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    // App
    {
      name: `claude-pocket-app${SUFFIX}`,
      cwd: './app',
      script: 'node_modules/.bin/vite',
      args: `preview --host 0.0.0.0 --port ${APP_PORT}`,
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000,
      error_file: `~/.pm2/logs/app${SUFFIX}-error.log`,
      out_file: `~/.pm2/logs/app${SUFFIX}-out.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
