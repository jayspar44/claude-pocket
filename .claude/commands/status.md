---
description: Check instance status on minibox (PROD or DEV)
allowed-tools: Bash
argument-hint: --env <prod|dev> [--health]
---

# Status - Check Instance Status

Check the status of Claude Pocket services running on minibox.

## Arguments

- **--env prod**: Check PROD instance (ports 4500/4501)
- **--env dev**: Check DEV instance (ports 4502/4503)
- **--health**: Also run HTTP health check against the services

## Usage

```bash
# Check PROD PM2 status
/status --env prod

# Check DEV status + health endpoint
/status --env dev --health
```

## Steps

### 1. Parse and Validate Arguments

Parse the `--env` flag. It is **required** and must be either `prod` or `dev`.

If missing or invalid:
```bash
echo "Error: --env flag is required"
echo "Usage: /status --env <prod|dev> [--health]"
echo ""
echo "Examples:"
echo "  /status --env prod           # Check PROD status"
echo "  /status --env dev --health   # Check DEV status with health check"
exit 1
```

### 2. Set Environment Variables

Based on `--env` value:

**If --env prod:**
```bash
ENV="PROD"
APP_PORT=4500
RELAY_PORT=4501
APP_SERVICE="claude-pocket-app"
RELAY_SERVICE="claude-pocket-relay"
```

**If --env dev:**
```bash
ENV="DEV"
APP_PORT=4502
RELAY_PORT=4503
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

### 4. Check PM2 Status

```bash
echo "============================================"
echo "   $ENV Status - minibox"
echo "============================================"
echo ""

# Show execution mode
if is_on_minibox; then
  echo "   Execution: Local (on minibox)"
else
  echo "   Execution: Remote (via SSH)"
fi
echo ""

echo "PM2 Process Status"
echo "--------------------------------------------"

run_on_minibox "pm2 status"

if [[ $? -ne 0 ]]; then
  echo ""
  echo "Failed to connect to minibox"
  exit 1
fi
```

### 5. Show Resource Usage

```bash
echo ""
echo "Resource Usage ($ENV)"
echo "--------------------------------------------"

run_on_minibox "pm2 show $APP_SERVICE 2>/dev/null | grep -E '(cpu|memory|uptime|restarts)' || echo 'App not running'"
```

### 6. Health Check (Optional)

Only run if `--health` flag provided:

```bash
echo ""
echo "Health Check"
echo "--------------------------------------------"

# Check relay health endpoint
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://minibox.rattlesnake-mimosa.ts.net:$RELAY_PORT/api/health")

if [[ "$HEALTH_RESPONSE" == "200" ]]; then
  echo "Relay API: Healthy (HTTP 200)"
else
  echo "Relay API: Unhealthy (HTTP $HEALTH_RESPONSE)"
fi

# Check app is serving
APP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://minibox.rattlesnake-mimosa.ts.net:$APP_PORT")

if [[ "$APP_RESPONSE" == "200" ]]; then
  echo "App: Serving (HTTP 200)"
else
  echo "App: Not responding (HTTP $APP_RESPONSE)"
fi

# Check PTY status
echo ""
echo "PTY Status"
echo "--------------------------------------------"
curl -s "http://minibox.rattlesnake-mimosa.ts.net:$RELAY_PORT/api/pty/status" | cat
echo ""
```

### 7. Summary

```bash
echo ""
echo "============================================"
echo "   Quick Commands"
echo "============================================"
echo ""
echo "   /logs --env $ENV_LOWER       - View live logs"
echo "   /restart --env $ENV_LOWER    - Restart services"
echo "   /deploy --env $ENV_LOWER     - Deploy latest code"
echo ""
echo "   Direct access:"
echo "   http://minibox.rattlesnake-mimosa.ts.net:$APP_PORT"
echo ""
echo "============================================"
```

## Environment Mapping

| Flag | App Port | Relay Port | Services |
|------|----------|------------|----------|
| `--env prod` | 4500 | 4501 | `claude-pocket-app`, `claude-pocket-relay` |
| `--env dev` | 4502 | 4503 | `claude-pocket-app-dev`, `claude-pocket-relay-dev` |

## Troubleshooting

### SSH Connection Failed
```
Failed to connect to minibox

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
2. Deploy: cd ~/Documents/projects/claude-pocket[-dev] && ./scripts/deploy.sh
```

## Notes

- Requires SSH access to minibox (via Tailscale)
- PM2 manages both app and relay processes
- Health check requires network connectivity to minibox
