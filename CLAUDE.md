# Claude Pocket

Mobile-first client for Claude Code CLI via WebSocket relay.

## Execution Context (READ FIRST)

**Always check hostname before running commands:**
```bash
hostname  # MiniBox.local = on minibox, run commands directly
          # Other = local Mac, use SSH for minibox commands
```

| Running From | Minibox Commands |
|--------------|------------------|
| Minibox (`hostname` = `MiniBox.local`) | Run directly: `pm2 status`, `./scripts/deploy.sh` |
| Local Mac | Use SSH: `ssh minibox "pm2 status"` |

**Common scenario:** SSH from phone → minibox → `claude`. You're ON minibox, no SSH needed.

## Style Guide

- **Tables over prose** - use tables for lists of items with attributes
- **Bullets not paragraphs** - break info into scannable points
- **Inline formats** - use `|`-separated for simple lists
- **No redundancy** - don't repeat info from other sections
- **Concise** - omit needless words, be precise

## Architecture

```
Mobile App (Capacitor/React) ◄──WebSocket──► Relay Server (Mac)
├─ xterm.js terminal                         ├─ node-pty + Claude CLI
├─ Quick actions / Command palette           ├─ File browser API
└─ Native keyboard                           └─ Output buffer replay
```

**Stack:** App: React 19 + Vite 7 + Tailwind 4 + Capacitor 8 | Relay: Node 22 + Express 5 + node-pty

## Project Structure

```
app/src/                         relay/src/
├─ components/                   ├─ index.js (Express + WS)
│  ├─ terminal/TerminalView      ├─ pty-manager.js
│  ├─ input/InputBar,QuickActions├─ pty-registry.js
│  ├─ command/CommandPalette     ├─ websocket-handler.js
│  ├─ StatusBar.jsx              ├─ ansi-preprocessor.js
│  └─ files/FileBrowser          └─ routes/commands,files,builds
├─ contexts/Relay,Instance,Theme
├─ pages/Terminal,Settings
└─ api/relay-api.js
```

## Development

```bash
npm run install-all && cp relay/.env.example relay/.env
npm run dev:local    # app:4500, relay:4501
```

## NPM Scripts

Run from repo root with `npm run <script>`:

| Script | Description |
|--------|-------------|
| `install-all` | Install deps for root, app, and relay |
| `build` | Install all + build app |
| `lint` | ESLint both app and relay |
| `start` | Start relay server |
| `dev` | Start relay with nodemon |
| `dev:local` | Start app + relay with local ports |
| `dev:relay` | Start relay only (dev mode) |
| `dev:app` | Start app only (dev mode) |
| `build:app` | Build app for production |
| `android` | Open Android Studio (prod config) |
| `android:dev` | Open Android Studio (dev config) |
| `android:local` | Open Android Studio (local relay) |
| `android:local-livereload` | Android with live reload |
| `apk` | Build APK (default) |
| `apk:dev` | Build APK (dev config) |
| `apk:local` | Build APK (local relay) |
| `apk:prod` | Build APK (prod config) |
| `aab` | Build AAB for Play Store (prod) |
| `aab:dev` | Build AAB (dev config) |
| `aab:prod` | Build AAB (prod config) |
| `test:app` | Run app tests |
| `deploy` | Run deploy script |
| `pm2:start` | Start PM2 services |
| `pm2:stop` | Stop PM2 services |
| `pm2:restart` | Restart PM2 services |
| `pm2:logs` | Tail PM2 logs |
| `pm2:status` | Check PM2 status |
| `version:get` | Get current version |
| `release` | Auto version bump |
| `release:patch` | Force patch bump |
| `release:minor` | Force minor bump |
| `release:major` | Force major bump |
| `release:first` | First release |

**Common usage:**
```bash
npm run lint           # Check code quality (NOT lint:app or lint:relay)
npm run dev:local      # Full local dev environment
npm run build          # Production build
```

## Environment Variables

| Location | Variable | Default |
|----------|----------|---------|
| `relay/.env` | `HOST` | 0.0.0.0 |
| | `CLAUDE_COMMAND` | claude |
| | `ALLOWED_ORIGINS` | * |
| | `SHELL` | /bin/zsh |
| | `NODE_ENV` | development |
| `app/.env.production` | `VITE_RELAY_HOST` | minibox.rattlesnake-mimosa.ts.net |
| | `VITE_PROD_APP_PORT` | 4500 |
| | `VITE_PROD_RELAY_PORT` | 4501 |
| | `VITE_DEV_APP_PORT` | 4502 |
| | `VITE_DEV_RELAY_PORT` | 4503 |
| | `VITE_RELAY_URL` | ws://minibox...:4501/ws |
| | `VITE_RELAY_API_URL` | http://minibox...:4501 |

**Port auto-detection:** `ecosystem.config.js` sets PORT based on folder name (`-dev` suffix → DEV ports)

**Production files:** `relay/.env.production` | `app/.env.production`

## API

**REST:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/instances` | GET/POST/DELETE | Multi-instance management |
| `/api/pty/status` | GET | PTY process status |
| `/api/pty/start` | POST | Start PTY process |
| `/api/pty/stop` | POST | Stop PTY process |
| `/api/pty/restart` | POST | Restart PTY process |
| `/api/pty/buffer` | GET | Get output buffer |
| `/api/commands` | GET | List available commands |
| `/api/files?path=` | GET | List files in directory |
| `/api/files/upload` | POST | Upload file (multipart) |
| `/api/files/upload-base64` | POST | Upload file (base64) |
| `/api/files/cleanup` | DELETE | Cleanup temp files |
| `/api/builds` | GET | List APK/AAB builds |
| `/api/builds/:filename` | GET | Download a build |
| `/api/builds/:filename` | DELETE | Delete a build |

**WebSocket `/ws`:**
| Direction | Message Types |
|-----------|---------------|
| Client→Server | `input` \| `submit` \| `resize` \| `interrupt` \| `restart` \| `status` \| `set-instance` \| `ping` |
| Server→Client | `output` \| `replay` \| `status` \| `pty-status` \| `pty-crash` \| `options-detected` \| `ready` \| `pong` |

## Android Builds

**Prerequisites:** Java JDK 17+, Android SDK (ANDROID_HOME set)

**Build commands:**
| Command | Output | Description |
|---------|--------|-------------|
| `npm run apk:dev` | APK | Dev debug build |
| `npm run apk:prod` | APK | Prod release build |
| `npm run aab:dev` | AAB | Dev release for Play Store |
| `npm run aab:prod` | AAB | Prod release for Play Store |

**Output location:** `~/aabs/` (served via `/api/builds`)

**Download builds:** `http://minibox...:4501/api/builds/` lists all builds with download links

**Android Studio (for debugging):**
```bash
npm run android:local    # Local relay → Android Studio
npm run android:dev      # Dev relay → Android Studio
```

**Release signing:** Set environment variables before AAB builds:
```bash
export KEYSTORE_PATH=~/keys/claude-pocket.keystore
export KEYSTORE_PASSWORD="..."
export KEY_ALIAS="..."
export KEY_PASSWORD="..."
npm run aab:prod
```

## Production Deployment (minibox)

**Dual Instance Setup:** Two separate folders for independent deployment:

| Instance | Folder | App Port | Relay Port |
|----------|--------|----------|------------|
| PROD | `claude-pocket` | 4500 | 4501 |
| DEV | `claude-pocket-dev` | 4502 | 4503 |

**Deploy:**
```bash
# Via slash command (recommended)
/deploy --env prod     # Deploy PROD
/deploy --env dev      # Deploy DEV

# If running on minibox (no SSH needed)
cd ~/Documents/projects/claude-pocket && ./scripts/deploy.sh
cd ~/Documents/projects/claude-pocket-dev && ./scripts/deploy.sh

# If running from local Mac (SSH required)
ssh minibox "cd ~/Documents/projects/claude-pocket && ./scripts/deploy.sh"
```

**Auto-detection:** Same `deploy.sh` and `ecosystem.config.js` in both folders detect environment from folder name (`-dev` suffix).

**Access:**
| Service | URL | Port |
|---------|-----|------|
| PROD App | `http://minibox.rattlesnake-mimosa.ts.net:4500` | 4500 |
| PROD Relay | `ws://minibox.rattlesnake-mimosa.ts.net:4501/ws` | 4501 |
| DEV App | `http://minibox.rattlesnake-mimosa.ts.net:4502` | 4502 |
| DEV Relay | `ws://minibox.rattlesnake-mimosa.ts.net:4503/ws` | 4503 |

**PM2 Commands:** `pm2 status` | `pm2 logs` | `pm2 restart all` | `pm2 stop all` | `pm2 delete all` | `pm2 monit`

**Auto-start on boot (first time only):**
```bash
pm2 startup    # Follow instructions to run sudo command
pm2 save       # Save process list
```

**Disable auto-start:** `pm2 unstartup`

**Config files per folder:** `ecosystem.config.js` | `relay/.env.production` | `app/.env.production`

## Conventions

**Naming:** Files: kebab-case | Components: PascalCase | Variables: camelCase

**Patterns:**
- App: React Context for state, Tailwind for styling, `api/relay-api.js` for REST
- Relay: Pino logger, JSON WebSocket protocol, multi-instance PTY with buffer

**Commits:** `<type>: <description>`

| Type | Bump | Type | Bump |
|------|------|------|------|
| `feat:` | MINOR | `fix:` | PATCH |
| `feat!:` | MAJOR | `chore:/docs:/refactor:` | None |

## Versioning

Uses `standard-version` for semantic versioning based on conventional commits.

**Version files (all kept in sync):**
| File | Purpose |
|------|---------|
| `version.json` | Source of truth, imported by app |
| `package.json` | Root package |
| `app/package.json` | App package |
| `relay/package.json` | Relay package |
| `CHANGELOG.md` | Auto-generated changelog |

**Release workflow:**
```bash
/release              # Auto-bump based on commits (feat→MINOR, fix→PATCH)
/release --minor      # Force minor bump
/release --patch      # Force patch bump
/release --major      # Force major bump
```

**How it works:** Analyzes commits → determines bump → updates all version files → creates commit + tag → pushes.

**Important:** Never manually create version tags. Always use `/release` to keep version files and tags in sync.

## Slash Commands

### Development

| Command | Usage | When to Use |
|---------|-------|-------------|
| `/feature-start` | `<name> [base]` | Starting new work - creates branch from base |
| `/commit-push` | `[-m "msg"] [--no-push]` | Ready to commit - runs lint+security before push |
| `/lint-check` | `[--fix]` | Check code quality before committing |
| `/security-scan` | `[--staged\|--all]` | Verify no secrets before committing |
| `/code-review` | | Before PR - 4-agent parallel review |
| `/pr-flow` | `[--no-fix] [--auto-merge]` | End-to-end PR with auto-fix loop |
| `/pr-merge` | `<pr#> [--no-sync]` | Merge approved PR with branch cleanup |
| `/release` | `[--patch\|--minor\|--major\|--first]` | After merging to main - bumps version from commits |

### Minibox Operations

| Command | Usage | When to Use |
|---------|-------|-------------|
| `/deploy` | `--env <prod\|dev> [--skip-confirm]` | Push code to PROD or DEV instance |
| `/check-status` | `--env <prod\|dev> [--health]` | Check if services are running |
| `/logs` | `--env <prod\|dev> [--lines N] [--app\|--relay]` | Debug issues, view recent output |
| `/restart` | `--env <prod\|dev> [--app\|--relay\|--all]` | After config changes or to fix stuck state |
| `/stop` | `--env <prod\|dev> [--app\|--relay\|--all]` | Pause services without removing from PM2 |

### Build

| Command | Usage | When to Use |
|---------|-------|-------------|
| `/build-aab` | | Building Play Store release (AAB format) |

**Workflows:**
- **Dev:** `/feature-start` → code → `/commit-push` → `/code-review` → `/pr-flow` → `/release`
- **Deploy:** `/deploy --env prod` → `/check-status --env prod --health` → `/logs --env prod`
