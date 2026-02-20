---
description: Deploy to minibox (PROD or DEV)
allowed-tools: Bash, AskUserQuestion
argument-hint: --env <prod|dev> [--skip-confirm]
---

# Deploy - Deploy to Minibox

Deploy the latest code to the specified environment on minibox.

## Arguments

- **--env prod**: Deploy to PROD (claude-pocket, ports 4500/4501)
- **--env dev**: Deploy to DEV (claude-pocket-dev, ports 4502/4503)
- **--skip-confirm**: Skip confirmation prompt (use with caution)

## Usage

```bash
# Deploy to PROD
/deploy --env prod

# Deploy to DEV
/deploy --env dev

# Deploy without confirmation (CI/automation)
/deploy --env prod --skip-confirm
```

## Steps

### 1. Parse and Validate Arguments

Parse the `--env` flag. It is **required** and must be either `prod` or `dev`.

If missing or invalid:
```bash
echo "Error: --env flag is required"
echo "Usage: /deploy --env <prod|dev> [--skip-confirm]"
echo ""
echo "Examples:"
echo "  /deploy --env prod     # Deploy to PROD"
echo "  /deploy --env dev      # Deploy to DEV"
exit 1
```

### 2. Set Environment Variables

Based on `--env` value:

**If --env prod:**
```bash
ENV="PROD"
APP_PORT=4500
RELAY_PORT=4501
PROJECT_PATH="~/Documents/projects/claude-pocket"
APP_SERVICE="claude-pocket-app"
RELAY_SERVICE="claude-pocket-relay"
```

**If --env dev:**
```bash
ENV="DEV"
APP_PORT=4502
RELAY_PORT=4503
PROJECT_PATH="~/Documents/projects/claude-pocket-dev"
APP_SERVICE="claude-pocket-app-dev"
RELAY_SERVICE="claude-pocket-relay-dev"
```

### 3. Setup Execution Helpers

Add helper functions to detect if running locally on minibox:

```bash
# Check if already on minibox (hostname is "MiniBox.local" or "MiniBox")
is_on_minibox() {
  [[ "$(hostname)" == "MiniBox"* ]] || [[ "$(hostname -s 2>/dev/null)" == minibox* ]]
}

# Run command locally or via SSH
run_on_minibox() {
  if is_on_minibox; then
    eval "$1"
  else
    ssh minibox.rattlesnake-mimosa.ts.net "$1"
  fi
}
```

### 4. Pre-Deploy Check

```bash
echo "============================================"
echo "   $ENV Deploy - minibox"
echo "============================================"
echo ""

# Show execution mode
if is_on_minibox; then
  echo "   Execution: Local (on minibox)"
else
  echo "   Execution: Remote (via SSH)"
fi
echo ""

echo "Pre-Deploy Check"
echo "--------------------------------------------"

# Check local branch
CURRENT_BRANCH=$(git branch --show-current)
echo "   Local branch: $CURRENT_BRANCH"

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo "   Warning: Uncommitted changes detected locally"
fi

# Check remote status
echo ""
echo "Remote Status (minibox)"
echo "--------------------------------------------"

run_on_minibox "cd $PROJECT_PATH && git fetch && git status -sb"

if [[ $? -ne 0 ]]; then
  echo ""
  echo "Failed to connect to minibox"
  exit 1
fi
```

### 5. Confirm Deploy

Unless `--skip-confirm` is provided, use AskUserQuestion:

- Question: "Deploy latest code to $ENV?"
- Options:
  - "Yes, deploy to $ENV"
  - "Cancel"

### 6. Execute Deploy

```bash
echo ""
echo "Deploying to $ENV..."
echo "--------------------------------------------"
echo ""

run_on_minibox "cd $PROJECT_PATH && git pull && ./scripts/deploy.sh"

DEPLOY_EXIT=$?

if [[ $DEPLOY_EXIT -ne 0 ]]; then
  echo ""
  echo "Deploy failed"
  echo ""
  echo "Check logs:"
  echo "   /logs --env $ENV_LOWER --errors"
  echo ""
  echo "Or SSH manually:"
  echo "   ssh minibox.rattlesnake-mimosa.ts.net"
  echo "   cd $PROJECT_PATH"
  echo "   ./scripts/deploy.sh"
  exit 1
fi
```

### 7. Verify Deployment

```bash
echo ""
echo "Deploy Complete"
echo "--------------------------------------------"
echo ""

# Show PM2 status (filtered to env-specific services)
echo "Service Status"
run_on_minibox "pm2 status"

# Health check
echo ""
echo "Health Check"
echo "--------------------------------------------"

sleep 3  # Wait for services to fully start

HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://minibox.rattlesnake-mimosa.ts.net:$RELAY_PORT/api/health")

if [[ "$HEALTH_RESPONSE" == "200" ]]; then
  echo "   Relay API: Healthy"
else
  echo "   Relay API: HTTP $HEALTH_RESPONSE"
fi

APP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://minibox.rattlesnake-mimosa.ts.net:$APP_PORT")

if [[ "$APP_RESPONSE" == "200" ]]; then
  echo "   App: Serving"
else
  echo "   App: HTTP $APP_RESPONSE"
fi
```

### 8. Summary

```bash
echo ""
echo "============================================"
echo "   $ENV Deployment Successful"
echo "============================================"
echo ""
echo "   App URL: http://minibox.rattlesnake-mimosa.ts.net:$APP_PORT"
echo ""
echo "   Commands:"
echo "   /check-status --env $ENV_LOWER  - Check status"
echo "   /logs --env $ENV_LOWER    - View logs"
echo "   /restart --env $ENV_LOWER - Restart services"
echo ""
echo "============================================"
```

## Environment Mapping

| Flag | Project Path | App Port | Relay Port | Services |
|------|--------------|----------|------------|----------|
| `--env prod` | `claude-pocket` | 4500 | 4501 | `claude-pocket-app`, `claude-pocket-relay` |
| `--env dev` | `claude-pocket-dev` | 4502 | 4503 | `claude-pocket-app-dev`, `claude-pocket-relay-dev` |

## Troubleshooting

### Git Pull Failed
```
error: Your local changes would be overwritten

Fix on minibox:
ssh minibox.rattlesnake-mimosa.ts.net
cd ~/Documents/projects/claude-pocket[-dev]
git stash  # or git reset --hard
git pull
./scripts/deploy.sh
```

### Build Failed
```
npm ERR! ...

Check:
- Node version: node --version (should be 22+)
- Dependencies: rm -rf node_modules && npm install
- Disk space: df -h
```

### Services Won't Start
```
PM2 shows "errored" status

Check logs:
/logs --env <prod|dev> --errors

Common fixes:
- Check .env files exist
- Verify ports are free
- Check WORKING_DIR in relay/.env.production
```

## Notes

- Deploys from whatever branch is checked out on minibox (usually main)
- Does `git pull` before running deploy script
- Build happens on minibox (not locally)
- Active WebSocket connections will be dropped during deploy
- For config changes only (no code), use `/restart --env <prod|dev>`
