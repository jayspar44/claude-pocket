#!/usr/bin/env node
/* global process */

/**
 * APK Build Script
 *
 * Builds an Android APK via Gradle and optionally copies it to an output directory.
 *
 * Usage:
 *   node scripts/build-apk.js [flavor] [buildType]
 *
 * Arguments:
 *   flavor    - local, dev, prod (default: dev)
 *   buildType - debug, release (default: debug)
 *
 * Examples:
 *   node scripts/build-apk.js              # Build devDebug
 *   node scripts/build-apk.js dev debug    # Build devDebug
 *   node scripts/build-apk.js local debug  # Build localDebug
 *   node scripts/build-apk.js prod release # Build prodRelease
 */

import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDir = join(__dirname, '..');
const androidDir = join(frontendDir, 'android');
const configPath = join(frontendDir, 'capacitor.config.json');

// Base output directory for all builds
const BUILDS_BASE = '/Users/jayspar/Documents/projects/claude-pocket-outputs';

// APK_OUTPUT_PATH determined after flavor is parsed (below)

// App configuration
const APP_ID_BASE = 'com.claudecode.pocket';
const APP_NAME = 'Claude Pocket';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Valid flavors and build types
const VALID_FLAVORS = ['local', 'dev', 'prod'];
const VALID_BUILD_TYPES = ['debug', 'release'];

// Flavor configurations (matching android-build.js)
const flavorConfigs = {
  local: {
    appId: `${APP_ID_BASE}.local`,
    appName: `${APP_NAME} (local)`,
    server: { androidScheme: 'http', cleartext: true },
    buildMode: 'android-local'
  },
  dev: {
    appId: `${APP_ID_BASE}.dev`,
    appName: `${APP_NAME} (dev)`,
    server: { androidScheme: 'http', cleartext: true },
    buildMode: 'production'  // Uses .env.production which has DEV relay URL
  },
  prod: {
    appId: APP_ID_BASE,
    appName: APP_NAME,
    server: { androidScheme: 'http', cleartext: true },
    buildMode: 'production'
  }
};

// Parse command line arguments
const flavor = process.argv[2] || 'dev';
const buildType = process.argv[3] || 'debug';

// Validate arguments
if (!VALID_FLAVORS.includes(flavor)) {
  console.error(`${colors.red}Invalid flavor: ${flavor}${colors.reset}`);
  console.error(`Valid flavors: ${VALID_FLAVORS.join(', ')}`);
  process.exit(1);
}

if (!VALID_BUILD_TYPES.includes(buildType)) {
  console.error(`${colors.red}Invalid build type: ${buildType}${colors.reset}`);
  console.error(`Valid build types: ${VALID_BUILD_TYPES.join(', ')}`);
  process.exit(1);
}

// Output path based on flavor (prod builds go to prod/, local/dev builds go to dev/)
const APK_OUTPUT_PATH = process.env.APK_OUTPUT_PATH || join(BUILDS_BASE, flavor === 'prod' ? 'prod' : 'dev');

// Get version from package.json
function getVersion() {
  const packageJson = JSON.parse(readFileSync(join(frontendDir, 'package.json'), 'utf-8'));
  return packageJson.version;
}

// Generate timestamp in format YYYYMMDD-HHmm
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}`;
}

// Status logging
function logStep(status, message) {
  const icons = {
    pending: `${colors.dim}[ ]${colors.reset}`,
    running: `${colors.cyan}[>]${colors.reset}`,
    success: `${colors.green}[+]${colors.reset}`,
    error: `${colors.red}[x]${colors.reset}`,
    warning: `${colors.yellow}[!]${colors.reset}`,
  };
  console.log(`${icons[status]} ${message}`);
}

// Print banner
function printBanner() {
  const version = getVersion();
  const config = flavorConfigs[flavor];
  const gradleTask = `assemble${capitalize(buildType)}`;

  console.log('');
  console.log(`${colors.bright}========================================${colors.reset}`);
  console.log(`${colors.bright}  APK BUILD: ${flavor} ${buildType} (v${version})${colors.reset}`);
  console.log(`${colors.bright}========================================${colors.reset}`);
  console.log(`  App ID:     ${config.appId}`);
  console.log(`  App Name:   ${config.appName}`);
  console.log(`  Build Type: ${buildType}`);
  console.log(`  Gradle:     ${gradleTask}`);
  console.log(`  Output:     ${APK_OUTPUT_PATH}`);
  console.log('');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Save original config for restoration
let originalConfig;

// Path to build.gradle and version tracking file
const buildGradlePath = join(androidDir, 'app', 'build.gradle');
const versionTrackingPath = join(frontendDir, 'android-version.json');

// Update version tracking file (called BEFORE frontend build so app includes correct versionCode)
function updateVersionTracking() {
  // Read persisted versionCode or start at 0
  let currentVersionCode = 0;
  if (existsSync(versionTrackingPath)) {
    try {
      const tracking = JSON.parse(readFileSync(versionTrackingPath, 'utf-8'));
      currentVersionCode = tracking.versionCode || 0;
    } catch {
      // Ignore parse errors, start fresh
    }
  }

  const newVersionCode = currentVersionCode + 100;

  // Save new versionCode to tracking file (frontend will read this during build)
  writeFileSync(versionTrackingPath, JSON.stringify({ versionCode: newVersionCode }, null, 2));
  logStep('success', `Updated versionCode: ${currentVersionCode} → ${newVersionCode}`);

  return newVersionCode;
}

// Update build.gradle with versionCode (called AFTER cap sync)
function updateBuildGradle(newVersionCode) {
  const version = getVersion();
  const buildGradle = readFileSync(buildGradlePath, 'utf-8');
  const updatedGradle = buildGradle
    .replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);

  writeFileSync(buildGradlePath, updatedGradle);
  logStep('success', `Updated build.gradle: versionCode ${newVersionCode}, versionName ${version}`);
}

// Write the Capacitor config for the build
function writeConfig() {
  originalConfig = readFileSync(configPath, 'utf-8');
  const config = flavorConfigs[flavor];
  const capConfig = {
    appId: config.appId,
    appName: config.appName,
    webDir: 'dist',
    server: config.server,
    plugins: {
      Keyboard: {
        resize: 'native',
        style: 'dark',
        resizeOnFullScreen: true
      },
      StatusBar: {
        overlay: true
      },
      SystemBars: {
        insetsHandling: 'disable'
      },
      LocalNotifications: {
        smallIcon: 'ic_notification',
        sound: 'default'
      }
    }
  };
  writeFileSync(configPath, JSON.stringify(capConfig, null, 2));
  logStep('success', 'Capacitor config updated');
}

// Restore original config
function restoreConfig() {
  if (originalConfig) {
    writeFileSync(configPath, originalConfig);
    logStep('success', 'Capacitor config restored');
  }
}

// Run a command and return a promise
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    logStep('running', `${command} ${args.join(' ')}`);
    const proc = spawn(command, args, {
      cwd: options.cwd || frontendDir,
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

// Main execution
async function main() {
  printBanner();

  const version = getVersion();
  const timestamp = getTimestamp();
  // Standard Capacitor build (no product flavors)
  const gradleTask = `assemble${capitalize(buildType)}`;

  // APK source path (standard Capacitor output, no flavors)
  const apkFileName = `app-${buildType}.apk`;
  const apkSourcePath = join(androidDir, 'app', 'build', 'outputs', 'apk', buildType, apkFileName);

  // APK destination path with versioned name
  const destFileName = `${APP_NAME}-${flavor}-${buildType}-v${version}-${timestamp}.apk`;
  const apkDestPath = join(APK_OUTPUT_PATH, destFileName);

  // Setup cleanup handler
  const cleanup = () => {
    restoreConfig();
    process.exit(1);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Step 1: Update Capacitor config
    writeConfig();

    // Step 1b: Update version tracking file (so frontend build includes correct versionCode)
    const versionCode = updateVersionTracking();

    // Step 2: Build frontend
    const buildMode = flavorConfigs[flavor].buildMode;
    logStep('running', `Building frontend (mode: ${buildMode})...`);
    await runCommand('npm', ['run', 'build', '--', '--mode', buildMode]);
    logStep('success', 'Frontend build complete');

    // Step 3: Sync Capacitor
    logStep('running', 'Syncing Capacitor...');
    await runCommand('npx', ['cap', 'sync', 'android']);
    logStep('success', 'Capacitor sync complete');

    // Step 3b: Patch Android (network security config, etc.)
    logStep('running', 'Patching Android...');
    await runCommand('node', ['scripts/patch-android.js']);
    logStep('success', 'Android patched');

    // Step 3c: Update Android build.gradle with versionCode
    updateBuildGradle(versionCode);

    // Step 4: Run Gradle build (platform-specific)
    logStep('running', `Running Gradle: ${gradleTask}...`);
    const gradleCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
    await runCommand(gradleCmd, [gradleTask], { cwd: androidDir });
    logStep('success', 'Gradle build complete');

    // Restore config before copying
    restoreConfig();

    // Step 5: Verify APK exists
    if (!existsSync(apkSourcePath)) {
      throw new Error(`APK not found at: ${apkSourcePath}`);
    }
    logStep('success', `APK built: ${apkFileName}`);

    // Step 6: Ensure output folder exists
    if (!existsSync(APK_OUTPUT_PATH)) {
      mkdirSync(APK_OUTPUT_PATH, { recursive: true });
      logStep('success', `Created directory: ${APK_OUTPUT_PATH}`);
    }

    // Step 7: Copy APK to output directory
    logStep('running', 'Copying APK to output directory...');
    copyFileSync(apkSourcePath, apkDestPath);
    logStep('success', `APK copied to: ${destFileName}`);

    // Success message
    console.log('');
    console.log(`${colors.green}${colors.bright}========================================${colors.reset}`);
    console.log(`${colors.green}${colors.bright}  BUILD SUCCESSFUL!${colors.reset}`);
    console.log(`${colors.green}${colors.bright}========================================${colors.reset}`);
    console.log('');
    console.log(`  ${colors.bright}Source:${colors.reset}`);
    console.log(`    ${apkSourcePath}`);
    console.log('');
    console.log(`  ${colors.bright}Destination:${colors.reset}`);
    console.log(`    ${apkDestPath}`);
    console.log('');

  } catch (error) {
    console.log('');
    logStep('error', `Build failed: ${error.message}`);
    restoreConfig();
    process.exit(1);
  }
}

main();
