---
description: Stop DEV services on minibox
allowed-tools: Bash, AskUserQuestion
argument-hint: [--app|--relay|--all]
---

# Dev Stop - Stop DEV Services

Stop Claude Pocket DEV services running on minibox.

## Arguments

- **--all**: Stop both app and relay (default)
- **--app**: Stop only the app (frontend server)
- **--relay**: Stop only the relay (backend/PTY server)

## Usage

```bash
# Stop all DEV services
/dev-stop

# Stop only relay
/dev-stop --relay

# Stop only app
/dev-stop --app
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

Use AskUserQuestion to confirm:

- Question: "Stop DEV services on minibox?"
- Options based on SERVICE flag:
  - "all": "Stop both DEV app and relay"
  - "app": "Stop DEV app only (relay keeps running)"
  - "relay": "Stop DEV relay only (app keeps running)"
  - "Cancel"

**Warning**: Stopping relay will disconnect all active DEV Claude sessions.

### 3. Execute Stop

```bash
echo "════════════════════════════════════════"
echo "   Stopping DEV - minibox"
echo "════════════════════════════════════════"
echo ""

if [[ "$SERVICE" == "all" ]]; then
  echo "🛑 Stopping all DEV services..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 stop claude-pocket-app-dev claude-pocket-relay-dev"

elif [[ "$SERVICE" == "app" ]]; then
  echo "🛑 Stopping DEV app..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 stop claude-pocket-app-dev"

elif [[ "$SERVICE" == "relay" ]]; then
  echo "🛑 Stopping DEV relay..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 stop claude-pocket-relay-dev"
fi

STOP_EXIT=$?

if [[ $STOP_EXIT -ne 0 ]]; then
  echo ""
  echo "❌ Stop command failed"
  exit 1
fi
```

### 4. Verify Status

```bash
echo ""
echo "📊 Current Status"
echo "─────────────────────────────────────────"

ssh minibox.rattlesnake-mimosa.ts.net "pm2 status | grep -E '(id|claude-pocket-dev)'"

echo ""
echo "════════════════════════════════════════"
echo "   ✅ DEV Services Stopped"
echo "════════════════════════════════════════"
echo ""
echo "   To restart:  /dev-restart"
echo "   To deploy:   /dev-deploy"
echo ""
echo "   ⚠️  DEV services will NOT auto-restart"
echo "      until manually started"
echo ""
echo "   Note: PROD services unaffected"
echo ""
echo "════════════════════════════════════════"
```

## Expected Output

```
════════════════════════════════════════
   Stopping DEV - minibox
════════════════════════════════════════

🛑 Stopping all DEV services...
─────────────────────────────────────────
[PM2] Applying action stopProcessId on app [claude-pocket-app-dev](ids: [ 2 ])
[PM2] [claude-pocket-app-dev](2) ✓
[PM2] Applying action stopProcessId on app [claude-pocket-relay-dev](ids: [ 3 ])
[PM2] [claude-pocket-relay-dev](3) ✓

📊 Current Status
─────────────────────────────────────────
│ 2   │ claude-pocket-app-dev    │ default     │ 0.1.0   │ fork    │ 0        │ 0      │ 1    │ stopped   │
│ 3   │ claude-pocket-relay-dev  │ default     │ 0.1.0   │ fork    │ 0        │ 0      │ 1    │ stopped   │

════════════════════════════════════════
   ✅ DEV Services Stopped
════════════════════════════════════════

   To restart:  /dev-restart
   To deploy:   /dev-deploy

   ⚠️  DEV services will NOT auto-restart
      until manually started

   Note: PROD services unaffected

════════════════════════════════════════
```

## When to Use

- **Maintenance**: Need to stop DEV services for system maintenance
- **Debugging**: Stop DEV to test PROD in isolation
- **Resource issues**: Free up resources on minibox
- **Testing**: Want to work with PROD only

## Notes

- Stopped services show "stopped" status in PM2
- Auto-restart (PM2 ecosystem) is disabled while stopped
- Use `/dev-restart` or `/dev-deploy` to start again
- Active WebSocket connections will be terminated immediately
- PROD services are completely unaffected
