# Claude Pocket

Mobile-first client for Claude Code CLI that connects to a relay server via WebSocket.

**Doc style:** Tables over prose, inline formats (`|`-separated), no duplicate info, bullets not paragraphs.

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

**Stack:**
- **App**: React 19 + Vite 7 + Tailwind CSS 4 + Capacitor 8 + xterm.js
- **Relay**: Node.js 22 + Express 5 + WebSocket + node-pty

## Project Structure

```
claude-pocket/
├── app/                          # Mobile app (Capacitor + React)
│   ├── src/
│   │   ├── components/
│   │   │   ├── terminal/        # TerminalView (xterm.js wrapper)
│   │   │   ├── input/           # InputBar, QuickActions
│   │   │   ├── command/         # CommandPalette
│   │   │   ├── files/           # FileBrowser, ImagePicker
│   │   │   └── ui/              # Button, Card
│   │   ├── contexts/
│   │   │   ├── RelayContext.jsx # WebSocket connection state
│   │   │   └── ThemeContext.jsx
│   │   ├── hooks/
│   │   │   ├── useRelay.js
│   │   │   └── useCommandHistory.js
│   │   ├── pages/
│   │   │   ├── Terminal.jsx     # Main terminal page
│   │   │   └── Settings.jsx     # Configuration page
│   │   └── api/
│   │       └── relay-api.js     # Axios client for REST endpoints
│   └── capacitor.config.json
├── relay/                        # Relay server (runs on Mac)
│   ├── src/
│   │   ├── index.js             # Express + WebSocket server
│   │   ├── pty-manager.js       # node-pty process manager
│   │   ├── websocket-handler.js # WebSocket message protocol
│   │   ├── config.js            # Server configuration
│   │   └── routes/
│   │       ├── commands.js      # List .claude/commands/*.md
│   │       └── files.js         # File browser + upload
│   └── package.json
├── .claude/commands/             # Slash commands
└── package.json                  # Root monorepo scripts
```

## Local Development

**Prerequisites:** Node.js 22+, npm

```bash
# Setup
npm run install-all
cp relay/.env.example relay/.env
# Edit relay/.env with your working directory

# Run (http://localhost:4500 app, :4501 relay)
npm run dev:local          # Both servers
npm run dev:app            # App only
npm run dev:relay          # Relay only
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

## API Endpoints

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check with PTY status |
| GET | `/api/pty/status` | Get PTY process status |
| POST | `/api/pty/restart` | Restart Claude Code process |
| GET | `/api/commands` | List available slash commands |
| GET | `/api/commands/:name` | Get command file content |
| GET | `/api/files?path=` | List files in directory |
| POST | `/api/files/upload` | Upload file (for images) |
| GET | `/api/files/info` | Get working directory info |

### WebSocket Protocol (`/ws`)

**Client → Server:**
```json
{ "type": "input", "data": "text to send" }
{ "type": "resize", "cols": 80, "rows": 24 }
{ "type": "interrupt" }
{ "type": "restart" }
{ "type": "status" }
```

**Server → Client:**
```json
{ "type": "output", "data": "terminal output" }
{ "type": "replay", "data": "buffered output" }
{ "type": "status", "connected": true, "clientId": "..." }
{ "type": "pty-status", "running": true, "pid": 1234 }
```

## Mobile (Android/iOS)

Capacitor for native builds.

### Android Commands

```bash
# First time setup
cd app && npx cap add android && npx cap open android

# Build for Android Studio
npm run android:local              # Local relay
npm run android                    # Production

# Build APK directly
npm run apk:local                  # localDebug
npm run apk:prod                   # prodRelease
```

## Coding Conventions

### Naming
- **Files**: kebab-case (e.g., `relay-api.js`, `pty-manager.js`)
- **React Components**: PascalCase (e.g., `TerminalView.jsx`)
- **Variables/Functions**: camelCase
- **Directories**: kebab-case

### App Patterns
- **State**: React Context for global state (Relay, Theme)
- **API**: Use `api/relay-api.js` for REST calls
- **Styling**: Tailwind CSS utility classes
- **Mobile**: Capacitor plugin checks for native features

### Relay Patterns
- **Logging**: Use Pino logger
- **WebSocket**: JSON message protocol
- **PTY**: Single persistent Claude process with buffer replay

### Git Commits (Conventional Commits)

**Format**: `<type>: <description>`

| Type | When to Use | Version Bump |
|------|-------------|--------------|
| `feat:` | New feature | MINOR |
| `fix:` | Bug fix | PATCH |
| `feat!:` | Breaking change | MAJOR |
| `chore:` | Maintenance, deps | None |
| `docs:` | Documentation | None |
| `refactor:` | Code restructuring | None |

**Examples:** `feat: add command palette`, `fix: reconnection logic`, `chore: update deps`
