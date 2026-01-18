#!/usr/bin/env node

/**
 * Project Initialization Script
 *
 * This script replaces all template variables ({{VARIABLE_NAME}}) with actual values
 * based on user input. Run this once after cloning the template.
 *
 * Usage:
 *   npm run init
 *
 * Template Variables:
 *   {{PROJECT_NAME}}        - Lowercase project name (e.g., my-app)
 *   {{PROJECT_TITLE}}       - Display name (e.g., My App)
 *   {{PROJECT_DESCRIPTION}} - Short description
 *   {{FIREBASE_PROJECT_ID}} - Firebase project ID (e.g., my-app-123)
 *   {{FIREBASE_SITE_DEV}}   - Firebase hosting site for dev (e.g., my-app-dev)
 *   {{FIREBASE_SITE_PROD}}  - Firebase hosting site for prod (e.g., my-app)
 *   {{GCP_REGION}}          - GCP region (e.g., us-central1)
 *   {{APP_ID_BASE}}         - Android app ID base (e.g., io.company.app)
 *   {{BACKEND_SERVICE}}     - Cloud Run service name (e.g., my-app-backend)
 *   {{GITHUB_REPO}}         - GitHub repo (e.g., user/my-app)
 *   {{CLOUD_RUN_HASH}}      - Cloud Run URL hash (get after first deploy)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// ANSI colors
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

// Files and directories to skip
const SKIP_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.env',
  '.env.local',
  'android/app/build',
  'ios/App/build',
  'scripts/init-project.js', // Skip self
];

// File extensions to process
const PROCESS_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.yaml',
  '.yml',
  '.md',
  '.html',
  '.css',
  '.xml',
  '.gradle',
];

function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function shouldSkip(filePath) {
  const relativePath = relative(projectRoot, filePath);
  return SKIP_PATTERNS.some(pattern => relativePath.includes(pattern));
}

function shouldProcess(filePath) {
  return PROCESS_EXTENSIONS.some(ext => filePath.endsWith(ext));
}

function getAllFiles(dir, files = []) {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    if (shouldSkip(fullPath)) continue;

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (shouldProcess(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function replaceInFile(filePath, replacements) {
  let content = readFileSync(filePath, 'utf-8');
  let modified = false;

  for (const [placeholder, value] of Object.entries(replacements)) {
    const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
    if (regex.test(content)) {
      content = content.replace(regex, value);
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(filePath, content);
    return true;
  }

  return false;
}

async function main() {
  console.log('');
  console.log(`${colors.bright}╔════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}║     Project Initialization Wizard                  ║${colors.reset}`);
  console.log(`${colors.bright}╚════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`${colors.dim}This wizard will configure your project by replacing`);
  console.log(`template variables with your actual values.${colors.reset}`);
  console.log('');

  // Gather inputs
  console.log(`${colors.cyan}${colors.bright}Project Information${colors.reset}`);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);

  const projectName = await prompt(`${colors.green}?${colors.reset} Project name (lowercase, hyphens ok, e.g., my-app): `);
  if (!projectName || !/^[a-z0-9-]+$/.test(projectName)) {
    console.log(`${colors.red}Invalid project name. Use lowercase letters, numbers, and hyphens only.${colors.reset}`);
    process.exit(1);
  }

  const projectTitle = await prompt(`${colors.green}?${colors.reset} Display name (e.g., My App): `) || projectName;
  const projectDescription = await prompt(`${colors.green}?${colors.reset} Description: `) || 'A React + Express + Firebase app';

  console.log('');
  console.log(`${colors.cyan}${colors.bright}Firebase Configuration${colors.reset}`);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);

  const firebaseProjectId = await prompt(`${colors.green}?${colors.reset} Firebase project ID (e.g., ${projectName}-123): `);
  if (!firebaseProjectId) {
    console.log(`${colors.red}Firebase project ID is required.${colors.reset}`);
    process.exit(1);
  }

  const firebaseSiteDev = await prompt(`${colors.green}?${colors.reset} Firebase dev site name [${firebaseProjectId}-dev]: `) || `${firebaseProjectId}-dev`;
  const firebaseSiteProd = await prompt(`${colors.green}?${colors.reset} Firebase prod site name [${firebaseProjectId}]: `) || firebaseProjectId;

  console.log('');
  console.log(`${colors.cyan}${colors.bright}GCP Configuration${colors.reset}`);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);

  const gcpRegion = await prompt(`${colors.green}?${colors.reset} GCP region [us-central1]: `) || 'us-central1';
  const backendService = await prompt(`${colors.green}?${colors.reset} Cloud Run service name [${projectName}-backend]: `) || `${projectName}-backend`;
  const cloudRunHash = await prompt(`${colors.green}?${colors.reset} Cloud Run hash (leave empty, get after first deploy) [PLACEHOLDER]: `) || 'PLACEHOLDER';

  console.log('');
  console.log(`${colors.cyan}${colors.bright}Mobile App Configuration${colors.reset}`);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);

  const appIdBase = await prompt(`${colors.green}?${colors.reset} Android app ID base (e.g., io.company.${projectName.replace(/-/g, '')}): `);
  if (!appIdBase || !/^[a-z][a-z0-9_.]*[a-z0-9]$/.test(appIdBase)) {
    console.log(`${colors.yellow}Warning: Invalid or empty app ID. Using default.${colors.reset}`);
  }
  const finalAppId = appIdBase || `io.app.${projectName.replace(/-/g, '')}`;

  console.log('');
  console.log(`${colors.cyan}${colors.bright}GitHub Configuration${colors.reset}`);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);

  const githubRepo = await prompt(`${colors.green}?${colors.reset} GitHub repo (e.g., username/${projectName}): `);
  if (!githubRepo || !githubRepo.includes('/')) {
    console.log(`${colors.red}Invalid GitHub repo format. Use: username/repo${colors.reset}`);
    process.exit(1);
  }

  // Build replacements map
  const replacements = {
    '{{PROJECT_NAME}}': projectName,
    '{{PROJECT_TITLE}}': projectTitle,
    '{{PROJECT_DESCRIPTION}}': projectDescription,
    '{{FIREBASE_PROJECT_ID}}': firebaseProjectId,
    '{{FIREBASE_SITE_DEV}}': firebaseSiteDev,
    '{{FIREBASE_SITE_PROD}}': firebaseSiteProd,
    '{{GCP_REGION}}': gcpRegion,
    '{{APP_ID_BASE}}': finalAppId,
    '{{BACKEND_SERVICE}}': backendService,
    '{{GITHUB_REPO}}': githubRepo,
    '{{CLOUD_RUN_HASH}}': cloudRunHash,
  };

  // Confirm
  console.log('');
  console.log(`${colors.cyan}${colors.bright}Summary${colors.reset}`);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);
  for (const [key, value] of Object.entries(replacements)) {
    console.log(`  ${colors.dim}${key}${colors.reset} → ${colors.green}${value}${colors.reset}`);
  }
  console.log('');

  const confirm = await prompt(`${colors.yellow}?${colors.reset} Proceed with initialization? (y/N): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log(`${colors.dim}Initialization cancelled.${colors.reset}`);
    process.exit(0);
  }

  // Process files
  console.log('');
  console.log(`${colors.cyan}Processing files...${colors.reset}`);

  const files = getAllFiles(projectRoot);
  let modifiedCount = 0;

  for (const file of files) {
    const relativePath = relative(projectRoot, file);
    if (replaceInFile(file, replacements)) {
      console.log(`  ${colors.green}✓${colors.reset} ${relativePath}`);
      modifiedCount++;
    }
  }

  console.log('');
  console.log(`${colors.green}${colors.bright}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}${colors.bright}  Initialization Complete!${colors.reset}`);
  console.log(`${colors.green}${colors.bright}═══════════════════════════════════════════${colors.reset}`);
  console.log('');
  console.log(`  Modified ${colors.bright}${modifiedCount}${colors.reset} files.`);
  console.log('');
  console.log(`${colors.cyan}${colors.bright}Next Steps:${colors.reset}`);
  console.log('');
  console.log(`  1. Set up Firebase:`);
  console.log(`     ${colors.dim}firebase login${colors.reset}`);
  console.log(`     ${colors.dim}firebase use ${firebaseProjectId}${colors.reset}`);
  console.log('');
  console.log(`  2. Configure environment:`);
  console.log(`     ${colors.dim}cp backend/.env.example backend/.env${colors.reset}`);
  console.log(`     ${colors.dim}cp frontend/.env.local.template frontend/.env.local${colors.reset}`);
  console.log(`     ${colors.dim}# Edit both files with your credentials${colors.reset}`);
  console.log('');
  console.log(`  3. Install dependencies:`);
  console.log(`     ${colors.dim}npm run install-all${colors.reset}`);
  console.log('');
  console.log(`  4. Start development:`);
  console.log(`     ${colors.dim}npm run dev:local${colors.reset}`);
  console.log('');
  console.log(`  5. Deploy to GCP (see SETUP.md for detailed instructions):`);
  console.log(`     ${colors.dim}gcloud builds submit --config cloudbuild.yaml${colors.reset}`);
  console.log('');

  // Optionally delete this script
  const deleteScript = await prompt(`${colors.yellow}?${colors.reset} Delete this init script? (y/N): `);
  if (deleteScript.toLowerCase() === 'y') {
    try {
      unlinkSync(__filename);
      console.log(`${colors.dim}Init script deleted.${colors.reset}`);
    } catch {
      console.log(`${colors.dim}Could not delete init script. You can delete it manually.${colors.reset}`);
    }
  }

  console.log('');
  console.log(`${colors.bright}Happy coding! 🚀${colors.reset}`);
  console.log('');
}

main().catch((err) => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
