---
description: View logs from minibox (PROD or DEV)
allowed-tools: Bash
argument-hint: --env <prod|dev> [--lines N] [--app|--relay] [--errors]
---

# Logs - View Instance Logs

View logs from Claude Pocket services running on minibox.

## Arguments

- **--env prod**: View PROD logs (ports 4500/4501)
- **--env dev**: View DEV logs (ports 4502/4503)
- **--lines N**: Number of log lines to show (default: 50)
- **--app**: Show only app (frontend) logs
- **--relay**: Show only relay (backend) logs
- **--errors**: Show only error logs

## Usage

```bash
# View PROD logs (both services)
/logs --env prod

# View last 100 lines of DEV logs
/logs --env dev --lines 100

# View only PROD relay logs
/logs --env prod --relay

# View DEV error logs
/logs --env dev --errors
```

## Steps

### 1. Parse and Validate Arguments

Parse the `--env` flag. It is **required** and must be either `prod` or `dev`.

If missing or invalid:
```bash
echo "Error: --env flag is required"
echo "Usage: /logs --env <prod|dev> [--lines N] [--app|--relay] [--errors]"
echo ""
echo "Examples:"
echo "  /logs --env prod              # View PROD logs"
echo "  /logs --env dev --relay       # View DEV relay logs"
echo "  /logs --env prod --errors     # View PROD error logs"
exit 1
```

Parse other flags:
```bash
LINES=50
SERVICE="all"
ERRORS_ONLY=false

for arg in "$@"; do
  case $arg in
    --lines)
      shift
      LINES="$1"
      shift
      ;;
    --app)
      SERVICE="app"
      shift
      ;;
    --relay)
      SERVICE="relay"
      shift
      ;;
    --errors)
      ERRORS_ONLY=true
      shift
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

### 4. Display Logs

```bash
echo "============================================"
echo "   $ENV Logs - minibox"
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
  echo "Showing last $LINES lines (all $ENV services)"
  echo "--------------------------------------------"
  echo ""

  if [[ "$ERRORS_ONLY" == "true" ]]; then
    run_on_minibox "pm2 logs $APP_SERVICE $RELAY_SERVICE --lines $LINES --err"
  else
    run_on_minibox "pm2 logs $APP_SERVICE $RELAY_SERVICE --lines $LINES --nostream"
  fi

elif [[ "$SERVICE" == "app" ]]; then
  echo "Showing last $LINES lines ($ENV app only)"
  echo "--------------------------------------------"
  echo ""

  if [[ "$ERRORS_ONLY" == "true" ]]; then
    run_on_minibox "pm2 logs $APP_SERVICE --lines $LINES --err"
  else
    run_on_minibox "pm2 logs $APP_SERVICE --lines $LINES --nostream"
  fi

elif [[ "$SERVICE" == "relay" ]]; then
  echo "Showing last $LINES lines ($ENV relay only)"
  echo "--------------------------------------------"
  echo ""

  if [[ "$ERRORS_ONLY" == "true" ]]; then
    run_on_minibox "pm2 logs $RELAY_SERVICE --lines $LINES --err"
  else
    run_on_minibox "pm2 logs $RELAY_SERVICE --lines $LINES --nostream"
  fi
fi

if [[ $? -ne 0 ]]; then
  echo ""
  echo "Failed to fetch logs"
  exit 1
fi
```

### 5. Footer

```bash
echo ""
echo "============================================"
echo "   Log Options"
echo "============================================"
echo ""
echo "   --lines N     Show N lines (default: 50)"
echo "   --app         App logs only"
echo "   --relay       Relay logs only"
echo "   --errors      Error logs only"
echo ""
echo "   Live tail (SSH):"
echo "   ssh minibox.rattlesnake-mimosa.ts.net 'pm2 logs $APP_SERVICE $RELAY_SERVICE'"
echo ""
echo "============================================"
```

## Environment Mapping

| Flag | App Service | Relay Service |
|------|-------------|---------------|
| `--env prod` | `claude-pocket-app` | `claude-pocket-relay` |
| `--env dev` | `claude-pocket-app-dev` | `claude-pocket-relay-dev` |

## Log Format

### Relay Logs (JSON - Pino)
```json
{
  "level": 30,
  "time": 1705123456789,
  "msg": "WebSocket client connected",
  "clientId": "abc123"
}
```

Level values: 10=trace, 20=debug, 30=info, 40=warn, 50=error

### App Logs (HTTP access logs)
```
::ffff:192.168.1.5 - - [13/Jan/2024:10:30:45 +0000] "GET /api/health HTTP/1.1" 200 15
```

## Troubleshooting

### No Logs Appearing
- Services might not be running: `/check-status --env <prod|dev>`
- PM2 logs rotated: Check `~/.pm2/logs/` on minibox

### Connection Timeout
- Check Tailscale connection
- Verify minibox is online

## Notes

- Uses `--nostream` to get snapshot (not live tail)
- For live logs, SSH directly: `ssh minibox... 'pm2 logs'`
- Logs are JSON (relay) and access logs (app)
- PM2 automatically rotates logs
