---
description: Check DEV instance status on minibox
allowed-tools: Bash
argument-hint: [--health]
---

# Dev Status - Check DEV Instance

Check the status of Claude Pocket DEV services running on minibox.

## Arguments

- **--health**: Also run HTTP health check against the app

## Usage

```bash
# Check PM2 process status
/dev-status

# Check status + health endpoint
/dev-status --health
```

## Target Server

- **Host**: `minibox.rattlesnake-mimosa.ts.net`
- **App URL**: `http://minibox.rattlesnake-mimosa.ts.net:4502`
- **Services**: `claude-pocket-app-dev` (port 4502), `claude-pocket-relay-dev` (port 4503)

## Steps

### 1. Check PM2 Status

```bash
echo "════════════════════════════════════════"
echo "   DEV Status - minibox"
echo "════════════════════════════════════════"
echo ""

echo "📊 PM2 Process Status"
echo "─────────────────────────────────────────"

ssh minibox.rattlesnake-mimosa.ts.net "pm2 status | grep -E '(id|claude-pocket-(app|relay)-dev)'"

if [[ $? -ne 0 ]]; then
  echo ""
  echo "❌ Failed to connect to minibox"
  exit 1
fi
```

### 2. Show Resource Usage

```bash
echo ""
echo "💾 Resource Usage"
echo "─────────────────────────────────────────"

ssh minibox.rattlesnake-mimosa.ts.net "pm2 show claude-pocket-app-dev 2>/dev/null | grep -E '(cpu|memory|uptime|restarts)' || echo 'DEV App not running'"
```

### 3. Health Check (Optional)

```bash
# Only run if --health flag provided
if [[ "$1" == "--health" || "$2" == "--health" ]]; then
  echo ""
  echo "🏥 Health Check"
  echo "─────────────────────────────────────────"

  # Check relay health endpoint
  HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://minibox.rattlesnake-mimosa.ts.net:4503/api/health")

  if [[ "$HEALTH_RESPONSE" == "200" ]]; then
    echo "✅ DEV Relay API: Healthy (HTTP 200)"
  else
    echo "❌ DEV Relay API: Unhealthy (HTTP $HEALTH_RESPONSE)"
  fi

  # Check app is serving
  APP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://minibox.rattlesnake-mimosa.ts.net:4502")

  if [[ "$APP_RESPONSE" == "200" ]]; then
    echo "✅ DEV App: Serving (HTTP 200)"
  else
    echo "❌ DEV App: Not responding (HTTP $APP_RESPONSE)"
  fi

  # Check PTY status
  echo ""
  echo "🖥️  PTY Status"
  echo "─────────────────────────────────────────"
  curl -s "http://minibox.rattlesnake-mimosa.ts.net:4503/api/pty/status" | cat
  echo ""
fi
```

### 4. Summary

```bash
echo ""
echo "════════════════════════════════════════"
echo "   Quick Commands"
echo "════════════════════════════════════════"
echo ""
echo "   /dev-logs       - View live logs"
echo "   /dev-restart    - Restart services"
echo "   /dev-deploy     - Deploy latest code"
echo ""
echo "   Direct access:"
echo "   http://minibox.rattlesnake-mimosa.ts.net:4502"
echo ""
echo "════════════════════════════════════════"
```

## Expected Output

```
════════════════════════════════════════
   DEV Status - minibox
════════════════════════════════════════

📊 PM2 Process Status
─────────────────────────────────────────
│ 2   │ claude-pocket-dev-app    │ default     │ 0.1.0   │ fork    │ 12345    │ 2h     │ 0    │ online    │ 0%       │ 45.2mb   │
│ 3   │ claude-pocket-dev-relay  │ default     │ 0.1.0   │ fork    │ 12346    │ 2h     │ 0    │ online    │ 0.5%     │ 78.1mb   │

════════════════════════════════════════
   Quick Commands
════════════════════════════════════════

   /dev-logs       - View live logs
   /dev-restart    - Restart services
   /dev-deploy     - Deploy latest code

   Direct access:
   http://minibox.rattlesnake-mimosa.ts.net:4502

════════════════════════════════════════
```

## Notes

- Requires SSH access to minibox (via Tailscale)
- PM2 manages both DEV app and relay processes
- Health check requires network connectivity to minibox
- DEV instance uses ports 4502 (app) and 4503 (relay)
