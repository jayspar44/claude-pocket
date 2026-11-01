---
name: minibox-deployment
description: Deploy and operate the PROD and DEV instances on minibox: folder/port layout, deploy.sh, PM2 commands, access URLs, and login auto-start. Use when deploying, restarting, or checking services on minibox.
---

# Production Deployment (minibox)

**Dual Instance Setup:** Two separate folders for independent deployment:

| Instance | Folder | App Port | Relay Port |
|----------|--------|----------|------------|
| PROD | `claude-pocket` | 4500 | 4501 |
| DEV | `claude-pocket-dev` | 4502 | 4503 |

**Deploy:**
```bash
# Via slash command (recommended)
/deploy --env prod     # Deploy PROD
/deploy --env dev      # Deploy DEV

# If running on minibox (no SSH needed)
cd ~/Documents/projects/claude-pocket && ./scripts/deploy.sh
cd ~/Documents/projects/claude-pocket-dev && ./scripts/deploy.sh

# If running from local Mac (SSH required)
ssh minibox "cd ~/Documents/projects/claude-pocket && ./scripts/deploy.sh"
```

**Auto-detection:** Same `deploy.sh` and `ecosystem.config.js` in both folders detect environment from folder name (`-dev` suffix).

**Access:**
| Service | URL | Port |
|---------|-----|------|
| PROD App | `http://minibox.rattlesnake-mimosa.ts.net:4500` | 4500 |
| PROD Relay | `ws://minibox.rattlesnake-mimosa.ts.net:4501/ws` | 4501 |
| DEV App | `http://minibox.rattlesnake-mimosa.ts.net:4502` | 4502 |
| DEV Relay | `ws://minibox.rattlesnake-mimosa.ts.net:4503/ws` | 4503 |

**PM2 Commands:** `pm2 status` | `pm2 logs` | `pm2 restart all` | `pm2 stop all` | `pm2 delete all` | `pm2 monit`

**Auto-start at login:** `~/Library/LaunchAgents/pm2.jayspar.plist` runs `pm2 resurrect` once (log: `~/.pm2/launchd.log`). It restores the list from the last `pm2 save`, which `deploy.sh` runs.

- **Login, not boot:** auto-login is deliberately off, so after a reboot nothing starts, Tailscale included, until someone logs in at the Mac.
- **Written by hand, not `pm2 startup`:** its template sets `KeepAlive` on a command that exits. To recreate: a `RunAtLoad` agent running `~/.npm-global/bin/pm2 resurrect`, with `/usr/local/bin` on `PATH` and `PM2_HOME=~/.pm2`.
- **Disable:** `launchctl bootout gui/$(id -u)/pm2.jayspar`, then delete the plist.

**Config files per folder:** `ecosystem.config.js` | `relay/.env.production` | `app/.env.production`
