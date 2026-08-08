# Relay

## Environment Variables

`relay/.env` — copy `relay/.env.example` to start. Production overrides in `relay/.env.production`.

| Variable | Default | Notes |
|----------|---------|-------|
| `HOST` | 0.0.0.0 | |
| `PORT` | 4501 | 4503 for DEV, set by `ecosystem.config.js` from the folder name |
| `CLAUDE_COMMAND` | claude | |
| `MAX_INSTANCES` | 10 | Max concurrent PTYs; published in `/api/health`, which the app mirrors as its tab cap once that fetch succeeds (it retries on each connect) |
| `ALLOWED_ORIGINS` | * | |
| `SHELL` | /bin/zsh | |
| `NODE_ENV` | development | |
| `LOG_LEVEL` | info | |
| `BUILDS_BASE` | `../claude-pocket-aabs` | Sibling of the repo |
| `BUILDS_DIR` | `$BUILDS_BASE/dev` or `/prod` by folder | What `/api/builds` serves |
