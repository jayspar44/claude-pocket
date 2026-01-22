---
description: Deploy latest code to production on minibox
allowed-tools: Bash, AskUserQuestion
argument-hint: [--skip-confirm]
---

# Prod Deploy - Deploy to Production

Deploy the latest code from the main branch to the production instance on minibox.

## Arguments

- **--skip-confirm**: Skip confirmation prompt (use with caution)

## Usage

```bash
# Deploy with confirmation
/prod-deploy

# Deploy without confirmation (CI/automation)
/prod-deploy --skip-confirm
```

## Target Server

- **Host**: `minibox.rattlesnake-mimosa.ts.net`
- **Project path**: `~/Documents/projects/claude-pocket`
- **Deploy script**: `./scripts/deploy.sh`

## What Gets Deployed

The deploy script (`scripts/deploy.sh`) performs:

1. **Environment setup**: Copies `.env.production` files
2. **PM2 install**: Ensures PM2 is installed globally
3. **Dependencies**: Runs `npm install` for app and relay
4. **Build**: Builds the React app for production
5. **PM2 start/restart**: Starts or restarts services via `ecosystem.config.js`

## Steps

### 1. Pre-Deploy Check

```bash
echo "════════════════════════════════════════"
echo "   Production Deploy - minibox"
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

- Question: "Deploy latest code to production?"
- Show: Current branch, any warnings
- Options:
  - "Yes, deploy to production"
  - "Cancel"

### 3. Execute Deploy

```bash
echo ""
echo "🚀 Deploying..."
echo "─────────────────────────────────────────"
echo ""

ssh minibox.rattlesnake-mimosa.ts.net "cd ~/Documents/projects/claude-pocket && git pull && ./scripts/deploy.sh"

DEPLOY_EXIT=$?

if [[ $DEPLOY_EXIT -ne 0 ]]; then
  echo ""
  echo "❌ Deploy failed"
  echo ""
  echo "Check logs:"
  echo "   /prod-logs --errors"
  echo ""
  echo "Or SSH manually:"
  echo "   ssh minibox.rattlesnake-mimosa.ts.net"
  echo "   cd ~/Documents/projects/claude-pocket"
  echo "   ./scripts/deploy.sh"
  exit 1
fi
```

### 4. Verify Deployment

```bash
echo ""
echo "✅ Deploy Complete"
echo "─────────────────────────────────────────"
echo ""

# Show PM2 status
echo "📊 Service Status"
ssh minibox.rattlesnake-mimosa.ts.net "pm2 status"

# Health check
echo ""
echo "🏥 Health Check"
echo "─────────────────────────────────────────"

sleep 3  # Wait for services to fully start

HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://minibox.rattlesnake-mimosa.ts.net:4501/api/health")

if [[ "$HEALTH_RESPONSE" == "200" ]]; then
  echo "   ✅ Relay API: Healthy"
else
  echo "   ❌ Relay API: HTTP $HEALTH_RESPONSE"
fi

APP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://minibox.rattlesnake-mimosa.ts.net:4500")

if [[ "$APP_RESPONSE" == "200" ]]; then
  echo "   ✅ App: Serving"
else
  echo "   ❌ App: HTTP $APP_RESPONSE"
fi
```

### 5. Summary

```bash
echo ""
echo "════════════════════════════════════════"
echo "   🎉 Deployment Successful"
echo "════════════════════════════════════════"
echo ""
echo "   App URL: http://minibox.rattlesnake-mimosa.ts.net:4500"
echo ""
echo "   Commands:"
echo "   /prod-status  - Check status"
echo "   /prod-logs    - View logs"
echo "   /prod-restart - Restart services"
echo ""
echo "════════════════════════════════════════"
```

## Expected Output

```
════════════════════════════════════════
   Production Deploy - minibox
════════════════════════════════════════

🔍 Pre-Deploy Check
─────────────────────────────────────────
   Local branch: main

📡 Remote Status (minibox)
─────────────────────────────────────────
## main...origin/main [behind 2]

🚀 Deploying...
─────────────────────────────────────────

Already up to date.
Setting up environment files...
Installing dependencies...
Building app...
Starting services with PM2...
[PM2] Applying action restartProcessId on app [all]...
✅ Deploy complete!

✅ Deploy Complete
─────────────────────────────────────────

📊 Service Status
┌─────┬──────────────────────┬──────┬────────┬───────────┐
│ id  │ name                 │ mode │ status │ cpu │ mem │
├─────┼──────────────────────┼──────┼────────┼─────┼─────┤
│ 0   │ claude-pocket-app    │ fork │ online │ 0%  │ 42M │
│ 1   │ claude-pocket-relay  │ fork │ online │ 0%  │ 65M │
└─────┴──────────────────────┴──────┴────────┴─────┴─────┘

🏥 Health Check
─────────────────────────────────────────
   ✅ Relay API: Healthy
   ✅ App: Serving

════════════════════════════════════════
   🎉 Deployment Successful
════════════════════════════════════════

   App URL: http://minibox.rattlesnake-mimosa.ts.net:4500

   Commands:
   /prod-status  - Check status
   /prod-logs    - View logs
   /prod-restart - Restart services

════════════════════════════════════════
```

## Troubleshooting

### Git Pull Failed
```
error: Your local changes would be overwritten

Fix on minibox:
ssh minibox.rattlesnake-mimosa.ts.net
cd ~/Documents/projects/claude-pocket
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
/prod-logs --errors

Common fixes:
- Check .env files exist
- Verify ports 4500/4501 are free
- Check WORKING_DIR in relay/.env.production
```

## Notes

- Deploys from whatever branch is checked out on minibox (usually main)
- Does `git pull` before running deploy script
- Build happens on minibox (not locally)
- Active WebSocket connections will be dropped during deploy
- For config changes only (no code), use `/prod-restart`
