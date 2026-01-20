import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))

// Get git info for build verification
function getGitInfo() {
  try {
    const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()
    return { gitHash, gitBranch }
  } catch {
    return { gitHash: 'unknown', gitBranch: 'unknown' }
  }
}

const { gitHash, gitBranch } = getGitInfo()
const buildTimestamp = new Date().toISOString()

// Get backend port from environment or calculate it
const frontendPort = parseInt(process.env.PORT) || 4500;
const backendPort = parseInt(process.env.BACKEND_PORT) || (frontendPort + 1);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    '__APP_VERSION__': JSON.stringify(pkg.version),
    '__BUILD_TIMESTAMP__': JSON.stringify(buildTimestamp),
    '__GIT_HASH__': JSON.stringify(gitHash),
    '__GIT_BRANCH__': JSON.stringify(gitBranch),
  },
  server: {
    port: frontendPort,
    host: '0.0.0.0', // Explicitly bind to all interfaces
    strictPort: true,
    allowedHosts: ['.ts.net'], // Allow Tailscale hostnames
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
  }
})
