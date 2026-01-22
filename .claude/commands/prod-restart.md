---
description: Restart production services on minibox
allowed-tools: Bash, AskUserQuestion
argument-hint: [--app|--relay|--all]
---

# Prod Restart - Restart Production Services

Restart Claude Pocket services running on minibox.

## Arguments

- **--all**: Restart both app and relay (default)
- **--app**: Restart only the app (frontend server)
- **--relay**: Restart only the relay (backend/PTY server)

## Usage

```bash
# Restart all services
/prod-restart

# Restart only relay
/prod-restart --relay

# Restart only app
/prod-restart --app
```

## Target Server

- **Host**: `minibox.rattlesnake-mimosa.ts.net`
- **Services**: `claude-pocket-app`, `claude-pocket-relay`

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

- Question: "Restart production services on minibox?"
- Options based on SERVICE flag:
  - "all": "Restart both app and relay"
  - "app": "Restart app only"
  - "relay": "Restart relay only"
  - "Cancel"

### 3. Execute Restart

```bash
echo "════════════════════════════════════════"
echo "   Restarting Production - minibox"
echo "════════════════════════════════════════"
echo ""

if [[ "$SERVICE" == "all" ]]; then
  echo "🔄 Restarting all services..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 restart all"

elif [[ "$SERVICE" == "app" ]]; then
  echo "🔄 Restarting app..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 restart claude-pocket-app"

elif [[ "$SERVICE" == "relay" ]]; then
  echo "🔄 Restarting relay..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 restart claude-pocket-relay"
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

ssh minibox.rattlesnake-mimosa.ts.net "pm2 status"

echo ""
echo "════════════════════════════════════════"
echo "   ✅ Restart Complete"
echo "════════════════════════════════════════"
echo ""
echo "   View logs:  /prod-logs"
echo "   Check app:  http://minibox.rattlesnake-mimosa.ts.net:4500"
echo ""
echo "════════════════════════════════════════"
```

## Expected Output

```
════════════════════════════════════════
   Restarting Production - minibox
════════════════════════════════════════

🔄 Restarting all services...
─────────────────────────────────────────
[PM2] Applying action restartProcessId on app [all](ids: [ 0, 1 ])
[PM2] [claude-pocket-app](0) ✓
[PM2] [claude-pocket-relay](1) ✓

📊 Post-Restart Status
─────────────────────────────────────────
┌─────┬──────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┐
│ id  │ name                 │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │
├─────┼──────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┤
│ 0   │ claude-pocket-app    │ default     │ 0.1.0   │ fork    │ 12347    │ 2s     │ 1    │ online    │ 0%       │ 42.1mb   │
│ 1   │ claude-pocket-relay  │ default     │ 0.1.0   │ fork    │ 12348    │ 2s     │ 1    │ online    │ 0%       │ 65.3mb   │
└─────┴──────────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┘

════════════════════════════════════════
   ✅ Restart Complete
════════════════════════════════════════

   View logs:  /prod-logs
   Check app:  http://minibox.rattlesnake-mimosa.ts.net:4500

════════════════════════════════════════
```

## When to Use

- **App frozen**: Restart app
- **WebSocket issues**: Restart relay
- **General issues**: Restart all
- **After config changes**: Restart affected service

## Troubleshooting

### Restart Failed
```
❌ Restart failed

Check:
1. SSH connection: ssh minibox.rattlesnake-mimosa.ts.net
2. PM2 running: pm2 status
3. Services exist: pm2 list
```

### Service Won't Stay Online
```
Check logs for crash reason:
/prod-logs --errors

Common causes:
- Port already in use
- Missing environment variables
- Dependency issues
```

## Notes

- Restarts are graceful (existing connections may be interrupted)
- Restart counter (↺) increments with each restart
- For full redeploy with code changes, use `/prod-deploy`
- Active WebSocket connections will be dropped on relay restart
