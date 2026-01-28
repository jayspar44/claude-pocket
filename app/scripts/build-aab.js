#!/usr/bin/env node
/* global process */

/**
 * AAB Build Script
 *
 * Builds an Android App Bundle (AAB) via Gradle and copies it to output directory.
 * For Play Store uploads, use release builds.
 *
 * Usage:
 *   node scripts/build-aab.js [flavor] [buildType]
 *
 * Arguments:
 *   flavor    - dev, prod (default: dev) - note: local not supported for AAB
 *   buildType - debug, release (default: release)
 *
 * Examples:
 *   node scripts/build-aab.js              # Build dev release AAB
 *   node scripts/build-aab.js dev release  # Build dev release AAB
 *   node scripts/build-aab.js prod release # Build prod release AAB
 *
 * Environment:
 *   For release builds, set these environment variables:
 *   - KEYSTORE_PATH     - Path to keystore file (required)
 *   - KEYSTORE_PASSWORD - Keystore password
 *   - KEY_ALIAS         - Key alias name
 *   - KEY_PASSWORD      - Key password
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

// Base output directory for all builds (configurable via env var)
const BUILDS_BASE = process.env.BUILDS_BASE || `${process.env.HOME}/claude-pocket-outputs`;

// OUTPUT_PATH determined after flavor is parsed (below)

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

// Valid flavors and build types (local not supported for AAB - no Play Store use case)
const VALID_FLAVORS = ['dev', 'prod'];
const VALID_BUILD_TYPES = ['debug', 'release'];

// Flavor configurations
const flavorConfigs = {
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
const buildType = process.argv[3] || 'release';

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

// Output path based on flavor (prod builds go to prod/, dev builds go to dev/)
const OUTPUT_PATH = process.env.AAB_OUTPUT_PATH || join(BUILDS_BASE, flavor === 'prod' ? 'prod' : 'dev');

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

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Print banner
function printBanner() {
  const version = getVersion();
  const config = flavorConfigs[flavor];
  const gradleTask = `bundle${capitalize(buildType)}`;

  console.log('');
  console.log(`${colors.bright}========================================${colors.reset}`);
  console.log(`${colors.bright}  AAB BUILD: ${flavor} ${buildType} (v${version})${colors.reset}`);
  console.log(`${colors.bright}========================================${colors.reset}`);
  console.log(`  App ID:     ${config.appId}`);
  console.log(`  App Name:   ${config.appName}`);
  console.log(`  Build Type: ${buildType}`);
  console.log(`  Gradle:     ${gradleTask}`);
  console.log(`  Output:     ${OUTPUT_PATH}`);
  console.log('');
}

// Save original config for restoration
let originalCapConfig;

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
function writeCapConfig() {
  originalCapConfig = readFileSync(configPath, 'utf-8');
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
  logStep('success', `Capacitor config updated for ${flavor}`);
}

// Setup signing configuration for release builds
function setupSigning() {
  if (buildType !== 'release') {
    logStep('warning', 'Debug build - skipping signing setup');
    return;
  }

  // Check if signing config already exists in build.gradle
  const buildGradle = readFileSync(buildGradlePath, 'utf-8');
  if (buildGradle.includes('signingConfigs')) {
    logStep('success', 'Signing config already configured in build.gradle');
    return;
  }

  // Only require env vars if signing not already configured
  const keystorePath = process.env.KEYSTORE_PATH;
  const keystorePassword = process.env.KEYSTORE_PASSWORD;
  const keyAlias = process.env.KEY_ALIAS;
  const keyPassword = process.env.KEY_PASSWORD;

  if (!keystorePath || !keystorePassword || !keyAlias || !keyPassword) {
    console.error(`${colors.red}Error: Missing required signing credentials${colors.reset}`);
    console.error('For release builds, set these environment variables:');
    console.error('  KEYSTORE_PATH     - Path to keystore file');
    console.error('  KEYSTORE_PASSWORD - Keystore password');
    console.error('  KEY_ALIAS         - Key alias name');
    console.error('  KEY_PASSWORD      - Key password');
    console.error('');
    console.error('Example (bash):');
    console.error('  export KEYSTORE_PATH=~/keys/release.keystore');
    console.error('  export KEYSTORE_PASSWORD="your-password"');
    console.error('  export KEY_ALIAS="your-alias"');
    console.error('  export KEY_PASSWORD="your-key-password"');
    process.exit(1);
  }

  if (!existsSync(keystorePath)) {
    console.error(`${colors.red}Error: Keystore not found at: ${keystorePath}${colors.reset}`);
    process.exit(1);
  }

  // Write signing config to gradle.properties (more secure than embedding in build.gradle)
  const gradlePropertiesPath = join(androidDir, 'gradle.properties');
  let gradleProperties = '';
  if (existsSync(gradlePropertiesPath)) {
    gradleProperties = readFileSync(gradlePropertiesPath, 'utf-8');
  }

  // Remove any existing signing config from properties
  gradleProperties = gradleProperties
    .split('\n')
    .filter(line => !line.startsWith('RELEASE_'))
    .join('\n');

  // Add signing config to gradle.properties
  const signingProps = `
# Release signing config (auto-generated, do not commit)
RELEASE_STORE_FILE=${keystorePath}
RELEASE_STORE_PASSWORD=${keystorePassword}
RELEASE_KEY_ALIAS=${keyAlias}
RELEASE_KEY_PASSWORD=${keyPassword}
`;
  writeFileSync(gradlePropertiesPath, gradleProperties.trim() + '\n' + signingProps);
  logStep('success', 'Signing config written to gradle.properties');

  // Update build.gradle to reference gradle.properties
  const signingConfig = `
    signingConfigs {
        release {
            storeFile file(RELEASE_STORE_FILE)
            storePassword RELEASE_STORE_PASSWORD
            keyAlias RELEASE_KEY_ALIAS
            keyPassword RELEASE_KEY_PASSWORD
        }
    }

`;

  let updatedBuildGradle = buildGradle.replace(
    /(\s+)(buildTypes\s*\{)/,
    `$1${signingConfig}$1$2`
  );

  // Add signingConfig to release buildType
  updatedBuildGradle = updatedBuildGradle.replace(
    /(release\s*\{)/,
    '$1\n            signingConfig signingConfigs.release'
  );

  writeFileSync(buildGradlePath, updatedBuildGradle);
  logStep('success', 'Signing config added to build.gradle');
}

// Restore original config
function restoreConfig() {
  if (originalCapConfig) {
    writeFileSync(configPath, originalCapConfig);
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
  const gradleTask = `bundle${capitalize(buildType)}`;

  // AAB source path (standard Capacitor output, no flavors)
  const aabFileName = `app-${buildType}.aab`;
  const aabSourcePath = join(androidDir, 'app', 'build', 'outputs', 'bundle', buildType, aabFileName);

  // AAB destination path with versioned name
  const destFileName = `${APP_NAME}-${flavor}-${buildType}-v${version}-${timestamp}.aab`;
  const aabDestPath = join(OUTPUT_PATH, destFileName);

  // Setup cleanup handler
  const cleanup = () => {
    restoreConfig();
    process.exit(1);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Step 1: Update Capacitor config
    writeCapConfig();

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

    // Step 4: Setup signing for release builds
    setupSigning();

    // Step 5: Run Gradle build
    logStep('running', `Running Gradle: ${gradleTask}...`);
    const gradleCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
    await runCommand(gradleCmd, [gradleTask], { cwd: androidDir });
    logStep('success', 'Gradle build complete');

    // Restore config before copying
    restoreConfig();

    // Step 6: Verify AAB exists
    if (!existsSync(aabSourcePath)) {
      throw new Error(`AAB not found at: ${aabSourcePath}`);
    }
    logStep('success', `AAB built: ${aabFileName}`);

    // Step 7: Ensure output directory exists
    if (!existsSync(OUTPUT_PATH)) {
      mkdirSync(OUTPUT_PATH, { recursive: true });
      logStep('success', `Created directory: ${OUTPUT_PATH}`);
    }

    // Step 8: Copy AAB to output directory
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
    console.log(`    1. Go to https://play.google.com/console`);
    console.log(`    2. Select your app (${flavorConfigs[flavor].appName})`);
    console.log(`    3. Go to Testing > Internal testing`);
    console.log(`    4. Create new release and upload the AAB`);
    console.log('');

  } catch (error) {
    console.log('');
    logStep('error', `Build failed: ${error.message}`);
    restoreConfig();
    process.exit(1);
  }
}

main();
