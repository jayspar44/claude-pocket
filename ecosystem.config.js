// Ensure ~/.local/bin is in PATH for claude command
const HOME = process.env.HOME || '/Users/jayspar';
const PATH = `${HOME}/.local/bin:${HOME}/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`;

module.exports = {
  apps: [
    // PROD relay - port 4501
    {
      name: 'claude-pocket-relay',
      cwd: './relay',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4501,
        PATH,
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000,
      error_file: '~/.pm2/logs/relay-error.log',
      out_file: '~/.pm2/logs/relay-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    // DEV relay - port 4502 (separate Claude session)
    {
      name: 'claude-pocket-relay-dev',
      cwd: './relay',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4502,
        PATH,
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000,
      error_file: '~/.pm2/logs/relay-dev-error.log',
      out_file: '~/.pm2/logs/relay-dev-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'claude-pocket-app',
      cwd: './app',
      script: 'node_modules/.bin/vite',
      args: 'preview --host 0.0.0.0 --port 4500',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000,
      error_file: '~/.pm2/logs/app-error.log',
      out_file: '~/.pm2/logs/app-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
