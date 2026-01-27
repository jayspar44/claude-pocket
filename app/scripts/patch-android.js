#!/usr/bin/env node
/**
 * Patch Android project after Capacitor sync
 *
 * This script:
 * 1. Copies custom resources (network_security_config.xml)
 * 2. Patches AndroidManifest.xml to reference them
 *
 * Run after: npx cap sync android
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
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
const JAVA_SRC_DIR = join(RESOURCES_DIR, 'java/com/claudecode/pocket/dev');
const JAVA_DEST_DIR = join(ANDROID_DIR, 'app/src/main/java/com/claudecode/pocket/dev');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(status, message) {
  const icons = {
    success: `${colors.green}[+]${colors.reset}`,
    warning: `${colors.yellow}[!]${colors.reset}`,
    error: `${colors.red}[x]${colors.reset}`,
  };
  console.log(`${icons[status]} ${message}`);
}

function patchAndroid() {
  console.log('\nPatching Android project...\n');

  // Check if android directory exists
  if (!existsSync(ANDROID_DIR)) {
    log('error', 'Android directory not found. Run "npx cap add android" first.');
    process.exit(1);
  }

  // 1. Copy network_security_config.xml
  const networkConfigSrc = join(RESOURCES_DIR, 'xml/network_security_config.xml');
  const networkConfigDest = join(XML_DIR, 'network_security_config.xml');

  if (existsSync(networkConfigSrc)) {
    mkdirSync(XML_DIR, { recursive: true });
    copyFileSync(networkConfigSrc, networkConfigDest);
    log('success', 'Copied network_security_config.xml');
  } else {
    log('warning', 'network_security_config.xml template not found');
  }

  // 2. Copy custom Java files (MainActivity, WebSocketService, etc.)
  if (existsSync(JAVA_SRC_DIR)) {
    mkdirSync(JAVA_DEST_DIR, { recursive: true });
    const javaFiles = ['MainActivity.java', 'WebSocketService.java', 'WebSocketServicePlugin.java'];
    for (const file of javaFiles) {
      const src = join(JAVA_SRC_DIR, file);
      const dest = join(JAVA_DEST_DIR, file);
      if (existsSync(src)) {
        copyFileSync(src, dest);
        log('success', `Copied ${file}`);
      }
    }
  }

  // 3. Patch AndroidManifest.xml
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
      log('success', 'Added networkSecurityConfig to AndroidManifest.xml');
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

  console.log('\nAndroid patching complete!\n');
}

patchAndroid();
