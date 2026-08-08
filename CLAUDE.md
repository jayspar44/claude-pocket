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

## Socket Ownership

`InstanceConnection` owns exactly one WebSocket and every timer belonging to
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

Full list: `npm run` or `package.json`. Non-obvious ones:

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

REST routes live in `relay/src/routes/`; WebSocket message types in `relay/src/websocket-handler.js`. The contracts below are not derivable from either.

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

Uses `standard-version`; the `release:*` scripts in `package.json` are the entry points.

**Important:** Never manually create version tags. Always use `npm run release` to keep version files and tags in sync.

## Slash Commands

Available commands are listed to each session automatically; definitions live in `.claude/commands/` and `~/.claude/commands/`. Task detail for builds, deployment and CLI setup now lives in `.claude/skills/`.

**Workflows:**
- **Dev:** `git checkout -b feature/<name> develop` → code → `/commit-push` → `/code-review` → `/pr-flow` → `npm run release`
- **Deploy:** `/deploy --env prod` → `/check-status --env prod --health` → `/logs --env prod`
