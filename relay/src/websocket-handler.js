const { WebSocketServer } = require('ws');
const ptyRegistry = require('./pty-registry');
const { DEFAULT_INSTANCE_ID } = require('./pty-registry');
const config = require('./config');
const logger = require('./logger');

// Orphan eviction.
//
// Primary mechanism: clients send a stable `appClientId` with set-instance, so
// when a replacement socket registers for the same (appClientId, instanceId) the
// relay can drop the previous one immediately — deterministic, no timing window,
// no false positives.
//
// Fallback for clients that send no appClientId (older app builds): a silence
// heuristic. A genuinely attached client sends {type:'ping'} on the app-level
// heartbeat (25s in the mobile client); a leaked socket goes permanently silent,
// because the client keys its heartbeat timer by instanceId, so each new socket
// overwrites the previous one's timer.
const ORPHAN_IDLE_MS = 75000;  // 3 missed client heartbeats
const ORPHAN_SWEEP_MS = 30000;
const EVICT_CLOSE_CODE = 4002;
const EVICT_GRACE_MS = 3000;   // Wait for the close handshake, then terminate

class WebSocketHandler {
  constructor(server) {
    this.wss = new WebSocketServer({
      server,
      path: config.ws.path,
    });

    this.clients = new Set();
    this.setupWebSocketServer();
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      ws.clientId = clientId;
      ws.instanceId = DEFAULT_INSTANCE_ID; // Default instance until set-instance received
      ws.instanceAssigned = false; // True once set-instance names the real instance
      ws.lastClientMessage = Date.now(); // Liveness for orphan eviction
      this.clients.add(ws);

      logger.info({ clientId, ip: req.socket.remoteAddress }, 'WebSocket client connected');

      // Send connection status
      this.send(ws, { type: 'status', connected: true, clientId });

      // Flag to skip batched output until replay is sent
      // This prevents duplicates from the 50ms batch window
      let skipUntilReplay = true;
      let ptyListener = null;

      // Setup PTY listener for this client
      const setupPtyListener = (instanceId, cliType) => {
        // Remove old listener if switching instances
        if (ptyListener && ws.currentPtyManager) {
          ws.currentPtyManager.removeListener(ptyListener);
        }

        const ptyManager = ptyRegistry.get(instanceId, undefined, cliType);
        ws.currentPtyManager = ptyManager;

        ptyListener = (message) => {
          if (skipUntilReplay && message.type === 'output') {
            return;
          }
          // Include instanceId in outgoing messages
          this.send(ws, { ...message, instanceId });
        };
        ptyManager.addListener(ptyListener);
        ws.ptyListener = ptyListener;

        return ptyManager;
      };

      // Send replay for the given instance
      const sendReplay = (ptyManager, instanceId) => {
        const bufferedOutput = ptyManager.getBufferedOutput();
        if (bufferedOutput) {
          logger.info({ clientId, instanceId, bufferLength: bufferedOutput.length }, 'Sending replay');
          this.send(ws, { type: 'replay', data: bufferedOutput, instanceId });
        }
        skipUntilReplay = false;
        this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });
      };

      // Initial setup with default instance
      // Wait for set-instance message before setting up PTY
      // Send initial status to let client know connection is ready
      this.send(ws, { type: 'ready' });

      // Handle incoming messages
      ws.on('message', (data) => {
        ws.lastClientMessage = Date.now();
        let message;
        try {
          message = JSON.parse(data.toString());
        } catch (error) {
          logger.error({ error: error.message, clientId }, 'Failed to parse WebSocket message');
          return;
        }
        // handleMessage is async: a rejection here (e.g. pty.spawn failing) would
        // otherwise be an unhandled rejection, which under Node's default
        // --unhandled-rejections=throw takes down the relay and every PTY with it.
        this.handleMessage(ws, message, { setupPtyListener, sendReplay, skipUntilReplay: () => skipUntilReplay, setSkipReplay: (v) => { skipUntilReplay = v; } })
          .catch((error) => {
            logger.error({ error: error.message, clientId, type: message.type }, 'Failed to handle WebSocket message');
            this.send(ws, { type: 'pty-error', message: error.message, instanceId: ws.instanceId });
          });
      });

      // Handle client disconnect
      ws.on('close', () => {
        logger.info({ clientId, instanceId: ws.instanceId }, 'WebSocket client disconnected');
        this.clients.delete(ws);
        if (ws._deferredStartTimer) {
          clearTimeout(ws._deferredStartTimer);
          ws._deferredStartTimer = null;
        }
        if (ws.ptyListener && ws.currentPtyManager) {
          ws.currentPtyManager.removeListener(ws.ptyListener);
        }
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error({ error: error.message, clientId }, 'WebSocket error');
      });

      // Setup ping/pong for connection health
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });

    // Setup ping interval to detect dead connections
    this.pingInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          logger.debug({ clientId: ws.clientId }, 'Terminating inactive connection');
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, config.ws.pingInterval);

    // Fallback sweep, covering what the appClientId path cannot: clients too old to
    // send one, and sockets stranded by a previous page load (whose appClientId is
    // gone with it). Sockets that have gone silent are evicted, but only when a
    // live sibling exists on the same instance — so a genuine second viewer, which
    // keeps heartbeating, is never disturbed.
    this.orphanSweepInterval = setInterval(() => {
      const now = Date.now();
      const byInstance = new Map();

      this.clients.forEach((ws) => {
        if (ws.readyState !== ws.OPEN) return;
        // A socket that has not yet sent set-instance is still parked on the
        // default bucket. Counting it there would let a brand-new socket bound
        // for another instance masquerade as a live sibling and authorise
        // evicting the only real viewer of `default`.
        if (!ws.instanceAssigned) return;
        const id = ws.instanceId || DEFAULT_INSTANCE_ID;
        if (!byInstance.has(id)) byInstance.set(id, []);
        byInstance.get(id).push(ws);
      });

      const isFresh = (ws) => now - (ws.lastClientMessage || 0) < ORPHAN_IDLE_MS;

      for (const [instanceId, sockets] of byInstance) {
        if (sockets.length < 2) continue;

        const stale = sockets.filter((ws) => !isFresh(ws));
        const surviving = sockets.length - stale.length;
        // If every socket is quiet we cannot tell orphan from idle viewer - leave them.
        if (surviving === 0) continue;

        for (const ws of stale) {
          logger.warn({
            clientId: ws.clientId,
            instanceId,
            idleMs: now - (ws.lastClientMessage || 0),
            evicting: stale.length,
            surviving,
          }, 'Evicting orphaned WebSocket (silent while a live client is attached)');
          this.evict(ws, 'Orphaned connection');
        }
      }
    }, ORPHAN_SWEEP_MS);

    this.wss.on('close', () => {
      clearInterval(this.pingInterval);
      clearInterval(this.orphanSweepInterval);
    });
  }

  // Drop a socket we have decided is orphaned.
  //
  // close() alone is not enough: an abandoned socket never acknowledges the close
  // frame, so it lingers in CLOSING — holding its PTY listener, its deferred-start
  // timer and its slot in this.clients — until the ws library's 30s close timeout.
  // Send the frame so a live peer learns why it was dropped, then terminate to
  // guarantee the 'close' handler runs and releases everything.
  evict(ws, reason) {
    try {
      ws.close(EVICT_CLOSE_CODE, reason);
    } catch {
      // Already closing - terminate below still applies.
    }
    setTimeout(() => {
      if (ws.readyState !== ws.CLOSED) ws.terminate();
    }, EVICT_GRACE_MS).unref?.();
  }

  async handleMessage(ws, message, ctx) {
    const { type, instanceId: msgInstanceId } = message;

    // Use message instanceId or client's current instanceId
    const instanceId = msgInstanceId || ws.instanceId || DEFAULT_INSTANCE_ID;

    logger.debug({ type, clientId: ws.clientId, instanceId, dataLength: message.data?.length }, 'Received WebSocket message');

    switch (type) {
      case 'ping':
        // Respond to client heartbeat
        this.send(ws, { type: 'pong' });
        break;

      case 'set-instance': {
        // Client wants to switch to a specific instance
        const newInstanceId = message.instanceId || DEFAULT_INSTANCE_ID;
        const workingDir = message.workingDir;
        const cliType = message.cliType || 'claude';
        const clientCols = message.cols || config.pty.cols;
        const clientRows = message.rows || config.pty.rows;

        logger.info({ clientId: ws.clientId, oldInstanceId: ws.instanceId, newInstanceId, workingDir, cliType, clientCols, clientRows }, 'Client switching instance');

        ws.instanceId = newInstanceId;
        ws.instanceAssigned = true;
        ws.cliType = cliType;
        ws.appClientId = message.appClientId || null;
        ctx.setSkipReplay(true);

        // A replacement socket for the same (app, instance) means the previous one
        // was superseded — the app cannot have two live views of one instance. Drop
        // it now rather than waiting out the silence heuristic, which costs a
        // ~105s window of every byte being rendered twice.
        if (ws.appClientId) {
          this.clients.forEach((other) => {
            if (other === ws) return;
            if (other.appClientId !== ws.appClientId) return;
            if (other.instanceId !== newInstanceId) return;
            logger.warn({
              clientId: other.clientId,
              supersededBy: ws.clientId,
              instanceId: newInstanceId,
            }, 'Evicting superseded WebSocket (same app reconnected to this instance)');
            this.evict(other, 'Superseded by new connection');
          });
        }

        const ptyManager = ctx.setupPtyListener(newInstanceId, cliType);

        // Auto-start PTY if not running but we have a working directory
        // Defer start until first resize arrives with real xterm.js dimensions
        // to prevent MCP tool calls rendering vertically with stale/fallback dimensions
        if (!ptyManager.isRunning && (workingDir || ptyManager.currentWorkingDir)) {
          const dir = workingDir || ptyManager.currentWorkingDir;
          logger.info({ clientId: ws.clientId, instanceId: newInstanceId, workingDir: dir, clientCols, clientRows }, 'PTY not running, deferring start until resize with real dimensions');
          ptyManager.setDeferredStart(dir);
          // Send status so client knows PTY is not yet running
          this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });
          // Fallback: start with set-instance dims if no resize arrives within 3s
          if (ws._deferredStartTimer) clearTimeout(ws._deferredStartTimer);
          ws._deferredStartTimer = setTimeout(async () => {
            ws._deferredStartTimer = null;
            const pm = ptyRegistry.get(newInstanceId);
            if (!pm.isRunning && pm.deferredStartDir) {
              logger.info({ instanceId: newInstanceId, clientCols, clientRows }, 'Deferred start fallback: no resize received, starting with set-instance dimensions');
              // No caller to catch this: a rejection in a timer callback is
              // unhandled and would terminate the relay process.
              try {
                await pm.start(pm.deferredStartDir, clientCols, clientRows);
                ctx.sendReplay(pm, newInstanceId);
              } catch (error) {
                logger.error({ error: error.message, instanceId: newInstanceId }, 'Deferred PTY start failed');
                this.send(ws, { type: 'pty-error', message: error.message, instanceId: newInstanceId });
              }
            }
          }, 3000);
        } else if (!ptyManager.isRunning && !workingDir && !ptyManager.currentWorkingDir) {
          // No working directory - can't start Claude, send error to client
          logger.warn({ clientId: ws.clientId, instanceId: newInstanceId }, 'Cannot start CLI: no working directory configured');
          this.send(ws, {
            type: 'pty-error',
            message: 'No working directory configured. Set a project folder in instance settings.',
            instanceId: newInstanceId,
          });
        } else if (workingDir && ptyManager.currentWorkingDir !== workingDir) {
          // Store pending working dir for next restart
          ptyManager.pendingWorkingDir = workingDir;
          logger.info({ instanceId: newInstanceId, pendingWorkingDir: workingDir }, 'Working directory change queued for next restart');
        }

        // Resize PTY to client dimensions before sending replay
        if (ptyManager.isRunning) {
          ptyManager.resize(clientCols, clientRows);
        }

        // Send replay for this instance
        ctx.sendReplay(ptyManager, newInstanceId);
        break;
      }

      case 'input': {
        const ptyManager = ptyRegistry.get(instanceId);
        if (message.data) {
          logger.info({ data: message.data, clientId: ws.clientId, instanceId }, 'Writing input to PTY');
          ptyManager.write(message.data);
        }
        break;
      }

      case 'resize': {
        const ptyManager = ptyRegistry.get(instanceId);
        if (message.cols && message.rows) {
          // If PTY is deferred, start it now with real xterm.js dimensions
          if (!ptyManager.isRunning && ptyManager.deferredStartDir) {
            if (ws._deferredStartTimer) {
              clearTimeout(ws._deferredStartTimer);
              ws._deferredStartTimer = null;
            }
            logger.info({ instanceId, cols: message.cols, rows: message.rows }, 'Starting deferred PTY with real resize dimensions');
            await ptyManager.start(ptyManager.deferredStartDir, message.cols, message.rows);
            ctx.sendReplay(ptyManager, instanceId);
          } else {
            ptyManager.resize(message.cols, message.rows);
          }
        }
        break;
      }

      case 'interrupt': {
        const ptyManager = ptyRegistry.get(instanceId);
        ptyManager.interrupt();
        break;
      }

      case 'restart': {
        const ptyManager = ptyRegistry.get(instanceId);
        const workingDir = message.workingDir || ptyManager.currentWorkingDir;
        const restartCols = message.cols || ptyManager.lastCols;
        const restartRows = message.rows || ptyManager.lastRows;
        ptyManager.stop();
        ptyManager.clearBuffer();
        ptyManager.resetRestartCounter();
        await ptyManager.start(workingDir, restartCols, restartRows);
        this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });
        break;
      }

      case 'status': {
        const ptyManager = ptyRegistry.get(instanceId);
        this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });
        break;
      }

      case 'replay': {
        const ptyManager = ptyRegistry.get(instanceId);
        const bufferedOutput = ptyManager.getBufferedOutput();
        if (bufferedOutput) {
          this.send(ws, { type: 'replay', data: bufferedOutput, instanceId });
        }
        break;
      }

      case 'submit': {
        const ptyManager = ptyRegistry.get(instanceId);
        if (message.data) {
          // Clear any residual text in the CLI's readline buffer before
          // writing the new input. Without this, a rejected slash command
          // (e.g. /commit-push in Antigravity) stays in the line buffer
          // and the next submit gets appended to it instead of replacing it.
          // \x15 = Ctrl-U = "kill line" in readline / vi insert / most line
          // editors. No-op when the buffer is already empty.
          //
          // Tradeoff: if an Ink-based prompt is currently active (Claude
          // model picker, agy y/n survey, etc.), the CLI is in raw/cbreak
          // mode and \x15 is delivered as a literal 0x15 keystroke that
          // the prompt may misinterpret. The client-side workaround for
          // those prompts is the long-press-Send → raw-send path, which
          // bypasses this handler entirely.
          //
          // Two-phase write: text first, then \r after a 150ms gap so the
          // CLI's paste-detection heuristic doesn't fold the trailing \r
          // into the burst and treat it as a literal newline instead of
          // submit. 150ms is a guess against an undocumented heuristic —
          // works reliably in practice; if it ever regresses, bump higher.
          logger.debug({ clientId: ws.clientId, instanceId, len: message.data.length }, 'submit: kill-line + write + delayed Enter');
          ptyManager.write('\x15');
          ptyManager.write(message.data);
          setTimeout(() => {
            ptyManager.write('\r');
          }, 150);
        }
        break;
      }

      default:
        logger.warn({ type, clientId: ws.clientId }, 'Unknown WebSocket message type');
    }
  }

  send(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    });
  }

  // Broadcast to clients subscribed to a specific instance
  broadcastToInstance(instanceId, message) {
    const data = JSON.stringify({ ...message, instanceId });
    this.clients.forEach((client) => {
      if (client.readyState === client.OPEN && client.instanceId === instanceId) {
        client.send(data);
      }
    });
  }

  generateClientId() {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectedClients() {
    return this.clients.size;
  }

  // Get count of clients connected to a specific instance
  getInstanceClients(instanceId) {
    let count = 0;
    this.clients.forEach((client) => {
      if (client.instanceId === instanceId) count++;
    });
    return count;
  }
}

module.exports = WebSocketHandler;
