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

## CLI Prerequisites

The relay spawns one of `claude` (Claude Code), `agy` (Antigravity CLI), or `codex` (OpenAI Codex) per instance. Each must be installed and authenticated on the host before instances of that CLI type will work.

**Claude Code:** Install via official installer; ensure `claude` is on `PATH`.

**Antigravity CLI** (replaces Gemini CLI, deprecated 2026-06-18):

```bash
# Install on minibox (one-time)
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy --version    # verify

# First-time auth (one-time, interactive)
ssh minibox
agy              # prints authorization URL
# Open URL in a browser, complete Google Sign-In
# Token is saved to macOS keychain under the jayspar user
# PROD and DEV folders share this auth (same user)
```

**OpenAI Codex CLI:**

```bash
# Install on minibox (one-time) — pick one:
npm install -g @openai/codex
# or
curl -fsSL https://chatgpt.com/codex/install.sh | sh
# or
brew install --cask codex
codex --version    # verify

# First-time auth (one-time, interactive)
ssh minibox
codex login        # opens a browser flow; choose "Sign in with ChatGPT"
# Sign in with ChatGPT Plus/Pro/Business/Edu/Enterprise account
# (API-key auth is also supported via OPENAI_API_KEY for non-ChatGPT users)
# Credentials saved under ~/.codex/ for the jayspar user
# PROD and DEV folders share this auth (same user)

# Manual update (the relay also runs this automatically before spawn)
codex update
```

If any CLI is missing or unauthenticated, the PTY surfaces the error in the terminal view.

**Override binary paths** (optional, in `relay/.env`): `CLAUDE_COMMAND`, `ANTIGRAVITY_COMMAND`, `CODEX_COMMAND`.

## Project Structure

```
app/src/                         relay/src/
├─ components/                   ├─ index.js (Express + WS)
│  ├─ terminal/TerminalView      ├─ pty-manager.js
│  ├─ input/InputBar,QuickActions├─ pty-registry.js
│  ├─ command/CommandPalette     ├─ websocket-handler.js
│  ├─ StatusBar.jsx              ├─ routes/commands,files,builds
│  └─ files/FileBrowser          └─ ../test/ (node:test)
├─ contexts/Relay,Instance,Theme
├─ services/
│  ├─ InstanceConnection.js  one socket + its timers, per instance
│  ├─ ConnectionManager.js   the map + one shared heartbeat
│  ├─ instanceLimit.js, foregroundService.js
│  ├─ NotificationService.js
│  └─ __tests__/ (vitest)
├─ pages/Terminal,Settings
└─ api/relay-api.js
```

**Socket ownership:** `InstanceConnection` owns exactly one WebSocket and every timer belonging to
it — the object *is* the reference. `InstanceContext` holds no socket state. Do not reintroduce a
map keyed by instanceId that implies a socket's existence; that was the cause of #8 (output rendered
3-4x and growing), because any path that dropped the entry leaked the socket permanently.

## Development

```bash
npm run install-all && cp relay/.env.example relay/.env
npm run dev:local    # app:4500, relay:4501
```

## Testing

| Package | Runner | Location | Command |
|---------|--------|----------|---------|
| `relay/` | built-in `node:test` | `relay/test/*.test.js` | `cd relay && npm test` |
| `app/` | Vitest | `app/src/**/__tests__/*.test.js` | `cd app && npm test` (or `npm run test:app` from root) |

- **The app suite runs in the `node` environment — no jsdom, no React Testing Library.** That is
  deliberate: the connection layer takes an injected socket and clock, so every transition is
  testable without a browser. React components and hooks are therefore *not* covered. Adding jsdom is
  a real decision, not a default — say so rather than doing it silently.
- **`npm test` must exit on its own.** If it hangs, something leaked a handle (an un-`unref`'d
  interval is the usual cause). Fix the leak; do not reach for `--test-force-exit`.
- When fixing a bug, prove the test fails without the fix: revert the line, capture the failure,
  restore. A test that passes either way is worse than an acknowledged gap.

## Gotchas

- **Deploying re-captures the environment.** `deploy.sh` (and `npm run deploy`, `/deploy`) does
  `pm2 delete` + `pm2 start`, so PM2 snapshots the deploying shell's env and replays it on every
  later restart. `pm2 restart` alone does not. Deploying from Claude Code's Bash tool therefore bakes
  that tool's env into the relay — which is why the relay strips `CLAUDECODE` and
  `CLAUDE_CODE_CHILD_SESSION` from spawned PTYs (`relay/src/config.js`). Without the latter, every
  spawned CLI thinks it is a nested session and loses `--resume`/`--continue` history.
- **A busy PTY is never idle-reaped** — `cleanupIdleInstances` and `removeOldestIdle` both require
  `!isBusy && listeners === 0`, and `isBusy` covers `starting` as well as `running`. So dropping
  every WebSocket from an instance cannot kill its CLI — the buffer replays on reconnect. Useful for
  clearing stuck connections on a live relay.
- **PM2's `pm2 jlist` shows the env each process was launched with** — the fastest way to see what a
  deploy captured.
- **The relay and app deploy independently.** An older APK can be talking to a newer relay, so a
  relay change that alters what the client sees (close codes, new frame fields) has to stay
  compatible with builds already on phones.

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
| | `PORT` | 4501 (4503 for DEV, set by `ecosystem.config.js`) |
| | `CLAUDE_COMMAND` | claude |
| | `MAX_INSTANCES` | 10 — max concurrent PTYs; published in `/api/health`, which the app mirrors as its tab cap once that fetch succeeds (it retries on each connect) |
| | `ALLOWED_ORIGINS` | * |
| | `SHELL` | /bin/zsh |
| | `NODE_ENV` | development |
| | `LOG_LEVEL` | info |
| | `BUILDS_BASE` | `../claude-pocket-aabs` (sibling of the repo) |
| | `BUILDS_DIR` | `$BUILDS_BASE/dev` or `/prod` by folder — what `/api/builds` serves |
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
| `/api/health` | GET | Health check; returns `maxInstances` (the relay's PTY cap) |
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
| Client→Server | `input` \| `submit` \| `resize` \| `interrupt` \| `restart` \| `status` \| `set-instance` \| `replay` \| `ping` \| `geometry` |
| Server→Client | `output` \| `replay` \| `status` \| `pty-status` \| `pty-error` \| `pty-crash` \| `pty-restarting` \| `task-complete` \| `ready` \| `pong` |

**`set-instance` carries `userStart: true` only when the user explicitly taps Start.** It is the one
thing that clears a stopped session's `stoppedByUser` on the relay. An auto-reconnect handshake must
never carry it, or "stop means stopped" breaks and stopped CLIs resurrect on the next network blip.

**A stop lives on the `PtyManager` object and lasts exactly as long as it does.** There is no
registry-level memory of stopped ids — an earlier attempt at one was rewritten four times and
removed. Two consequences the code depends on:

| Stop path | Manager | Stop survives? | App behaviour after |
|-----------|---------|----------------|---------------------|
| `POST /api/pty/stop` (InstanceManager) | kept | yes, until relay restart or 30-min idle eviction | reconnects the tab — set-instance finds the manager and declines to auto-start |
| `DELETE /api/instances[/:id]` (Settings) | destroyed | no | must **not** reconnect — a reconnect arms a deferred start and respawns the CLI |

**The client completes its handshake on the relay's `pty-status` reply, not on socket open.** A
socket that opens but whose `set-instance` fails is not connected. Every `set-instance` path must
therefore answer: a `pty-status` when accepted, or a `pty-error` carrying `handshakeFailed: true`
when refused (e.g. the instance cap is reached). A refusal ends the attempt in `disconnected` with
the error shown — it does not retry, and it is not sticky, so selecting the tab tries once more.

## Android Builds

**Prerequisites:** Java JDK 21+ (Capacitor 8 generates `sourceCompatibility`/`targetCompatibility` 21 into `app/android/app/capacitor.build.gradle`), Android SDK 36 (`sdk.dir` in `app/android/local.properties`, or `ANDROID_HOME`)

**Build commands:**
| Command | Output | Description |
|---------|--------|-------------|
| `npm run apk:dev` | APK | Dev debug build |
| `npm run apk:prod` | APK | Prod release build |
| `npm run aab:dev` | AAB | Dev release for Play Store |
| `npm run aab:prod` | AAB | Prod release for Play Store |

**Output location:** `../claude-pocket-aabs/` (sibling of the repo), split by flavor — `prod` builds land in `prod/`, `dev` **and** `local` builds in `dev/`. Override with `AAB_OUTPUT_PATH` / `APK_OUTPUT_PATH`.

**Download builds:** each relay serves only its own folder — DEV `:4503/api/builds/` lists `dev/`, PROD `:4501/api/builds/` lists `prod/`. A dev build looked for on 4501 will appear to be missing.

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
npm run release              # Auto-bump from commits (feat→MINOR, fix→PATCH)
npm run release:minor        # Force minor bump
npm run release:patch        # Force patch bump
npm run release:major        # Force major bump
npm run release:first        # First release (no prior tags)
```

**How it works:** `standard-version` analyzes commits → determines bump → updates all version files → creates commit + tag. Then push: `git push --follow-tags`.

**Important:** Never manually create version tags. Always use `npm run release` to keep version files and tags in sync.

## Slash Commands

### Development (user-scope)

| Command | Usage | When to Use |
|---------|-------|-------------|
| `/commit-push` | `[-m "msg"] [--no-push]` | Ready to commit - runs lint+security before push |
| `/security-scan` | `[--staged\|--all]` | Verify no secrets before committing |
| `/code-review` | | Before PR - 4-agent parallel review |
| `/pr-flow` | `[--no-fix] [--auto-merge]` | End-to-end PR with auto-fix loop |
| `/pr-merge` | `<pr#> [--no-sync]` | Merge approved PR — no squash to main |

Standard workflows (feature branches, releases, lint) — just ask. `npm run release` / `npm run lint` / `git checkout -b feature/<name> develop`.

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
- **Dev:** `git checkout -b feature/<name> develop` → code → `/commit-push` → `/code-review` → `/pr-flow` → `npm run release`
- **Deploy:** `/deploy --env prod` → `/check-status --env prod --health` → `/logs --env prod`
