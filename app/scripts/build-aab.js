#!/usr/bin/env node
/* global process */

/**
 * AAB Build Script
 *
 * Builds an Android App Bundle (AAB) via Gradle for Play Store distribution.
 *
 * Usage:
 *   node scripts/build-aab.js [flavor]
 *
 * Arguments:
 *   flavor - local, dev, prod (default: prod)
 *
 * Examples:
 *   node scripts/build-aab.js              # Build prod AAB
 *   node scripts/build-aab.js prod         # Build prod AAB
 *   node scripts/build-aab.js dev          # Build dev AAB
 *
 * Environment variables for signing (required for release builds):
 *   KEYSTORE_PATH     - Path to keystore file
 *   KEYSTORE_PASSWORD - Keystore password
 *   KEY_ALIAS         - Key alias
 *   KEY_PASSWORD      - Key password
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

// Valid flavors
const VALID_FLAVORS = ['local', 'dev', 'prod'];

// Flavor configurations
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
    buildMode: 'production'
  },
  prod: {
    appId: APP_ID_BASE,
    appName: APP_NAME,
    server: { androidScheme: 'http', cleartext: true },
    buildMode: 'production'
  }
};

// Parse command line arguments
const flavor = process.argv[2] || 'prod';

// Validate arguments
if (!VALID_FLAVORS.includes(flavor)) {
  console.error(`${colors.red}Invalid flavor: ${flavor}${colors.reset}`);
  console.error(`Valid flavors: ${VALID_FLAVORS.join(', ')}`);
  process.exit(1);
}

// Output path based on flavor
const AAB_OUTPUT_PATH = process.env.AAB_OUTPUT_PATH || join(BUILDS_BASE, flavor === 'prod' ? 'prod' : 'dev');

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

  console.log('');
  console.log(`${colors.bright}========================================${colors.reset}`);
  console.log(`${colors.bright}  AAB BUILD: ${flavor} release (v${version})${colors.reset}`);
  console.log(`${colors.bright}========================================${colors.reset}`);
  console.log(`  App ID:     ${config.appId}`);
  console.log(`  App Name:   ${config.appName}`);
  console.log(`  Build Type: release (AAB)`);
  console.log(`  Gradle:     bundleRelease`);
  console.log(`  Output:     ${AAB_OUTPUT_PATH}`);
  console.log('');
}

// Save original config for restoration
let originalConfig;

// Path to build.gradle and version tracking file
const buildGradlePath = join(androidDir, 'app', 'build.gradle');
const versionTrackingPath = join(frontendDir, 'android-version.json');

// Update version tracking file
function updateVersionTracking() {
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
  writeFileSync(versionTrackingPath, JSON.stringify({ versionCode: newVersionCode }, null, 2));
  logStep('success', `Updated versionCode: ${currentVersionCode} → ${newVersionCode}`);

  return newVersionCode;
}

// Update build.gradle with versionCode and signing config
function updateBuildGradle(newVersionCode) {
  const version = getVersion();
  let buildGradle = readFileSync(buildGradlePath, 'utf-8');

  // Update version
  buildGradle = buildGradle
    .replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);

  // Add signing config if environment variables are set
  const keystorePath = process.env.KEYSTORE_PATH;
  const keystorePassword = process.env.KEYSTORE_PASSWORD;
  const keyAlias = process.env.KEY_ALIAS;
  const keyPassword = process.env.KEY_PASSWORD;

  if (keystorePath && keystorePassword && keyAlias && keyPassword) {
    // Check if signingConfigs already exists
    if (!buildGradle.includes('signingConfigs')) {
      // Add signing config before buildTypes
      const signingConfig = `
    signingConfigs {
        release {
            storeFile file("${keystorePath}")
            storePassword "${keystorePassword}"
            keyAlias "${keyAlias}"
            keyPassword "${keyPassword}"
        }
    }

`;
      buildGradle = buildGradle.replace(
        /(\s+buildTypes\s*\{)/,
        signingConfig + '$1'
      );

      // Update release buildType to use signing config
      buildGradle = buildGradle.replace(
        /(release\s*\{[^}]*)(minifyEnabled)/,
        '$1signingConfig signingConfigs.release\n            $2'
      );

      logStep('success', 'Added release signing configuration');
    }
  } else {
    logStep('warning', 'No signing keys provided - AAB will be unsigned');
    logStep('warning', 'Set KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD');
  }

  writeFileSync(buildGradlePath, buildGradle);
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
  const gradleTask = 'bundleRelease';

  // AAB source path
  const aabFileName = 'app-release.aab';
  const aabSourcePath = join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', aabFileName);

  // AAB destination path with versioned name
  const destFileName = `${APP_NAME}-${flavor}-release-v${version}-${timestamp}.aab`;
  const aabDestPath = join(AAB_OUTPUT_PATH, destFileName);

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

    // Step 1b: Update version tracking file
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

    // Step 3b: Patch Android (icons, Java files, manifest)
    logStep('running', 'Patching Android...');
    await runCommand('node', ['scripts/patch-android.js']);
    logStep('success', 'Android patched');

    // Step 3c: Update Android build.gradle
    updateBuildGradle(versionCode);

    // Step 4: Run Gradle build
    logStep('running', `Running Gradle: ${gradleTask}...`);
    const gradleCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
    await runCommand(gradleCmd, [gradleTask], { cwd: androidDir });
    logStep('success', 'Gradle build complete');

    // Restore config before copying
    restoreConfig();

    // Step 5: Verify AAB exists
    if (!existsSync(aabSourcePath)) {
      throw new Error(`AAB not found at: ${aabSourcePath}`);
    }
    logStep('success', `AAB built: ${aabFileName}`);

    // Step 6: Ensure output folder exists
    if (!existsSync(AAB_OUTPUT_PATH)) {
      mkdirSync(AAB_OUTPUT_PATH, { recursive: true });
      logStep('success', `Created directory: ${AAB_OUTPUT_PATH}`);
    }

    // Step 7: Copy AAB to output directory
    logStep('running', 'Copying AAB to output directory...');
    copyFileSync(aabSourcePath, aabDestPath);
    logStep('success', `AAB copied to: ${destFileName}`);

    // Success message
    console.log('');
    console.log(`${colors.green}${colors.bright}========================================${colors.reset}`);
    console.log(`${colors.green}${colors.bright}  BUILD SUCCESSFUL!${colors.reset}`);
    console.log(`${colors.green}${colors.bright}========================================${colors.reset}`);
    console.log('');
    console.log(`  ${colors.bright}Source:${colors.reset}`);
    console.log(`    ${aabSourcePath}`);
    console.log('');
    console.log(`  ${colors.bright}Destination:${colors.reset}`);
    console.log(`    ${aabDestPath}`);
    console.log('');
    console.log(`  ${colors.bright}Next steps:${colors.reset}`);
    console.log('    Upload to Google Play Console');
    console.log('');

  } catch (error) {
    console.log('');
    logStep('error', `Build failed: ${error.message}`);
    restoreConfig();
    process.exit(1);
  }
}

main();
