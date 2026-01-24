---
description: Restart DEV services on minibox
allowed-tools: Bash, AskUserQuestion
argument-hint: [--app|--relay|--all]
---

# Dev Restart - Restart DEV Services

Restart Claude Pocket DEV services running on minibox.

## Arguments

- **--all**: Restart both app and relay (default)
- **--app**: Restart only the app (frontend server)
- **--relay**: Restart only the relay (backend/PTY server)

## Usage

```bash
# Restart all DEV services
/dev-restart

# Restart only relay
/dev-restart --relay

# Restart only app
/dev-restart --app
```

## Target Server

- **Host**: `minibox.rattlesnake-mimosa.ts.net`
- **Services**: `claude-pocket-app-dev` (port 4502), `claude-pocket-relay-dev` (port 4503)

## Steps

### 1. Parse Arguments

```bash
SERVICE="all"

for arg in "$@"; do
  case $arg in
    --app)
      SERVICE="app"
      ;;
    --relay)
      SERVICE="relay"
      ;;
    --all)
      SERVICE="all"
      ;;
  esac
done
```

### 2. Confirm Action

Before restarting, use AskUserQuestion to confirm:

- Question: "Restart DEV services on minibox?"
- Options based on SERVICE flag:
  - "all": "Restart both DEV app and relay"
  - "app": "Restart DEV app only"
  - "relay": "Restart DEV relay only"
  - "Cancel"

### 3. Execute Restart

```bash
echo "════════════════════════════════════════"
echo "   Restarting DEV - minibox"
echo "════════════════════════════════════════"
echo ""

if [[ "$SERVICE" == "all" ]]; then
  echo "🔄 Restarting DEV services..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 restart claude-pocket-app-dev claude-pocket-relay-dev"

elif [[ "$SERVICE" == "app" ]]; then
  echo "🔄 Restarting DEV app..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 restart claude-pocket-app-dev"

elif [[ "$SERVICE" == "relay" ]]; then
  echo "🔄 Restarting DEV relay..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 restart claude-pocket-relay-dev"
fi

RESTART_EXIT=$?

if [[ $RESTART_EXIT -ne 0 ]]; then
  echo ""
  echo "❌ Restart failed"
  exit 1
fi
```

### 4. Verify Status

```bash
echo ""
echo "📊 Post-Restart Status"
echo "─────────────────────────────────────────"

# Wait a moment for services to stabilize
sleep 2

ssh minibox.rattlesnake-mimosa.ts.net "pm2 status | grep -E '(id|claude-pocket-dev)'"

echo ""
echo "════════════════════════════════════════"
echo "   ✅ DEV Restart Complete"
echo "════════════════════════════════════════"
echo ""
echo "   View logs:  /dev-logs"
echo "   Check app:  http://minibox.rattlesnake-mimosa.ts.net:4502"
echo ""
echo "════════════════════════════════════════"
```

## Expected Output

```
════════════════════════════════════════
   Restarting DEV - minibox
════════════════════════════════════════

🔄 Restarting DEV services...
─────────────────────────────────────────
[PM2] Applying action restartProcessId on app [claude-pocket-app-dev](ids: [ 2 ])
[PM2] [claude-pocket-app-dev](2) ✓
[PM2] Applying action restartProcessId on app [claude-pocket-relay-dev](ids: [ 3 ])
[PM2] [claude-pocket-relay-dev](3) ✓

📊 Post-Restart Status
─────────────────────────────────────────
│ 2   │ claude-pocket-app-dev    │ default     │ 0.1.0   │ fork    │ 12347    │ 2s     │ 1    │ online    │ 0%       │ 42.1mb   │
│ 3   │ claude-pocket-relay-dev  │ default     │ 0.1.0   │ fork    │ 12348    │ 2s     │ 1    │ online    │ 0%       │ 65.3mb   │

════════════════════════════════════════
   ✅ DEV Restart Complete
════════════════════════════════════════

   View logs:  /dev-logs
   Check app:  http://minibox.rattlesnake-mimosa.ts.net:4502

════════════════════════════════════════
```

## When to Use

- **App frozen**: Restart DEV app
- **WebSocket issues**: Restart DEV relay
- **General issues**: Restart all DEV services
- **After config changes**: Restart affected service

## Notes

- Restarts are graceful (existing connections may be interrupted)
- Restart counter (↺) increments with each restart
- For full redeploy with code changes, use `/dev-deploy`
- Active WebSocket connections will be dropped on relay restart
- DEV services are independent from PROD services
