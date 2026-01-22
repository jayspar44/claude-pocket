---
description: Check production instance status on minibox
allowed-tools: Bash
argument-hint: [--health]
---

# Prod Status - Check Production Instance

Check the status of Claude Pocket services running on minibox.

## Arguments

- **--health**: Also run HTTP health check against the app

## Usage

```bash
# Check PM2 process status
/prod-status

# Check status + health endpoint
/prod-status --health
```

## Target Server

- **Host**: `minibox.rattlesnake-mimosa.ts.net`
- **App URL**: `http://minibox.rattlesnake-mimosa.ts.net:4500`
- **Services**: `claude-pocket-app` (port 4500), `claude-pocket-relay` (port 4501)

## Steps

### 1. Check PM2 Status

```bash
echo "════════════════════════════════════════"
echo "   Production Status - minibox"
echo "════════════════════════════════════════"
echo ""

echo "📊 PM2 Process Status"
echo "─────────────────────────────────────────"

ssh minibox.rattlesnake-mimosa.ts.net "pm2 status"

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

ssh minibox.rattlesnake-mimosa.ts.net "pm2 show claude-pocket-app 2>/dev/null | grep -E '(cpu|memory|uptime|restarts)' || echo 'App not running'"
```

### 3. Health Check (Optional)

```bash
# Only run if --health flag provided
if [[ "$1" == "--health" || "$2" == "--health" ]]; then
  echo ""
  echo "🏥 Health Check"
  echo "─────────────────────────────────────────"

  # Check relay health endpoint
  HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://minibox.rattlesnake-mimosa.ts.net:4501/api/health")

  if [[ "$HEALTH_RESPONSE" == "200" ]]; then
    echo "✅ Relay API: Healthy (HTTP 200)"
  else
    echo "❌ Relay API: Unhealthy (HTTP $HEALTH_RESPONSE)"
  fi

  # Check app is serving
  APP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://minibox.rattlesnake-mimosa.ts.net:4500")

  if [[ "$APP_RESPONSE" == "200" ]]; then
    echo "✅ App: Serving (HTTP 200)"
  else
    echo "❌ App: Not responding (HTTP $APP_RESPONSE)"
  fi

  # Check PTY status
  echo ""
  echo "🖥️  PTY Status"
  echo "─────────────────────────────────────────"
  curl -s "http://minibox.rattlesnake-mimosa.ts.net:4501/api/pty/status" | cat
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
echo "   /prod-logs       - View live logs"
echo "   /prod-restart    - Restart services"
echo "   /prod-deploy     - Deploy latest code"
echo ""
echo "   Direct access:"
echo "   http://minibox.rattlesnake-mimosa.ts.net:4500"
echo ""
echo "════════════════════════════════════════"
```

## Expected Output

```
════════════════════════════════════════
   Production Status - minibox
════════════════════════════════════════

📊 PM2 Process Status
─────────────────────────────────────────
┌─────┬──────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id  │ name                 │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├─────┼──────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0   │ claude-pocket-app    │ default     │ 0.1.0   │ fork    │ 12345    │ 2h     │ 0    │ online    │ 0%       │ 45.2mb   │ jay      │ disabled │
│ 1   │ claude-pocket-relay  │ default     │ 0.1.0   │ fork    │ 12346    │ 2h     │ 0    │ online    │ 0.5%     │ 78.1mb   │ jay      │ disabled │
└─────┴──────────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘

════════════════════════════════════════
   Quick Commands
════════════════════════════════════════

   /prod-logs       - View live logs
   /prod-restart    - Restart services
   /prod-deploy     - Deploy latest code

   Direct access:
   http://minibox.rattlesnake-mimosa.ts.net:4500

════════════════════════════════════════
```

## Troubleshooting

### SSH Connection Failed
```
❌ Failed to connect to minibox

Check:
1. VPN/Tailscale connected?
2. minibox powered on?
3. SSH key configured?
```

### Services Not Running
```
PM2 shows no processes

Fix:
1. SSH to minibox: ssh minibox.rattlesnake-mimosa.ts.net
2. Deploy: cd ~/projects/claude-pocket && ./scripts/deploy.sh
```

## Notes

- Requires SSH access to minibox (via Tailscale)
- PM2 manages both app and relay processes
- Health check requires network connectivity to minibox
