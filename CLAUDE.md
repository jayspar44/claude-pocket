# Claude Pocket

Mobile-first client for Claude Code CLI via WebSocket relay.

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

## Execution Context

Claude Code may run from different locations. Determine where you're running before using SSH:

| Running From | How to Tell | Minibox Commands |
|--------------|-------------|------------------|
| Local Mac | `hostname` = local machine name | Use `ssh minibox "..."` |
| Minibox (via SSH) | `hostname` = `MiniBox.local` | Run directly, no SSH needed |

**Common scenario:** SSH from phone (Termux) → minibox → `claude`. In this case, Claude Code runs on minibox and all commands execute locally. No SSH wrapping needed for PM2, deploy scripts, etc.

## Project Structure

```
app/src/                         relay/src/
├─ components/                   ├─ index.js (Express + WS)
│  ├─ terminal/TerminalView      ├─ pty-manager.js
│  ├─ input/InputBar,QuickActions├─ websocket-handler.js
│  ├─ command/CommandPalette     ├─ ansi-preprocessor.js
│  ├─ status/StatusBar           └─ routes/commands.js,files.js
│  └─ files/FileBrowser
├─ contexts/RelayContext,Theme
├─ pages/Terminal,Settings
└─ api/relay-api.js
```

## Development

```bash
npm run install-all && cp relay/.env.example relay/.env
npm run dev:local    # app:4500, relay:4501
```

## Environment Variables

| Location | Variable | Default |
|----------|----------|---------|
| `relay/.env` | `HOST` | 0.0.0.0 |
| | `WORKING_DIR` | (required) |
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
| `/api/pty/status` | GET | PTY process status |
| `/api/pty/start` | POST | Start PTY process |
| `/api/pty/stop` | POST | Stop PTY process |
| `/api/pty/restart` | POST | Restart PTY process |
| `/api/pty/buffer` | GET | Get output buffer |
| `/api/commands` | GET | List available commands |
| `/api/files?path=` | GET | List files in directory |
| `/api/files/info?path=` | GET | Get file info |
| `/api/files/upload` | POST | Upload file (multipart) |
| `/api/files/upload-base64` | POST | Upload file (base64) |
| `/api/files/cleanup` | DELETE | Cleanup temp files |

**WebSocket `/ws`:**
| Direction | Message Types |
|-----------|---------------|
| Client→Server | `input` \| `submit` \| `resize` \| `interrupt` \| `restart` \| `status` \| `ping` |
| Server→Client | `output` \| `replay` \| `status` \| `pty-status` \| `pty-crash` \| `options-detected` \| `pong` |

## Android Builds

```bash
npm run android:local    # Local relay → Android Studio
npm run apk:local        # Build localDebug APK
npm run apk:prod         # Build prodRelease APK
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

**PM2 Commands:**
| Command | Description |
|---------|-------------|
| `pm2 status` | Check status |
| `pm2 logs` | Tail logs |
| `pm2 restart all` | Restart services |
| `pm2 stop all` | Stop services |
| `pm2 delete all` | Kill and remove from PM2 |
| `pm2 monit` | Live dashboard |

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
- Relay: Pino logger, JSON WebSocket protocol, single persistent PTY with buffer

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

**How it works:**
1. Analyzes commits since last tag
2. Determines bump type from commit prefixes
3. Updates all version files atomically
4. Creates commit: `chore(release): X.Y.Z`
5. Creates tag: `vX.Y.Z`
6. Pushes commit and tag

**Important:** Never manually create version tags. Always use `/release` to keep version files and tags in sync.

## Slash Commands

### Development

| Command | Usage | Description |
|---------|-------|-------------|
| `/feature-start` | `<name> [base]` | Create feature branch |
| `/commit-push` | `[-m "msg"] [--no-push]` | Commit with lint + security |
| `/lint-check` | `[--fix]` | ESLint app + relay |
| `/security-scan` | `[--staged\|--all]` | Scan for secrets |
| `/code-review` | | 4 parallel agents (Security, Standards, Logic, Perf) |
| `/pr-flow` | `[--no-fix] [--auto-merge]` | Autonomous PR workflow |
| `/pr-merge` | `<pr#> [--no-sync]` | Squash merge + cleanup |
| `/release` | `[--patch\|--minor\|--major\|--first]` | Version bump from commits |

### Minibox (PROD + DEV)

| Command | Usage | Description |
|---------|-------|-------------|
| `/deploy` | `--env <prod\|dev> [--skip-confirm]` | Deploy to minibox |
| `/status` | `--env <prod\|dev> [--health]` | Check PM2 status |
| `/logs` | `--env <prod\|dev> [--lines N] [--app\|--relay]` | View logs |
| `/restart` | `--env <prod\|dev> [--app\|--relay\|--all]` | Restart services |
| `/stop` | `--env <prod\|dev> [--app\|--relay\|--all]` | Stop services |

**Examples:**
```bash
/deploy --env prod           # Deploy to PROD
/status --env dev --health   # DEV status + health check
/logs --env prod --relay     # PROD relay logs only
/restart --env dev --app     # Restart DEV app only
```

**Dev Workflow:** `/feature-start` → code → `/commit-push` → `/pr-flow` → `/release`

**Deploy Workflow:** `/deploy --env prod` → `/status --env prod --health` → `/logs --env prod`
