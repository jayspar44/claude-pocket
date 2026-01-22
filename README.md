# Claude Pocket

Mobile-first client for Claude Code CLI that connects to a relay server via WebSocket.

## Architecture

```
┌─────────────────────┐     WebSocket      ┌─────────────────────┐
│   Mobile App        │ ◄───────────────► │   Relay Server      │
│   (Capacitor/React) │    + REST API      │   (Mac Mini)        │
│                     │   via Tailscale    │                     │
│ - xterm.js display  │                    │ - node-pty spawn    │
│ - Native input      │                    │ - Claude Code CLI   │
│ - Quick actions     │                    │ - File browser      │
│ - Command palette   │                    │                     │
└─────────────────────┘                    └─────────────────────┘
```

## Features

- **Terminal**: Full xterm.js terminal emulation on mobile
- **WebSocket**: Real-time bidirectional communication with relay server
- **Quick Actions**: Common commands at your fingertips
- **Command Palette**: Access slash commands easily
- **File Browser**: Browse and upload files to Claude Code
- **Reconnection**: Auto-reconnect with output buffer replay

## Stack

- **App**: React 19 + Vite 7 + Tailwind CSS 4 + Capacitor 8 + xterm.js
- **Relay**: Node.js 22 + Express 5 + WebSocket + node-pty

## Quick Start

### Prerequisites

- Node.js 22+
- npm

### Setup

```bash
# Install dependencies
npm run install-all

# Configure relay server
cp relay/.env.example relay/.env
# Edit relay/.env with your working directory

# Start development servers
npm run dev:local
```

Open http://localhost:4500 (app) - relay runs on :4501

## Project Structure

```
claude-pocket/
├── app/                    # Mobile app (Capacitor + React)
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── contexts/      # React contexts
│   │   ├── hooks/         # Custom hooks
│   │   ├── pages/         # Route pages
│   │   └── api/           # API client
│   └── capacitor.config.json
├── relay/                  # Relay server (runs on Mac)
│   └── src/
│       ├── index.js       # Express + WebSocket server
│       ├── pty-manager.js # node-pty process manager
│       └── routes/        # REST endpoints
└── .claude/commands/       # Slash commands
```

## Environment Variables

### Relay (`relay/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 4501) |
| `HOST` | Bind address (default: 0.0.0.0) |
| `WORKING_DIR` | Claude Code working directory |
| `CLAUDE_COMMAND` | Claude CLI command (default: claude) |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) |

### App (`app/.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_RELAY_URL` | WebSocket URL (default: ws://localhost:4501/ws) |
| `VITE_RELAY_API_URL` | REST API URL (default: http://localhost:4501) |

## Mobile Builds

### Android

```bash
# First time setup
cd app && npx cap add android && npx cap open android

# Build variants
npm run android:local    # Local relay
npm run android          # Production

# Build APK directly
npm run apk:local        # localDebug
npm run apk:prod         # prodRelease
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/feature-start` | Create a new feature branch |
| `/commit-push` | Safe commit with lint and security checks |
| `/lint-check` | Run ESLint with optional auto-fix |
| `/security-scan` | Scan for secrets and sensitive data |
| `/code-review` | Multi-agent code review |
| `/pr-flow` | Autonomous PR workflow |
| `/pr-merge` | Squash merge PR with cleanup |
| `/release` | Auto-bump version based on commits |

## Documentation

See [CLAUDE.md](./CLAUDE.md) for detailed project documentation.

## License

MIT
