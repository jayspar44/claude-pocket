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
npm run lint         # both packages — there is no root lint:app / lint:relay
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
- **PM2 replays the env each process was launched with, including values you have since deleted.**
  `pm2 jlist` shows what a process actually captured — the fastest way to see what a deploy baked
  in. Check it before trusting `relay/.env`, and before making any config value newly load-bearing:
  a stale `ALLOWED_ORIGINS` still live in PM2 from an old `.env.example` is why CORS enforcement was
  reverted.
- **CORS is open by design and the `cors` package is deliberately not a dependency.** One user on a
  private tailnet has no origin worth allowlisting, and enforcing one broke the app silently — so
  the few header lines in `relay/src/index.js` are the whole story. Don't reinstall it.
- **The relay and app deploy independently, but the same person ships both.** A protocol change
  that needs a matching app release is fine — cut both. What is *not* fine is a relay change that
  fails silently on the client: the WebSocket is not subject to CORS, so a REST-layer break leaves
  a working terminal, a clean 200 in the relay log, and no error anywhere.

## Environment Variables

Relay variables: `relay/CLAUDE.md`.

**App build-time variables live in `app/.env.production`, which is gitignored** — a fresh clone has
none, and `npm run aab:prod` then silently falls back to the hardcoded defaults in
`app/src/api/relay-api.js` and ships pointing at the wrong relay. Values differ per checkout (a
`-dev` folder holds DEV values), so recreate the file with these keys:

| Variable | Meaning |
|----------|---------|
| `VITE_APP_ENV` | `dev` or `prod` — drives the env badge in the app |
| `VITE_RELAY_HOST` | Tailscale hostname of the relay |
| `VITE_PROD_APP_PORT` / `VITE_PROD_RELAY_PORT` | 4500 / 4501 |
| `VITE_DEV_APP_PORT` / `VITE_DEV_RELAY_PORT` | 4502 / 4503 |
| `VITE_RELAY_URL` | `ws://<host>:<relay port>/ws` — fallback when auto-detect fails |
| `VITE_RELAY_API_URL` | `http://<host>:<relay port>` — same fallback |

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

**Commits:** `<type>: <description>` (conventional commits; `standard-version` derives the bump)

## Versioning

Uses `standard-version`; the `release:*` scripts in `package.json` are the entry points.

**Important:** Never manually create version tags. Always use `npm run release` to keep version files and tags in sync.

## Slash Commands

Definitions live in `.claude/commands/` and `~/.claude/commands/`; task detail for builds, deployment and CLI setup lives in `.claude/skills/`.

**Workflows:**
- **Dev:** `git checkout -b feature/<name> develop` → code → `/commit-push` → `/code-review` → `/pr-flow` → `npm run release`
- **Deploy:** `/deploy --env prod` → `/check-status --env prod --health` → `/logs --env prod`
