#!/usr/bin/env node
/* global process */

/**
 * Android Build Script
 *
 * Usage:
 *   node scripts/android-build.js local            - Build local app (local backend)
 *   node scripts/android-build.js local-livereload - Live reload with local dev server
 *   node scripts/android-build.js dev              - Build dev app (GCP dev backend)
 *   node scripts/android-build.js prod             - Build prod app (GCP prod backend)
 */

import { readFileSync, writeFileSync } from 'fs';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createConnection } from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDir = join(__dirname, '..');
const configPath = join(frontendDir, 'capacitor.config.json');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgYellow: '\x1b[43m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

// Environment configurations
const APP_ID_BASE = 'com.claudecode.pocket';
const APP_NAME = 'Claude Pocket';

const configs = {
  local: {
    appId: `${APP_ID_BASE}.local`,
    appName: `${APP_NAME} (local)`,
    webDir: 'dist',
    server: {
      androidScheme: 'http',
      cleartext: true
    },
    color: colors.blue,
    bgColor: colors.bgBlue,
    emoji: '🔵',
    backend: 'Local relay (10.0.2.2:4501)',
    flavor: 'local',
    buildMode: 'android-local'
  },
  'local-livereload': {
    appId: `${APP_ID_BASE}.local`,
    appName: `${APP_NAME} (local)`,
    webDir: 'dist',
    server: {
      url: 'http://10.0.2.2:4500',
      cleartext: true
    },
    color: colors.blue,
    bgColor: colors.bgBlue,
    emoji: '🔵',
    backend: 'Local relay (10.0.2.2:4500 live-reload)',
    liveReload: true
  },
  dev: {
    appId: `${APP_ID_BASE}.dev`,
    appName: `${APP_NAME} (dev)`,
    webDir: 'dist',
    server: {
      androidScheme: 'http',
      cleartext: true
    },
    color: colors.yellow,
    bgColor: colors.bgYellow,
    emoji: '🟡',
    backend: 'Minibox DEV relay (:4503)',
    buildMode: 'production'  // Uses .env.production which has DEV relay URL
  },
  prod: {
    appId: APP_ID_BASE,
    appName: APP_NAME,
    webDir: 'dist',
    server: {
      androidScheme: 'http',
      cleartext: true
    },
    color: colors.green,
    bgColor: colors.bgGreen,
    emoji: '🟢',
    backend: 'Minibox PROD relay (:4501)',
    buildMode: 'production'
  }
};

// Get environment from command line
const env = process.argv[2];

if (!env || !configs[env]) {
  console.error(`${colors.red}Usage: node scripts/android-build.js <local|local-livereload|dev|prod>${colors.reset}`);
  console.error('  local            - Build app pointing to local backend');
  console.error('  local-livereload - Live reload with local dev server (requires npm run dev:local)');
  console.error('  dev              - Build dev app (GCP dev backend)');
  console.error('  prod             - Build prod app (GCP prod backend)');
  process.exit(1);
}

const config = configs[env];

// Print a large banner
function printBanner() {
  const envUpper = env.toUpperCase();
  const width = 50;
  const line = '═'.repeat(width);

  console.log('');
  console.log(`${config.color}╔${line}╗${colors.reset}`);
  console.log(`${config.color}║${colors.reset}${config.bgColor}${colors.bright}${centerText(`${config.emoji}  ${envUpper} BUILD  ${config.emoji}`, width)}${colors.reset}${config.color}║${colors.reset}`);
  console.log(`${config.color}╠${line}╣${colors.reset}`);
  console.log(`${config.color}║${colors.reset}  ${colors.bright}App:${colors.reset}     ${config.appName.padEnd(width - 12)}${config.color}║${colors.reset}`);
  console.log(`${config.color}║${colors.reset}  ${colors.bright}ID:${colors.reset}      ${config.appId.padEnd(width - 12)}${config.color}║${colors.reset}`);
  console.log(`${config.color}║${colors.reset}  ${colors.bright}Backend:${colors.reset} ${config.backend.padEnd(width - 12)}${config.color}║${colors.reset}`);
  console.log(`${config.color}║${colors.reset}  ${colors.bright}Flavor:${colors.reset}  ${env.padEnd(width - 12)}${config.color}║${colors.reset}`);
  console.log(`${config.color}╚${line}╝${colors.reset}`);
  console.log('');
}

function centerText(text, width) {
  const padding = Math.max(0, width - text.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

// Status logging
function logStep(status, message) {
  const icons = {
    pending: `${colors.dim}[ ]${colors.reset}`,
    running: `${colors.cyan}[▶]${colors.reset}`,
    success: `${colors.green}[✓]${colors.reset}`,
    error: `${colors.red}[✗]${colors.reset}`,
    warning: `${colors.yellow}[!]${colors.reset}`,
  };
  console.log(`${icons[status]} ${message}`);
}

// Check if a port is in use
function checkPort(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: 'localhost' });
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });
}

// Pre-flight checks for local mode
async function preFlightCheck() {
  // Skip for non-local modes
  if (env !== 'local' && env !== 'local-livereload') return true;

  console.log(`${colors.bright}Pre-flight Checks${colors.reset}`);
  console.log('─'.repeat(40));

  if (env === 'local-livereload') {
    // Live reload needs both frontend and backend
    const frontendRunning = await checkPort(4500);
    const backendRunning = await checkPort(4501);

    if (frontendRunning) {
      logStep('success', 'Frontend dev server running on port 4500');
    } else {
      logStep('error', 'Frontend dev server NOT running on port 4500');
    }

    if (backendRunning) {
      logStep('success', 'Backend dev server running on port 4501');
    } else {
      logStep('error', 'Backend dev server NOT running on port 4501');
    }

    console.log('');

    if (!frontendRunning || !backendRunning) {
      console.log(`${colors.red}${colors.bright}ERROR: Dev servers not running!${colors.reset}`);
      console.log('');
      console.log(`${colors.yellow}Start them first with:${colors.reset}`);
      console.log(`  ${colors.cyan}npm run dev:local${colors.reset}`);
      console.log('');
      console.log('Then run this command again in a separate terminal.');
      console.log('');
      return false;
    }
  } else {
    // local build only needs backend running (when testing)
    const backendRunning = await checkPort(4501);

    if (backendRunning) {
      logStep('success', 'Backend dev server running on port 4501');
    } else {
      logStep('warning', 'Backend dev server NOT running on port 4501');
      console.log(`  ${colors.dim}Start it with: npm run dev:backend${colors.reset}`);
    }

    console.log('');
  }

  return true;
}

// Check for uncommitted changes
function checkGitStatus() {
  if (env === 'local' || env === 'local-livereload') return; // Skip for local modes

  try {
    const status = execSync('git status --porcelain', { cwd: frontendDir, encoding: 'utf-8' });
    if (status.trim()) {
      logStep('warning', `Uncommitted changes detected (building anyway)`);
    }
  } catch {
    // Git not available, skip check
  }
}

// Save original config for restoration
const originalConfig = readFileSync(configPath, 'utf-8');

// Write the new config
function writeConfig() {
  // Extract display-only properties, keep only Capacitor config
  const cleanConfig = {
    appId: config.appId,
    appName: config.appName,
    webDir: config.webDir,
    server: config.server
  };
  logStep('success', 'Capacitor config updated');
  writeFileSync(configPath, JSON.stringify(cleanConfig, null, 2));
}

// Restore original config
function restoreConfig() {
  logStep('success', 'Capacitor config restored');
  writeFileSync(configPath, originalConfig);
}

// Run a command and return a promise
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    logStep('running', `${command} ${args.join(' ')}`);
    const proc = spawn(command, args, {
      cwd: frontendDir,
      stdio: 'inherit',
      shell: true,
      ...options
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    proc.on('error', reject);
  });
}

// Print Android Studio instructions
function printAndroidStudioInstructions() {
  const variantName = `${env}Debug`;

  console.log('');
  console.log(`${colors.bright}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}  ANDROID STUDIO INSTRUCTIONS${colors.reset}`);
  console.log(`${colors.bright}═══════════════════════════════════════════════════${colors.reset}`);
  console.log('');
  console.log(`  1. ${colors.cyan}Build Variants${colors.reset} panel (bottom-left corner)`);
  console.log(`  2. Select: ${config.color}${colors.bright}${variantName}${colors.reset}`);
  console.log(`  3. Click ${colors.green}▶ Run${colors.reset} (green play button)`);
  console.log('');
  console.log(`  ${colors.dim}Tip: Check Settings > App Info in the app to verify${colors.reset}`);
  console.log('');
}

// Main execution
async function main() {
  printBanner();

  // Pre-flight check for local mode
  const preflight = await preFlightCheck();
  if (!preflight) {
    process.exit(1);
  }

  // Check git status for non-local builds
  checkGitStatus();

  writeConfig();

  // Handle cleanup on exit
  const cleanup = () => {
    restoreConfig();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Android flavor - use override if specified, otherwise match env name
    const flavor = config.flavor || env;

    if (config.liveReload) {
      // Live reload mode
      console.log(`${colors.bright}Starting Live Reload${colors.reset}`);
      console.log('─'.repeat(40));
      logStep('running', 'Starting Android with live reload...');
      console.log('');
      await runCommand('npx', ['cap', 'run', 'android', '--flavor', flavor, '--live-reload', '--port', '4500']);
    } else {
      // Build mode: build and sync
      const mode = config.buildMode || (env === 'dev' ? 'dev' : 'production');

      console.log(`${colors.bright}Build Steps${colors.reset}`);
      console.log('─'.repeat(40));

      logStep('running', `Building frontend (mode: ${mode})...`);
      await runCommand('npm', ['run', 'build', '--', '--mode', mode]);
      logStep('success', 'Frontend build complete');

      logStep('running', 'Syncing to Android...');
      await runCommand('npx', ['cap', 'sync', 'android']);
      logStep('success', 'Android sync complete');

      console.log('');
      console.log(`${colors.green}${colors.bright}BUILD COMPLETE!${colors.reset}`);

      printAndroidStudioInstructions();

      // Auto-open Android Studio
      logStep('running', 'Opening Android Studio...');
      await runCommand('npx', ['cap', 'open', 'android']);
      logStep('success', 'Android Studio opened');
    }
  } catch (error) {
    console.log('');
    logStep('error', `Build failed: ${error.message}`);
    restoreConfig();
    process.exit(1);
  }

  // For non-live-reload builds, restore config after completion
  if (!config.liveReload) {
    restoreConfig();
  }
}

main();
