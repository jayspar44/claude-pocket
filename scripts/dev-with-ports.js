#!/usr/bin/env node

/**
 * Unified development server launcher with optional port and browser control
 *
 * Usage: npm run dev:local [-- [port] [--browser]]
 *
 * Examples:
 *   npm run dev:local                    # Default ports (4500/4501), no browser
 *   npm run dev:local -- 4510            # Custom ports (4510/4511), no browser
 *   npm run dev:local -- --browser       # Default ports, open browser
 *   npm run dev:local -- 4510 --browser  # Custom ports, open browser
 *
 * Arguments:
 *   port         Optional app port number (relay will be port+1)
 *   --browser    Open browser automatically (default: don't open)
 *   --open       Alias for --browser
 *   --help       Show this help message
 */

const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let appPort = '4500'; // Default port
let openBrowser = false;

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
    console.log(`\nUnified development server launcher with optional port and browser control

Usage: npm run dev:local [-- [port] [--browser]]

Examples:
  npm run dev:local                    # Default ports (4500/4501), no browser
  npm run dev:local -- 4510            # Custom ports (4510/4511), no browser
  npm run dev:local -- --browser       # Default ports, open browser
  npm run dev:local -- 4510 --browser  # Custom ports, open browser

Arguments:
  port         Optional app port number (relay will be port+1)
  --browser    Open browser automatically (default: don't open)
  --open       Alias for --browser
  --help       Show this help message
`);
    process.exit(0);
}

// Parse arguments
args.forEach(arg => {
    if (arg === '--browser' || arg === '--open') {
        openBrowser = true;
    } else if (!arg.startsWith('--')) {
        const portNum = parseInt(arg, 10);
        if (!isNaN(portNum)) {
            appPort = arg;
        }
    }
});

// Validate port (must be 4500-4508 to keep relay within range 4501-4509)
const appPortNum = parseInt(appPort, 10);
if (isNaN(appPortNum) || appPortNum < 4500 || appPortNum > 4508) {
    console.error(`Error: Invalid port number "${appPort}"`);
    console.error('Port must be between 4500 and 4508 (relay will be port+1, max 4509)');
    console.error('Supports 5 concurrent instances (e.g., 4500/4501, 4502/4503, ..., 4508/4509)');
    console.error('\nRun "npm run dev:local -- --help" for usage information');
    process.exit(1);
}

// Calculate relay port
const relayPort = appPortNum + 1;

console.log('='.repeat(60));
console.log('Starting development servers with custom ports:');
console.log(`  App:   http://localhost:${appPort}`);
console.log(`  Relay: http://localhost:${relayPort}`);
console.log('='.repeat(60));
console.log();

const chalk = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`
};

// Check and copy .env files if needed (for worktree support)
const fs = require('fs');
const { execSync } = require('child_process');
const currentDir = path.basename(path.resolve(__dirname, '..'));
const relayEnvPath = path.join(__dirname, '..', 'relay', '.env');
const appEnvPath = path.join(__dirname, '..', 'app', '.env.local');

// Only attempt to copy if we're NOT in the main 'claude-pocket' directory
if (currentDir !== 'claude-pocket') {
    console.log(chalk.yellow('Worktree detected. Checking for .env files...\n'));

    // Function to find base claude-pocket directory
    const findBaseDirectory = () => {
        const currentPath = path.resolve(__dirname, '..');

        // Try to find claude-pocket directory by going up the tree
        for (let i = 0; i < 4; i++) {
            const testPath = path.resolve(currentPath, '../'.repeat(i), 'claude-pocket');
            if (fs.existsSync(testPath)) {
                const testBackendEnv = path.join(testPath, 'relay', '.env');
                if (fs.existsSync(testBackendEnv)) {
                    return testPath;
                }
            }
        }
        return null;
    };

    const baseDir = findBaseDirectory();

    if (baseDir) {
        console.log(`Found base directory: ${baseDir}\n`);

        // Copy relay .env if missing
        if (!fs.existsSync(relayEnvPath)) {
            const sourceRelayEnv = path.join(baseDir, 'relay', '.env');
            if (fs.existsSync(sourceRelayEnv)) {
                try {
                    fs.copyFileSync(sourceRelayEnv, relayEnvPath);
                    console.log(chalk.green('✓ Copied relay/.env from base directory'));
                } catch (error) {
                    console.log(chalk.yellow(`⚠ Could not copy relay/.env: ${error.message}`));
                }
            }
        } else {
            console.log(chalk.green('✓ relay/.env already exists'));
        }

        // Copy app .env.local if missing
        if (!fs.existsSync(appEnvPath)) {
            const sourceAppEnv = path.join(baseDir, 'app', '.env.local');
            if (fs.existsSync(sourceAppEnv)) {
                try {
                    fs.copyFileSync(sourceAppEnv, appEnvPath);
                    console.log(chalk.green('✓ Copied app/.env.local from base directory'));
                } catch (error) {
                    console.log(chalk.yellow(`⚠ Could not copy app/.env.local: ${error.message}`));
                }
            }
        } else {
            console.log(chalk.green('✓ app/.env.local already exists'));
        }

        console.log();
    } else {
        console.log(chalk.yellow('⚠ Could not find base claude-pocket directory'));
        console.log(chalk.yellow('  If you need .env files, copy them manually from the main directory\n'));
    }
}

// Check if node_modules exist in relay and app
const relayNodeModules = path.join(__dirname, '..', 'relay', 'node_modules');
const appNodeModules = path.join(__dirname, '..', 'app', 'node_modules');

const relayMissing = !fs.existsSync(relayNodeModules);
const appMissing = !fs.existsSync(appNodeModules);

if (relayMissing || appMissing) {
    console.log('Missing dependencies detected. Installing...\n');

    try {
        if (relayMissing) {
            console.log('Installing relay dependencies...');
            execSync('npm install', {
                cwd: path.join(__dirname, '..', 'relay'),
                stdio: 'inherit'
            });
            console.log('✓ Relay dependencies installed\n');
        }

        if (appMissing) {
            console.log('Installing app dependencies...');
            execSync('npm install', {
                cwd: path.join(__dirname, '..', 'app'),
                stdio: 'inherit'
            });
            console.log('✓ App dependencies installed\n');
        }
    } catch (error) {
        console.error('Failed to install dependencies:', error.message);
        process.exit(1);
    }
}

// Spawn relay process
const relayEnv = {
    ...process.env,
    PORT: relayPort.toString(),
    FORCE_COLOR: '1'
};

const relayProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '..', 'relay'),
    env: relayEnv,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
});

// Spawn app process
const appEnv = {
    ...process.env,
    PORT: appPort.toString(),
    RELAY_PORT: relayPort.toString(),
    FORCE_COLOR: '1'
};

// Use vite directly with --open flag for browser control
const appArgs = openBrowser ? ['vite', '--open'] : ['vite'];
const appProcess = spawn('npx', appArgs, {
    cwd: path.join(__dirname, '..', 'app'),
    env: appEnv,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
});

// Prefix and forward backend output
relayProcess.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            console.log(`${chalk.blue('[relay]')} ${line}`);
        }
    });
});

relayProcess.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            console.log(`${chalk.blue('[relay]')} ${line}`);
        }
    });
});

// Prefix and forward frontend output
appProcess.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            console.log(`${chalk.green('[app]')} ${line}`);
        }
    });
});

appProcess.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            console.log(`${chalk.green('[app]')} ${line}`);
        }
    });
});

// Handle process exits
relayProcess.on('exit', (code) => {
    console.log(`${chalk.red('[relay]')} Process exited with code ${code}`);
    appProcess.kill();
    process.exit(code || 0);
});

appProcess.on('exit', (code) => {
    console.log(`${chalk.red('[app]')} Process exited with code ${code}`);
    relayProcess.kill();
    process.exit(code || 0);
});

// Handle errors
relayProcess.on('error', (error) => {
    console.error(`${chalk.red('[relay]')} Failed to start:`, error.message);
    appProcess.kill();
    process.exit(1);
});

appProcess.on('error', (error) => {
    console.error(`${chalk.red('[app]')} Failed to start:`, error.message);
    relayProcess.kill();
    process.exit(1);
});

// Handle termination signals
process.on('SIGINT', () => {
    console.log('\nShutting down development servers...');
    relayProcess.kill('SIGINT');
    appProcess.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    relayProcess.kill('SIGTERM');
    appProcess.kill('SIGTERM');
    process.exit(0);
});
