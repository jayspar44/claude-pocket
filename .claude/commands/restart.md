---
description: Restart services on minibox (PROD or DEV)
allowed-tools: Bash, AskUserQuestion
argument-hint: --env <prod|dev> [--app|--relay|--all]
---

# Restart - Restart Instance Services

Restart Claude Pocket services running on minibox.

## Arguments

- **--env prod**: Restart PROD services (ports 4500/4501)
- **--env dev**: Restart DEV services (ports 4502/4503)
- **--all**: Restart both app and relay (default)
- **--app**: Restart only the app (frontend server)
- **--relay**: Restart only the relay (backend/PTY server)

## Usage

```bash
# Restart all PROD services
/restart --env prod

# Restart only DEV relay
/restart --env dev --relay

# Restart only PROD app
/restart --env prod --app
```

## Steps

### 1. Parse and Validate Arguments

Parse the `--env` flag. It is **required** and must be either `prod` or `dev`.

If missing or invalid:
```bash
echo "Error: --env flag is required"
echo "Usage: /restart --env <prod|dev> [--app|--relay|--all]"
echo ""
echo "Examples:"
echo "  /restart --env prod           # Restart all PROD services"
echo "  /restart --env dev --relay    # Restart DEV relay only"
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
APP_PORT=4500
APP_SERVICE="claude-pocket-app"
RELAY_SERVICE="claude-pocket-relay"
```

**If --env dev:**
```bash
ENV="DEV"
APP_PORT=4502
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

### 4. Confirm Action

Use AskUserQuestion to confirm:

- Question: "Restart $ENV services on minibox?"
- Options based on SERVICE flag:
  - "all": "Restart both app and relay"
  - "app": "Restart app only"
  - "relay": "Restart relay only"
  - "Cancel"

### 5. Execute Restart

```bash
echo "============================================"
echo "   Restarting $ENV - minibox"
echo "============================================"
echo ""

# Show execution mode
if is_on_minibox; then
  echo "   Execution: Local (on minibox)"
else
  echo "   Execution: Remote (via SSH)"
fi
echo ""

if [[ "$SERVICE" == "all" ]]; then
  echo "Restarting all $ENV services..."
  echo "--------------------------------------------"

  run_on_minibox "pm2 restart $APP_SERVICE $RELAY_SERVICE"

elif [[ "$SERVICE" == "app" ]]; then
  echo "Restarting $ENV app..."
  echo "--------------------------------------------"

  run_on_minibox "pm2 restart $APP_SERVICE"

elif [[ "$SERVICE" == "relay" ]]; then
  echo "Restarting $ENV relay..."
  echo "--------------------------------------------"

  run_on_minibox "pm2 restart $RELAY_SERVICE"
fi

RESTART_EXIT=$?

if [[ $RESTART_EXIT -ne 0 ]]; then
  echo ""
  echo "Restart failed"
  exit 1
fi
```

### 6. Verify Status

```bash
echo ""
echo "Post-Restart Status"
echo "--------------------------------------------"

# Wait a moment for services to stabilize
sleep 2

run_on_minibox "pm2 status"

echo ""
echo "============================================"
echo "   Restart Complete"
echo "============================================"
echo ""
echo "   View logs:  /logs --env $ENV_LOWER"
echo "   Check app:  http://minibox.rattlesnake-mimosa.ts.net:$APP_PORT"
echo ""
echo "============================================"
```

## Environment Mapping

| Flag | App Port | App Service | Relay Service |
|------|----------|-------------|---------------|
| `--env prod` | 4500 | `claude-pocket-app` | `claude-pocket-relay` |
| `--env dev` | 4502 | `claude-pocket-app-dev` | `claude-pocket-relay-dev` |

## When to Use

- **App frozen**: Restart app
- **WebSocket issues**: Restart relay
- **General issues**: Restart all
- **After config changes**: Restart affected service

## Troubleshooting

### Restart Failed
```
Restart failed

Check:
1. SSH connection: ssh minibox.rattlesnake-mimosa.ts.net
2. PM2 running: pm2 status
3. Services exist: pm2 list
```

### Service Won't Stay Online
```
Check logs for crash reason:
/logs --env <prod|dev> --errors

Common causes:
- Port already in use
- Missing environment variables
- Dependency issues
```

## Notes

- Restarts are graceful (existing connections may be interrupted)
- Restart counter increments with each restart
- For full redeploy with code changes, use `/deploy --env <prod|dev>`
- Active WebSocket connections will be dropped on relay restart
