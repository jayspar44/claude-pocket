#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== Claude Pocket Deployment ==="
echo "Project: $PROJECT_DIR"
echo ""

# Check if relay/.env exists, create from production template if not
if [ ! -f relay/.env ]; then
  echo "Creating relay/.env from production template..."
  cp relay/.env.production relay/.env
fi

# Set WORKING_DIR to project directory if not already set
if ! grep -q "^WORKING_DIR=" relay/.env; then
  echo "Setting WORKING_DIR=$PROJECT_DIR"
  echo "WORKING_DIR=$PROJECT_DIR" >> relay/.env
fi

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
  echo ""
  echo "Installing PM2 globally..."
  npm install -g pm2
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm run install-all

# Build app for production
echo ""
echo "Building app..."
cd app && npm run build && cd ..

# Stop existing processes
echo ""
echo "Stopping existing processes..."
pm2 delete claude-pocket-relay claude-pocket-relay-dev claude-pocket-app claude-pocket-app-dev 2>/dev/null || true

# Start with ecosystem config
echo ""
echo "Starting services..."
pm2 start ecosystem.config.js

# Save PM2 process list for resurrection
pm2 save

# Verify services
echo ""
echo "Verifying services..."
sleep 2
pm2 status

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Access:"
echo "  PROD App:   http://$(hostname):4500"
echo "  PROD Relay: http://$(hostname):4501"
echo "  DEV App:    http://$(hostname):4502"
echo "  DEV Relay:  http://$(hostname):4503"
echo "  Tailscale:  http://$(hostname).rattlesnake-mimosa.ts.net:4500"
echo ""
echo "Commands:"
echo "  pm2 status              # Check status"
echo "  pm2 logs                # View logs (Ctrl+C to exit)"
echo "  pm2 restart all         # Restart services"
echo "  pm2 stop all            # Stop services"
echo "  pm2 delete all          # Kill and remove from PM2"
echo ""
echo "Auto-start on boot (first time only):"
echo "  pm2 startup             # Follow instructions to run sudo command"
echo "  pm2 save                # Save process list"
echo ""
echo "Disable auto-start:"
echo "  pm2 unstartup"
