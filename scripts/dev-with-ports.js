#!/usr/bin/env node

/**
 * Unified development server launcher with optional port and browser control
 *
 * Usage: npm run dev:local [-- [port] [--browser]]
 *
 * Examples:
 *   npm run dev:local                    # Default ports (3000/3001), no browser
 *   npm run dev:local -- 3010            # Custom ports (3010/3011), no browser
 *   npm run dev:local -- --browser       # Default ports, open browser
 *   npm run dev:local -- 3010 --browser  # Custom ports, open browser
 *
 * Arguments:
 *   port         Optional frontend port number (backend will be port+1)
 *   --browser    Open browser automatically (default: don't open)
 *   --open       Alias for --browser
 *   --help       Show this help message
 */

const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let frontendPort = '4000'; // Default port
let openBrowser = false;

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
    console.log(`\nUnified development server launcher with optional port and browser control

Usage: npm run dev:local [-- [port] [--browser]]

Examples:
  npm run dev:local                    # Default ports (4000/4001), no browser
  npm run dev:local -- 4010            # Custom ports (4010/4011), no browser
  npm run dev:local -- --browser       # Default ports, open browser
  npm run dev:local -- 4010 --browser  # Custom ports, open browser

Arguments:
  port         Optional frontend port number (backend will be port+1)
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
            frontendPort = arg;
        }
    }
});

// Validate port (must be 4000-4008 to keep backend within CORS range 4001-4009)
const frontendPortNum = parseInt(frontendPort, 10);
if (isNaN(frontendPortNum) || frontendPortNum < 4000 || frontendPortNum > 4008) {
    console.error(`Error: Invalid port number "${frontendPort}"`);
    console.error('Port must be between 4000 and 4008 (backend will be port+1, max 4009)');
    console.error('Supports 5 concurrent instances (e.g., 4000/4001, 4002/4003, ..., 4008/4009)');
    console.error('\nRun "npm run dev:local -- --help" for usage information');
    process.exit(1);
}

// Calculate backend port
const backendPort = frontendPortNum + 1;

console.log('='.repeat(60));
console.log('Starting development servers with custom ports:');
console.log(`  Frontend: http://localhost:${frontendPort}`);
console.log(`  Backend:  http://localhost:${backendPort}`);
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
const backendEnvPath = path.join(__dirname, '..', 'backend', '.env');
const frontendEnvPath = path.join(__dirname, '..', 'frontend', '.env.local');

// Only attempt to copy if we're NOT in the main 'ai-home-helper' directory
if (currentDir !== 'ai-home-helper') {
    console.log(chalk.yellow('Worktree detected. Checking for .env files...\n'));

    // Function to find base ai-home-helper directory
    const findBaseDirectory = () => {
        const currentPath = path.resolve(__dirname, '..');

        // Try to find ai-home-helper directory by going up the tree
        for (let i = 0; i < 4; i++) {
            const testPath = path.resolve(currentPath, '../'.repeat(i), 'ai-home-helper');
            if (fs.existsSync(testPath)) {
                const testBackendEnv = path.join(testPath, 'backend', '.env');
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

        // Copy backend .env if missing
        if (!fs.existsSync(backendEnvPath)) {
            const sourceBackendEnv = path.join(baseDir, 'backend', '.env');
            if (fs.existsSync(sourceBackendEnv)) {
                try {
                    fs.copyFileSync(sourceBackendEnv, backendEnvPath);
                    console.log(chalk.green('✓ Copied backend/.env from base directory'));
                } catch (error) {
                    console.log(chalk.yellow(`⚠ Could not copy backend/.env: ${error.message}`));
                }
            }
        } else {
            console.log(chalk.green('✓ backend/.env already exists'));
        }

        // Copy frontend .env.local if missing
        if (!fs.existsSync(frontendEnvPath)) {
            const sourceFrontendEnv = path.join(baseDir, 'frontend', '.env.local');
            if (fs.existsSync(sourceFrontendEnv)) {
                try {
                    fs.copyFileSync(sourceFrontendEnv, frontendEnvPath);
                    console.log(chalk.green('✓ Copied frontend/.env.local from base directory'));
                } catch (error) {
                    console.log(chalk.yellow(`⚠ Could not copy frontend/.env.local: ${error.message}`));
                }
            }
        } else {
            console.log(chalk.green('✓ frontend/.env.local already exists'));
        }

        console.log();
    } else {
        console.log(chalk.yellow('⚠ Could not find base ai-home-helper directory'));
        console.log(chalk.yellow('  If you need .env files, copy them manually from the main directory\n'));
    }
}

// Check if node_modules exist in backend and frontend
const backendNodeModules = path.join(__dirname, '..', 'backend', 'node_modules');
const frontendNodeModules = path.join(__dirname, '..', 'frontend', 'node_modules');

const backendMissing = !fs.existsSync(backendNodeModules);
const frontendMissing = !fs.existsSync(frontendNodeModules);

if (backendMissing || frontendMissing) {
    console.log('Missing dependencies detected. Installing...\n');

    try {
        if (backendMissing) {
            console.log('Installing backend dependencies...');
            execSync('npm install', {
                cwd: path.join(__dirname, '..', 'backend'),
                stdio: 'inherit'
            });
            console.log('✓ Backend dependencies installed\n');
        }

        if (frontendMissing) {
            console.log('Installing frontend dependencies...');
            execSync('npm install', {
                cwd: path.join(__dirname, '..', 'frontend'),
                stdio: 'inherit'
            });
            console.log('✓ Frontend dependencies installed\n');
        }
    } catch (error) {
        console.error('Failed to install dependencies:', error.message);
        process.exit(1);
    }
}

// Spawn backend process
const backendEnv = {
    ...process.env,
    PORT: backendPort.toString(),
    FORCE_COLOR: '1'
};

const backendProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '..', 'backend'),
    env: backendEnv,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
});

// Spawn frontend process
const frontendEnv = {
    ...process.env,
    PORT: frontendPort.toString(),
    BACKEND_PORT: backendPort.toString(),
    FORCE_COLOR: '1'
};

// Use vite directly with --open flag for browser control
const frontendArgs = openBrowser ? ['vite', '--open'] : ['vite'];
const frontendProcess = spawn('npx', frontendArgs, {
    cwd: path.join(__dirname, '..', 'frontend'),
    env: frontendEnv,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
});

// Prefix and forward backend output
backendProcess.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            console.log(`${chalk.blue('[backend]')} ${line}`);
        }
    });
});

backendProcess.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            console.log(`${chalk.blue('[backend]')} ${line}`);
        }
    });
});

// Prefix and forward frontend output
frontendProcess.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            console.log(`${chalk.green('[frontend]')} ${line}`);
        }
    });
});

frontendProcess.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            console.log(`${chalk.green('[frontend]')} ${line}`);
        }
    });
});

// Handle process exits
backendProcess.on('exit', (code) => {
    console.log(`${chalk.red('[backend]')} Process exited with code ${code}`);
    frontendProcess.kill();
    process.exit(code || 0);
});

frontendProcess.on('exit', (code) => {
    console.log(`${chalk.red('[frontend]')} Process exited with code ${code}`);
    backendProcess.kill();
    process.exit(code || 0);
});

// Handle errors
backendProcess.on('error', (error) => {
    console.error(`${chalk.red('[backend]')} Failed to start:`, error.message);
    frontendProcess.kill();
    process.exit(1);
});

frontendProcess.on('error', (error) => {
    console.error(`${chalk.red('[frontend]')} Failed to start:`, error.message);
    backendProcess.kill();
    process.exit(1);
});

// Handle termination signals
process.on('SIGINT', () => {
    console.log('\nShutting down development servers...');
    backendProcess.kill('SIGINT');
    frontendProcess.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    backendProcess.kill('SIGTERM');
    frontendProcess.kill('SIGTERM');
    process.exit(0);
});
