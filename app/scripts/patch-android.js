#!/usr/bin/env node
/**
 * Patch Android project after Capacitor sync
 *
 * This script:
 * 1. Copies custom app icons (mipmap resources)
 * 2. Copies notification icons (drawable resources)
 * 3. Copies custom Java files with correct package name
 * 4. Copies network_security_config.xml
 * 5. Patches AndroidManifest.xml
 *
 * Usage:
 *   node scripts/patch-android.js [appId]
 *
 * Arguments:
 *   appId - The app ID (e.g., com.claudecode.pocket or com.claudecode.pocket.dev)
 *           Defaults to reading from capacitor.config.json
 *
 * Run after: npx cap sync android
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = join(__dirname, '..');

const ANDROID_DIR = join(appDir, 'android');
const RESOURCES_DIR = join(appDir, 'android-resources');
const MANIFEST_PATH = join(ANDROID_DIR, 'app/src/main/AndroidManifest.xml');
const XML_DIR = join(ANDROID_DIR, 'app/src/main/res/xml');
const RES_DIR = join(ANDROID_DIR, 'app/src/main/res');
const JAVA_BASE_DIR = join(ANDROID_DIR, 'app/src/main/java');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(status, message) {
  const icons = {
    success: `${colors.green}[+]${colors.reset}`,
    warning: `${colors.yellow}[!]${colors.reset}`,
    error: `${colors.red}[x]${colors.reset}`,
    info: `${colors.cyan}[>]${colors.reset}`,
  };
  console.log(`${icons[status]} ${message}`);
}

// Get app ID from argument or capacitor.config.json
function getAppId() {
  const argAppId = process.argv[2];
  if (argAppId) {
    return argAppId;
  }

  const configPath = join(appDir, 'capacitor.config.json');
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.appId;
  }

  return 'com.claudecode.pocket';
}

// Convert app ID to package path
function appIdToPath(appId) {
  return appId.replace(/\./g, '/');
}

// Copy directory contents recursively
function copyDir(src, dest) {
  if (!existsSync(src)) return 0;

  mkdirSync(dest, { recursive: true });
  let count = 0;

  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      count += copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
      count++;
    }
  }

  return count;
}

function patchAndroid() {
  const appId = getAppId();
  const packagePath = appIdToPath(appId);

  console.log('\n========================================');
  console.log('  Patching Android project');
  console.log('========================================');
  console.log(`  App ID: ${appId}`);
  console.log(`  Package path: ${packagePath}`);
  console.log('');

  // Check if android directory exists
  if (!existsSync(ANDROID_DIR)) {
    log('error', 'Android directory not found. Run "npx cap add android" first.');
    process.exit(1);
  }

  // 1. Copy app icons (mipmap resources)
  const mipmapDensities = ['hdpi', 'mdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi', 'anydpi-v26'];
  let iconCount = 0;

  for (const density of mipmapDensities) {
    const srcDir = join(RESOURCES_DIR, `mipmap-${density}`);
    const destDir = join(RES_DIR, `mipmap-${density}`);

    if (existsSync(srcDir)) {
      iconCount += copyDir(srcDir, destDir);
    }
  }

  if (iconCount > 0) {
    log('success', `Copied ${iconCount} app icon files`);
  }

  // 2. Copy notification icons (drawable resources)
  const drawableDensities = ['hdpi', 'mdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  let notifCount = 0;

  for (const density of drawableDensities) {
    const srcDir = join(RESOURCES_DIR, `drawable-${density}`);
    const destDir = join(RES_DIR, `drawable-${density}`);

    if (existsSync(srcDir)) {
      notifCount += copyDir(srcDir, destDir);
    }
  }

  if (notifCount > 0) {
    log('success', `Copied ${notifCount} notification icon files`);
  }

  // 3. Copy network_security_config.xml
  const networkConfigSrc = join(RESOURCES_DIR, 'xml/network_security_config.xml');
  const networkConfigDest = join(XML_DIR, 'network_security_config.xml');

  if (existsSync(networkConfigSrc)) {
    mkdirSync(XML_DIR, { recursive: true });
    copyFileSync(networkConfigSrc, networkConfigDest);
    log('success', 'Copied network_security_config.xml');
  } else {
    log('warning', 'network_security_config.xml not found');
  }

  // 4. Copy and patch Java files
  const javaSrcDir = join(RESOURCES_DIR, 'java');
  const javaDestDir = join(JAVA_BASE_DIR, packagePath);
  const javaFiles = ['MainActivity.java', 'WebSocketService.java', 'WebSocketServicePlugin.java'];

  if (existsSync(javaSrcDir)) {
    mkdirSync(javaDestDir, { recursive: true });

    for (const file of javaFiles) {
      const srcPath = join(javaSrcDir, file);
      const destPath = join(javaDestDir, file);

      if (existsSync(srcPath)) {
        // Read, replace placeholder, write
        let content = readFileSync(srcPath, 'utf-8');
        content = content.replace(/\{\{PACKAGE_NAME\}\}/g, appId);
        writeFileSync(destPath, content);
        log('success', `Copied ${file} (package: ${appId})`);
      }
    }
  }

  // 5. Patch AndroidManifest.xml
  if (existsSync(MANIFEST_PATH)) {
    let manifest = readFileSync(MANIFEST_PATH, 'utf-8');
    let modified = false;

    // Add networkSecurityConfig attribute to <application>
    if (!manifest.includes('android:networkSecurityConfig')) {
      manifest = manifest.replace(
        /<application\s+/,
        '<application\n        android:networkSecurityConfig="@xml/network_security_config"\n        '
      );
      modified = true;
      log('success', 'Added networkSecurityConfig to manifest');
    }

    // Add FOREGROUND_SERVICE permissions
    if (!manifest.includes('android.permission.FOREGROUND_SERVICE')) {
      manifest = manifest.replace(
        '<uses-permission android:name="android.permission.INTERNET" />',
        `<uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />`
      );
      modified = true;
      log('success', 'Added FOREGROUND_SERVICE permissions');
    }

    // Add WebSocketService declaration
    if (!manifest.includes('.WebSocketService')) {
      manifest = manifest.replace(
        '</application>',
        `
        <!-- Foreground service to keep WebSocket alive when backgrounded -->
        <service
            android:name=".WebSocketService"
            android:foregroundServiceType="specialUse"
            android:exported="false">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Maintains WebSocket connection to Claude relay server for real-time communication" />
        </service>
    </application>`
      );
      modified = true;
      log('success', 'Added WebSocketService declaration');
    }

    if (modified) {
      writeFileSync(MANIFEST_PATH, manifest);
    } else {
      log('success', 'AndroidManifest.xml already patched');
    }
  } else {
    log('error', 'AndroidManifest.xml not found');
  }

  // 6. Remove old drawable-v24 if it has stale launcher icons
  const drawableV24 = join(RES_DIR, 'drawable-v24');
  const staleIcon = join(drawableV24, 'ic_launcher_foreground.xml');
  if (existsSync(staleIcon)) {
    unlinkSync(staleIcon);
    log('success', 'Removed stale ic_launcher_foreground.xml from drawable-v24');
  }

  console.log('\n========================================');
  console.log('  Android patching complete!');
  console.log('========================================\n');
}

patchAndroid();
