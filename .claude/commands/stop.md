---
description: Stop services on minibox (PROD or DEV)
allowed-tools: Bash, AskUserQuestion
argument-hint: --env <prod|dev> [--app|--relay|--all]
---

# Stop - Stop Instance Services

Stop Claude Pocket services running on minibox.

## Arguments

- **--env prod**: Stop PROD services (ports 4500/4501)
- **--env dev**: Stop DEV services (ports 4502/4503)
- **--all**: Stop both app and relay (default)
- **--app**: Stop only the app (frontend server)
- **--relay**: Stop only the relay (backend/PTY server)

## Usage

```bash
# Stop all PROD services
/stop --env prod

# Stop only DEV relay
/stop --env dev --relay

# Stop only PROD app
/stop --env prod --app
```

## Steps

### 1. Parse and Validate Arguments

Parse the `--env` flag. It is **required** and must be either `prod` or `dev`.

If missing or invalid:
```bash
echo "Error: --env flag is required"
echo "Usage: /stop --env <prod|dev> [--app|--relay|--all]"
echo ""
echo "Examples:"
echo "  /stop --env prod           # Stop all PROD services"
echo "  /stop --env dev --relay    # Stop DEV relay only"
exit 1
```

Parse service flag:
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

### 2. Set Environment Variables

Based on `--env` value:

**If --env prod:**
```bash
ENV="PROD"
APP_SERVICE="claude-pocket-app"
RELAY_SERVICE="claude-pocket-relay"
```

**If --env dev:**
```bash
ENV="DEV"
APP_SERVICE="claude-pocket-app-dev"
RELAY_SERVICE="claude-pocket-relay-dev"
```

### 3. Confirm Action

Use AskUserQuestion to confirm:

- Question: "Stop $ENV services on minibox?"
- Options based on SERVICE flag:
  - "all": "Stop both app and relay"
  - "app": "Stop app only (relay keeps running)"
  - "relay": "Stop relay only (app keeps running)"
  - "Cancel"

**Warning**: Stopping relay will disconnect all active Claude sessions.

### 4. Execute Stop

```bash
echo "============================================"
echo "   Stopping $ENV - minibox"
echo "============================================"
echo ""

if [[ "$SERVICE" == "all" ]]; then
  echo "Stopping all $ENV services..."
  echo "--------------------------------------------"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 stop $APP_SERVICE $RELAY_SERVICE"

elif [[ "$SERVICE" == "app" ]]; then
  echo "Stopping $ENV app..."
  echo "--------------------------------------------"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 stop $APP_SERVICE"

elif [[ "$SERVICE" == "relay" ]]; then
  echo "Stopping $ENV relay..."
  echo "--------------------------------------------"

  ssh minibox.rattlesnake-mimosa.ts.net "pm2 stop $RELAY_SERVICE"
fi

STOP_EXIT=$?

if [[ $STOP_EXIT -ne 0 ]]; then
  echo ""
  echo "Stop command failed"
  exit 1
fi
```

### 5. Verify Status

```bash
echo ""
echo "Current Status"
echo "--------------------------------------------"

ssh minibox.rattlesnake-mimosa.ts.net "pm2 status"

echo ""
echo "============================================"
echo "   Services Stopped"
echo "============================================"
echo ""
echo "   To restart:  /restart --env $ENV_LOWER"
echo "   To deploy:   /deploy --env $ENV_LOWER"
echo ""
echo "   Warning: Services will NOT auto-restart"
echo "            until manually started"
echo ""
echo "============================================"
```

## Environment Mapping

| Flag | App Service | Relay Service |
|------|-------------|---------------|
| `--env prod` | `claude-pocket-app` | `claude-pocket-relay` |
| `--env dev` | `claude-pocket-app-dev` | `claude-pocket-relay-dev` |

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
Stop command failed

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
- Use `/restart --env <prod|dev>` or `/deploy --env <prod|dev>` to start again
- Active WebSocket connections will be terminated immediately
