---
description: View DEV logs from minibox
allowed-tools: Bash
argument-hint: [--lines N] [--app|--relay]
---

# Dev Logs - View DEV Logs

View logs from Claude Pocket DEV services running on minibox.

## Arguments

- **--lines N**: Number of log lines to show (default: 50)
- **--app**: Show only app (frontend) logs
- **--relay**: Show only relay (backend) logs
- **--errors**: Show only error logs

## Usage

```bash
# View recent logs (both services)
/dev-logs

# View last 100 lines
/dev-logs --lines 100

# View only relay logs
/dev-logs --relay

# View only app logs
/dev-logs --app

# View error logs
/dev-logs --errors
```

## Target Server

- **Host**: `minibox.rattlesnake-mimosa.ts.net`
- **Log location**: PM2 manages logs at `~/.pm2/logs/`
- **Services**: `claude-pocket-app-dev`, `claude-pocket-relay-dev`

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
echo "   DEV Logs - minibox"
echo "════════════════════════════════════════"
echo ""

if [[ "$SERVICE" == "all" ]]; then
  echo "📋 Showing last $LINES lines (DEV services)"
  echo "─────────────────────────────────────────"
  echo ""

  if [[ "$ERRORS_ONLY" == "true" ]]; then
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs claude-pocket-app-dev claude-pocket-relay-dev --lines $LINES --err"
  else
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs claude-pocket-app-dev claude-pocket-relay-dev --lines $LINES --nostream"
  fi

elif [[ "$SERVICE" == "app" ]]; then
  echo "📋 Showing last $LINES lines (DEV app only)"
  echo "─────────────────────────────────────────"
  echo ""

  if [[ "$ERRORS_ONLY" == "true" ]]; then
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs claude-pocket-app-dev --lines $LINES --err"
  else
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs claude-pocket-app-dev --lines $LINES --nostream"
  fi

elif [[ "$SERVICE" == "relay" ]]; then
  echo "📋 Showing last $LINES lines (DEV relay only)"
  echo "─────────────────────────────────────────"
  echo ""

  if [[ "$ERRORS_ONLY" == "true" ]]; then
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs claude-pocket-relay-dev --lines $LINES --err"
  else
    ssh minibox.rattlesnake-mimosa.ts.net "pm2 logs claude-pocket-relay-dev --lines $LINES --nostream"
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
echo "   --app         DEV App logs only"
echo "   --relay       DEV Relay logs only"
echo "   --errors      Error logs only"
echo ""
echo "   Live tail (SSH):"
echo "   ssh minibox.rattlesnake-mimosa.ts.net 'pm2 logs claude-pocket-app-dev claude-pocket-relay-dev'"
echo ""
echo "════════════════════════════════════════"
```

## Expected Output

```
════════════════════════════════════════
   DEV Logs - minibox
════════════════════════════════════════

📋 Showing last 50 lines (DEV services)
─────────────────────────────────────────

claude-pocket-relay-dev  | {"level":30,"time":1705123456789,"msg":"WebSocket client connected"}
claude-pocket-relay-dev  | {"level":30,"time":1705123456790,"msg":"PTY output: 64 bytes"}
claude-pocket-app-dev    | ::ffff:192.168.1.5 - - [13/Jan/2024:10:30:45 +0000] "GET / HTTP/1.1" 200 1234
claude-pocket-relay-dev  | {"level":30,"time":1705123456791,"msg":"Input received: 5 bytes"}

════════════════════════════════════════
   Log Options
════════════════════════════════════════

   --lines N     Show N lines (default: 50)
   --app         DEV App logs only
   --relay       DEV Relay logs only
   --errors      Error logs only

   Live tail (SSH):
   ssh minibox.rattlesnake-mimosa.ts.net 'pm2 logs claude-pocket-app-dev claude-pocket-relay-dev'

════════════════════════════════════════
```

## Notes

- Uses `--nostream` to get snapshot (not live tail)
- For live logs, SSH directly
- Logs are JSON (relay) and access logs (app)
- PM2 automatically rotates logs
- DEV services use ports 4502 (app) and 4503 (relay)
