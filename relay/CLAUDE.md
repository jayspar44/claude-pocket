# Relay

## Environment Variables

Set in `relay/.env`. `relay/.env.production` is a one-time **seed, not an override**:
`scripts/deploy.sh` copies it to `.env` only when `.env` does not exist, so editing it on a host
that has already deployed changes nothing.

`relay/src/index.js` calls `dotenv.config()` without `override`, so a variable already present in
the process env beats anything in `relay/.env` — that is what the *injected* rows below mean.

| Variable | Default | Notes |
|----------|---------|-------|
| `HOST` | 0.0.0.0 | |
| `PORT` | 4501 | *injected* — PM2 (`ecosystem.config.js`) and `npm run dev:local` (`scripts/dev-with-ports.js`) both set it, so `.env` cannot change it; 4503 in a `-dev` folder |
| `NODE_ENV` | development | *injected* under PM2 — `ecosystem.config.js` sets `production` |
| `SHELL` | /bin/zsh | *injected* — every login shell exports it, so the inherited value wins |
| `CLAUDE_COMMAND` | claude | |
| `ANTIGRAVITY_COMMAND` | agy | |
| `CODEX_COMMAND` | codex | |
| `MAX_INSTANCES` | 10 | Max concurrent PTYs; published in `/api/health`, which the app mirrors as its tab cap once that fetch succeeds (it retries on each connect) |
| ~~`ALLOWED_ORIGINS`~~ | — | **Read by nothing.** CORS is deliberately open; enforcing it once took the app's REST surface down because PM2 replays a stale list. See `relay/src/index.js` |
| `LOG_LEVEL` | info | |
| `BUILDS_BASE` | `../claude-pocket-aabs` | Sibling of the repo |
| `BUILDS_DIR` | `$BUILDS_BASE/dev` or `/prod` by folder | What `/api/builds` serves |
