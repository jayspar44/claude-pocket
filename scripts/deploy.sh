#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Auto-detect environment from folder name
if [[ "$PROJECT_DIR" == *"-dev" ]]; then
  ENV="DEV"
  APP_PORT=4502
  RELAY_PORT=4503
  APP_SERVICE="claude-pocket-app-dev"
  RELAY_SERVICE="claude-pocket-relay-dev"
else
  ENV="PROD"
  APP_PORT=4500
  RELAY_PORT=4501
  APP_SERVICE="claude-pocket-app"
  RELAY_SERVICE="claude-pocket-relay"
fi

echo "=== Claude Pocket $ENV Deployment ==="
echo "Project: $PROJECT_DIR"
echo "App Port: $APP_PORT | Relay Port: $RELAY_PORT"
echo ""

# Check if relay/.env exists, create from production template if not
if [ ! -f relay/.env ]; then
  echo "Creating relay/.env from production template..."
  cp relay/.env.production relay/.env
fi

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
  echo ""
  echo "Installing PM2 globally..."
  npm install -g pm2
fi

# Install dependencies (--include=dev ensures devDependencies like husky are installed)
echo ""
echo "Installing root dependencies..."
npm install --include=dev

echo ""
echo "Installing app dependencies..."
(cd app && npm install --include=dev)

echo ""
echo "Installing relay dependencies..."
(cd relay && npm install --include=dev)

# Build app
echo ""
echo "Building $ENV app..."
(cd app && npm run build)

# Stop existing processes for this environment
echo ""
echo "Stopping existing $ENV processes..."
pm2 delete $APP_SERVICE $RELAY_SERVICE 2>/dev/null || true

# Fix node-pty spawn-helper permissions (npm doesn't preserve executable bit)
# Must run after npm install and before starting relay
chmod +x relay/node_modules/node-pty/prebuilds/darwin-*/spawn-helper 2>/dev/null || true

# Start with ecosystem config
echo ""
echo "Starting $ENV services..."
pm2 start ecosystem.config.js

# Save PM2 process list for resurrection
pm2 save

# Verify services
echo ""
echo "Verifying services..."
sleep 2
pm2 status

echo ""
echo "=== $ENV Deployment Complete ==="
echo ""
echo "Access:"
echo "  App:   http://$(hostname):$APP_PORT"
echo "  Relay: http://$(hostname):$RELAY_PORT"
echo ""
echo "Commands:"
echo "  pm2 status              # Check status"
echo "  pm2 logs                # View logs (Ctrl+C to exit)"
echo "  pm2 restart all         # Restart services"
echo "  pm2 stop all            # Stop services"
echo ""
