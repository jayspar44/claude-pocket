---
description: Stop production services on minibox
allowed-tools: Bash, AskUserQuestion
argument-hint: [--app|--relay|--all]
---

# Prod Stop - Stop Production Services

Stop Claude Pocket services running on minibox.

## Arguments

- **--all**: Stop both app and relay (default)
- **--app**: Stop only the app (frontend server)
- **--relay**: Stop only the relay (backend/PTY server)

## Usage

```bash
# Stop all services
/prod-stop

# Stop only relay
/prod-stop --relay

# Stop only app
/prod-stop --app
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

Use AskUserQuestion to confirm:

- Question: "Stop production services on minibox?"
- Options based on SERVICE flag:
  - "all": "Stop both app and relay"
  - "app": "Stop app only (relay keeps running)"
  - "relay": "Stop relay only (app keeps running)"
  - "Cancel"

**Warning**: Stopping relay will disconnect all active Claude sessions.

### 3. Execute Stop

```bash
echo "════════════════════════════════════════"
echo "   Stopping Production - minibox"
echo "════════════════════════════════════════"
echo ""

if [[ "$SERVICE" == "all" ]]; then
  echo "🛑 Stopping all services..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 stop all"

elif [[ "$SERVICE" == "app" ]]; then
  echo "🛑 Stopping app..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 stop claude-pocket-app"

elif [[ "$SERVICE" == "relay" ]]; then
  echo "🛑 Stopping relay..."
  echo "─────────────────────────────────────────"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 stop claude-pocket-relay"
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

ssh minibox.rattlesnake-mimosa.ts.net "pm2 status"

echo ""
echo "════════════════════════════════════════"
echo "   ✅ Services Stopped"
echo "════════════════════════════════════════"
echo ""
echo "   To restart:  /prod-restart"
echo "   To deploy:   /prod-deploy"
echo ""
echo "   ⚠️  Services will NOT auto-restart"
echo "      until manually started"
echo ""
echo "════════════════════════════════════════"
```

## Expected Output

```
════════════════════════════════════════
   Stopping Production - minibox
════════════════════════════════════════

🛑 Stopping all services...
─────────────────────────────────────────
[PM2] Applying action stopProcessId on app [all](ids: [ 0, 1 ])
[PM2] [claude-pocket-app](0) ✓
[PM2] [claude-pocket-relay](1) ✓

📊 Current Status
─────────────────────────────────────────
┌─────┬──────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┐
│ id  │ name                 │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │
├─────┼──────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┤
│ 0   │ claude-pocket-app    │ default     │ 0.1.0   │ fork    │ 0        │ 0      │ 1    │ stopped   │
│ 1   │ claude-pocket-relay  │ default     │ 0.1.0   │ fork    │ 0        │ 0      │ 1    │ stopped   │
└─────┴──────────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┘

════════════════════════════════════════
   ✅ Services Stopped
════════════════════════════════════════

   To restart:  /prod-restart
   To deploy:   /prod-deploy

   ⚠️  Services will NOT auto-restart
      until manually started

════════════════════════════════════════
```

## When to Use

- **Maintenance**: Need to stop services for system maintenance
- **Debugging**: Stop one service to test the other
- **Resource issues**: Free up resources on minibox
- **Security**: Temporarily take down the service

## Difference from Delete

| Command | Effect |
|---------|--------|
| `pm2 stop` | Stops process, keeps in PM2 list |
| `pm2 delete` | Removes process from PM2 entirely |

This skill uses `stop`, so services remain in PM2 and can be restarted easily.

## Troubleshooting

### Stop Failed
```
❌ Stop command failed

Check:
1. SSH connection working?
2. PM2 running? (pm2 status)
3. Service names correct?
```

### Services Still Running
```
Check if another instance is running:
ssh minibox.rattlesnake-mimosa.ts.net "pgrep -f 'node.*claude-pocket'"

Kill orphan processes:
ssh minibox.rattlesnake-mimosa.ts.net "pkill -f 'node.*claude-pocket'"
```

## Notes

- Stopped services show "stopped" status in PM2
- Auto-restart (PM2 ecosystem) is disabled while stopped
- Use `/prod-restart` or `/prod-deploy` to start again
- Active WebSocket connections will be terminated immediately
