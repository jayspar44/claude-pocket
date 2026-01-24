#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== Claude Pocket PROD Deployment ==="
echo "Project: $PROJECT_DIR"
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

# Install dependencies
echo ""
echo "Installing dependencies..."
npm run install-all

# Build PROD app
echo ""
echo "Building PROD app..."
cd app && npm run build && cd ..

# Stop existing PROD processes
echo ""
echo "Stopping existing PROD processes..."
pm2 delete claude-pocket-relay claude-pocket-app 2>/dev/null || true

# Start with ecosystem config
echo ""
echo "Starting PROD services..."
pm2 start ecosystem.config.js

# Save PM2 process list for resurrection
pm2 save

# Verify services
echo ""
echo "Verifying services..."
sleep 2
pm2 status

echo ""
echo "=== PROD Deployment Complete ==="
echo ""
echo "Access:"
echo "  App:   http://$(hostname):4500"
echo "  Relay: http://$(hostname):4501"
echo ""
echo "Commands:"
echo "  pm2 status              # Check status"
echo "  pm2 logs                # View logs (Ctrl+C to exit)"
echo "  pm2 restart all         # Restart services"
echo "  pm2 stop all            # Stop services"
echo ""
