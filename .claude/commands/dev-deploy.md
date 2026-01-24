---
description: Deploy latest code to DEV on minibox
allowed-tools: Bash, AskUserQuestion
argument-hint: [--skip-confirm]
---

# Dev Deploy - Deploy to DEV Instance

Deploy the latest code from the current branch to the DEV instance on minibox.

## Arguments

- **--skip-confirm**: Skip confirmation prompt (use with caution)

## Usage

```bash
# Deploy with confirmation
/dev-deploy

# Deploy without confirmation (CI/automation)
/dev-deploy --skip-confirm
```

## Target Server

- **Host**: `minibox.rattlesnake-mimosa.ts.net`
- **Project path**: `~/Documents/projects/claude-pocket`
- **Services**: `claude-pocket-app-dev` (port 4502), `claude-pocket-relay-dev` (port 4503)

## What Gets Deployed

1. **Git pull**: Fetches latest code from current branch
2. **Dependencies**: Runs `npm install` for app and relay
3. **Build**: Builds the React app
4. **PM2 restart**: Restarts DEV services only

## Steps

### 1. Pre-Deploy Check

```bash
echo "════════════════════════════════════════"
echo "   DEV Deploy - minibox"
echo "════════════════════════════════════════"
echo ""

echo "🔍 Pre-Deploy Check"
echo "─────────────────────────────────────────"

# Check local branch
CURRENT_BRANCH=$(git branch --show-current)
echo "   Local branch: $CURRENT_BRANCH"

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo "   ⚠️  Uncommitted changes detected locally"
fi

# Check remote status
echo ""
echo "📡 Remote Status (minibox)"
echo "─────────────────────────────────────────"

ssh minibox.rattlesnake-mimosa.ts.net "cd ~/Documents/projects/claude-pocket && git fetch && git status -sb"

if [[ $? -ne 0 ]]; then
  echo ""
  echo "❌ Failed to connect to minibox"
  exit 1
fi
```

### 2. Confirm Deploy

Unless `--skip-confirm` is provided, use AskUserQuestion:

- Question: "Deploy latest code to DEV instance?"
- Show: Current branch, any warnings
- Options:
  - "Yes, deploy to DEV"
  - "Cancel"

### 3. Execute Deploy

```bash
echo ""
echo "🚀 Deploying to DEV..."
echo "─────────────────────────────────────────"
echo ""

# Pull latest code, install deps, build, and restart DEV services only
ssh minibox.rattlesnake-mimosa.ts.net "cd ~/Documents/projects/claude-pocket && \
  git pull && \
  npm install --prefix app && \
  npm install --prefix relay && \
  npm run build --prefix app && \
  pm2 restart claude-pocket-app-dev claude-pocket-relay-dev"

DEPLOY_EXIT=$?

if [[ $DEPLOY_EXIT -ne 0 ]]; then
  echo ""
  echo "❌ DEV Deploy failed"
  echo ""
  echo "Check logs:"
  echo "   /dev-logs --errors"
  echo ""
  echo "Or SSH manually:"
  echo "   ssh minibox.rattlesnake-mimosa.ts.net"
  echo "   cd ~/Documents/projects/claude-pocket"
  exit 1
fi
```

### 4. Verify Deployment

```bash
echo ""
echo "✅ DEV Deploy Complete"
echo "─────────────────────────────────────────"
echo ""

# Show PM2 status for DEV services
echo "📊 DEV Service Status"
ssh minibox.rattlesnake-mimosa.ts.net "pm2 status | grep -E '(id|claude-pocket-dev)'"

# Health check
echo ""
echo "🏥 Health Check"
echo "─────────────────────────────────────────"

sleep 3  # Wait for services to fully start

HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://minibox.rattlesnake-mimosa.ts.net:4503/api/health")

if [[ "$HEALTH_RESPONSE" == "200" ]]; then
  echo "   ✅ DEV Relay API: Healthy"
else
  echo "   ❌ DEV Relay API: HTTP $HEALTH_RESPONSE"
fi

APP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://minibox.rattlesnake-mimosa.ts.net:4502")

if [[ "$APP_RESPONSE" == "200" ]]; then
  echo "   ✅ DEV App: Serving"
else
  echo "   ❌ DEV App: HTTP $APP_RESPONSE"
fi
```

### 5. Summary

```bash
echo ""
echo "════════════════════════════════════════"
echo "   🎉 DEV Deployment Successful"
echo "════════════════════════════════════════"
echo ""
echo "   DEV App URL: http://minibox.rattlesnake-mimosa.ts.net:4502"
echo ""
echo "   Commands:"
echo "   /dev-status  - Check status"
echo "   /dev-logs    - View logs"
echo "   /dev-restart - Restart services"
echo ""
echo "════════════════════════════════════════"
```

## Expected Output

```
════════════════════════════════════════
   DEV Deploy - minibox
════════════════════════════════════════

🔍 Pre-Deploy Check
─────────────────────────────────────────
   Local branch: feature/multi-instance-notifications

📡 Remote Status (minibox)
─────────────────────────────────────────
## feature/multi-instance-notifications...origin/feature/multi-instance-notifications [behind 2]

🚀 Deploying to DEV...
─────────────────────────────────────────

Already up to date.
...build output...
[PM2] Applying action restartProcessId on app [claude-pocket-app-dev]...
[PM2] Applying action restartProcessId on app [claude-pocket-relay-dev]...

✅ DEV Deploy Complete
─────────────────────────────────────────

📊 DEV Service Status
│ 2   │ claude-pocket-app-dev    │ fork │ online │ 0%  │ 42M │
│ 3   │ claude-pocket-relay-dev  │ fork │ online │ 0%  │ 65M │

🏥 Health Check
─────────────────────────────────────────
   ✅ DEV Relay API: Healthy
   ✅ DEV App: Serving

════════════════════════════════════════
   🎉 DEV Deployment Successful
════════════════════════════════════════

   DEV App URL: http://minibox.rattlesnake-mimosa.ts.net:4502

   Commands:
   /dev-status  - Check status
   /dev-logs    - View logs
   /dev-restart - Restart services

════════════════════════════════════════
```

## Differences from /prod-deploy

| Aspect | /prod-deploy | /dev-deploy |
|--------|--------------|-------------|
| Services | claude-pocket-app/relay | claude-pocket-app-dev/relay |
| Ports | 4500/4501 | 4502/4503 |
| Branch | Usually main | Current branch |
| Script | deploy.sh (full) | Git pull + build + restart |

## Notes

- Deploys from whatever branch is checked out on minibox
- Does NOT use deploy.sh (which targets PROD)
- Only restarts DEV services, PROD unaffected
- Build happens on minibox (not locally)
- Active WebSocket connections will be dropped during deploy
