---
description: View production logs from minibox
allowed-tools: Bash
argument-hint: [--lines N] [--app|--relay]
---

# Prod Logs - View Production Logs

View logs from Claude Pocket services running on minibox.

## Arguments

- **--lines N**: Number of log lines to show (default: 50)
- **--app**: Show only app (frontend) logs
- **--relay**: Show only relay (backend) logs
- **--errors**: Show only error logs

## Usage

```bash
# View recent logs (both services)
/prod-logs

# View last 100 lines
/prod-logs --lines 100

# View only relay logs
/prod-logs --relay

# View only app logs
/prod-logs --app

# View error logs
/prod-logs --errors
```

## Target Server

- **Host**: `minibox.rattlesnake-mimosa.ts.net`
- **Log location**: PM2 manages logs at `~/.pm2/logs/`

## Steps

### 1. Parse Arguments

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

### 2. Display Logs

```bash
echo "════════════════════════════════════════"
echo "   Production Logs - minibox"
echo "════════════════════════════════════════"
echo ""

if [[ "$SERVICE" == "all" ]]; then
  echo "📋 Showing last $LINES lines (all services)"
  echo "─────────────────────────────────────────"
  echo ""

  if [[ "$ERRORS_ONLY" == "true" ]]; then
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs --lines $LINES --err"
  else
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs --lines $LINES --nostream"
  fi

elif [[ "$SERVICE" == "app" ]]; then
  echo "📋 Showing last $LINES lines (app only)"
  echo "─────────────────────────────────────────"
  echo ""

  if [[ "$ERRORS_ONLY" == "true" ]]; then
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs claude-pocket-app --lines $LINES --err"
  else
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs claude-pocket-app --lines $LINES --nostream"
  fi

elif [[ "$SERVICE" == "relay" ]]; then
  echo "📋 Showing last $LINES lines (relay only)"
  echo "─────────────────────────────────────────"
  echo ""

  if [[ "$ERRORS_ONLY" == "true" ]]; then
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs claude-pocket-relay --lines $LINES --err"
  else
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs claude-pocket-relay --lines $LINES --nostream"
  fi
fi

if [[ $? -ne 0 ]]; then
  echo ""
  echo "❌ Failed to fetch logs"
  exit 1
fi
```

### 3. Footer

```bash
echo ""
echo "════════════════════════════════════════"
echo "   Log Options"
echo "════════════════════════════════════════"
echo ""
echo "   --lines N     Show N lines (default: 50)"
echo "   --app         App logs only"
echo "   --relay       Relay logs only"
echo "   --errors      Error logs only"
echo ""
echo "   Live tail (SSH):"
echo "   ssh minibox.rattlesnake-mimosa.ts.net 'pm2 logs'"
echo ""
echo "════════════════════════════════════════"
```

## Expected Output

```
════════════════════════════════════════
   Production Logs - minibox
════════════════════════════════════════

📋 Showing last 50 lines (all services)
─────────────────────────────────────────

claude-pocket-relay  | {"level":30,"time":1705123456789,"msg":"WebSocket client connected"}
claude-pocket-relay  | {"level":30,"time":1705123456790,"msg":"PTY output: 64 bytes"}
claude-pocket-app    | ::ffff:192.168.1.5 - - [13/Jan/2024:10:30:45 +0000] "GET / HTTP/1.1" 200 1234
claude-pocket-relay  | {"level":30,"time":1705123456791,"msg":"Input received: 5 bytes"}

════════════════════════════════════════
   Log Options
════════════════════════════════════════

   --lines N     Show N lines (default: 50)
   --app         App logs only
   --relay       Relay logs only
   --errors      Error logs only

   Live tail (SSH):
   ssh minibox.rattlesnake-mimosa.ts.net 'pm2 logs'

════════════════════════════════════════
```

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
- Services might not be running: `/prod-status`
- PM2 logs rotated: Check `~/.pm2/logs/` on minibox

### Connection Timeout
- Check Tailscale connection
- Verify minibox is online

## Notes

- Uses `--nostream` to get snapshot (not live tail)
- For live logs, SSH directly: `ssh minibox... 'pm2 logs'`
- Logs are JSON (relay) and access logs (app)
- PM2 automatically rotates logs
