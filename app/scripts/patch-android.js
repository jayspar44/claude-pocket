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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = join(__dirname, '..');

const ANDROID_DIR = join(appDir, 'android');
const RESOURCES_DIR = join(appDir, 'android-resources');
const MANIFEST_PATH = join(ANDROID_DIR, 'app/src/main/AndroidManifest.xml');
const XML_DIR = join(ANDROID_DIR, 'app/src/main/res/xml');

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

  // 2. Patch AndroidManifest.xml
  if (existsSync(MANIFEST_PATH)) {
    let manifest = readFileSync(MANIFEST_PATH, 'utf-8');

    // Check if already patched
    if (manifest.includes('android:networkSecurityConfig')) {
      log('success', 'AndroidManifest.xml already patched');
    } else {
      // Add networkSecurityConfig attribute to <application>
      manifest = manifest.replace(
        /<application\s+/,
        '<application\n        android:networkSecurityConfig="@xml/network_security_config"\n        '
      );
      writeFileSync(MANIFEST_PATH, manifest);
      log('success', 'Patched AndroidManifest.xml with networkSecurityConfig');
    }
  } else {
    log('error', 'AndroidManifest.xml not found');
  }

  console.log('\nAndroid patching complete!\n');
}

patchAndroid();
