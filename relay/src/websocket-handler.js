const { WebSocketServer } = require('ws');
const ptyRegistry = require('./pty-registry');
const { DEFAULT_INSTANCE_ID } = require('./pty-registry');
const config = require('./config');
const logger = require('./logger');

class WebSocketHandler {
  // JSON.parse succeeds on null, numbers, strings and arrays. handleMessage
  // destructures its argument, so anything that is not a plain object must be
  // rejected here rather than throwing downstream.
  static parseClientFrame(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'invalid-json' };
    }
    if (typeof message !== 'object' || message === null || Array.isArray(message)) {
      return { ok: false, reason: 'not-an-object' };
    }
    return { ok: true, message };
  }

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
        const parsed = WebSocketHandler.parseClientFrame(data.toString());
        if (!parsed.ok) {
          logger.warn({ clientId, reason: parsed.reason }, 'Ignoring unusable WebSocket frame');
          return;
        }
        const message = parsed.message;
        // handleMessage is async. An unhandled rejection here terminates the
        // process under Node's default --unhandled-rejections=throw, taking
        // every PTY session with it.
        this.handleMessage(ws, message, {
          setupPtyListener,
          sendReplay,
          skipUntilReplay: () => skipUntilReplay,
          setSkipReplay: (v) => { skipUntilReplay = v; },
        }).catch((error) => {
          logger.error(
            { error: error.message, clientId, type: message.type },
            'Failed to handle WebSocket message'
          );
          this.send(ws, {
            type: 'pty-error',
            message: error.message,
            instanceId: ws.instanceId,
          });
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

    this.wss.on('close', () => {
      clearInterval(this.pingInterval);
    });
  }

  // wss.on('close') never fires for a server-attached WebSocketServer, so the
  // shutdown path calls this directly. Safe to call more than once.
  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pingInterval);
    // wss.close() only stops new connections; live sockets keep the http
    // server's close callback from ever running.
    this.wss.clients.forEach((ws) => ws.terminate());
    this.clients.clear();
    this.wss.close();
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
        ws.cliType = cliType;
        ctx.setSkipReplay(true);

        const ptyManager = ctx.setupPtyListener(newInstanceId, cliType);

        // Auto-start PTY if not running but we have a working directory
        // Defer start until first resize arrives with real xterm.js dimensions
        // to prevent MCP tool calls rendering vertically with stale/fallback dimensions
        if (!ptyManager.isBusy && !ptyManager.stoppedByUser && (workingDir || ptyManager.currentWorkingDir)) {
          const dir = workingDir || ptyManager.currentWorkingDir;
          logger.info({ clientId: ws.clientId, instanceId: newInstanceId, workingDir: dir, clientCols, clientRows }, 'PTY not running, deferring start until resize with real dimensions');
          ptyManager.setDeferredStart(dir);
          // Send status so client knows PTY is not yet running
          this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });
          // Fallback: start with set-instance dims if no resize arrives within 3s.
          // Extracted to a method (rather than an inline async arrow) so the
          // try/catch around pm.start() can be exercised directly in tests
          // without waiting on a real 3s timer.
          if (ws._deferredStartTimer) clearTimeout(ws._deferredStartTimer);
          ws._deferredStartTimer = setTimeout(() => {
            this.runDeferredStartFallback(ws, newInstanceId, clientCols, clientRows, ctx);
          }, 3000);
        } else if (!ptyManager.isBusy && ptyManager.stoppedByUser) {
          logger.info(
            { clientId: ws.clientId, instanceId: newInstanceId },
            'Not auto-starting: session was explicitly stopped'
          );
          this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });
        } else if (!ptyManager.isBusy && !workingDir && !ptyManager.currentWorkingDir) {
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
        } else if (ptyManager.status === 'starting') {
          // No process to resize yet. Record the dimensions so the spawn uses
          // them instead of whatever dimensions the in-flight start() call was
          // given - otherwise a reconnecting client's real dimensions are lost
          // and the CLI spawns at the fallback size.
          ptyManager.lastCols = clientCols;
          ptyManager.lastRows = clientRows;
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
          if (!ptyManager.isBusy && ptyManager.deferredStartDir) {
            if (ws._deferredStartTimer) {
              clearTimeout(ws._deferredStartTimer);
              ws._deferredStartTimer = null;
            }
            logger.info({ instanceId, cols: message.cols, rows: message.rows }, 'Starting deferred PTY with real resize dimensions');
            await ptyManager.start(ptyManager.deferredStartDir, message.cols, message.rows);
            ctx.sendReplay(ptyManager, instanceId);
          } else if (ptyManager.status === 'starting') {
            // No process to resize yet. Record the dimensions so the spawn uses
            // them instead of the set-instance fallback, which is what makes MCP
            // tool output render vertically.
            ptyManager.lastCols = message.cols;
            ptyManager.lastRows = message.rows;
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
        // Deliberate restart: forget any earlier user-initiated stop so a
        // later remove()+get() cycle for this id doesn't re-seed
        // stoppedByUser from a decision the user has since reversed.
        ptyRegistry.clearUserStop(instanceId);
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

  // Fires ~3s after set-instance arms a deferred start, if no resize arrived
  // with real dimensions in the meantime. Runs from a bare setTimeout with no
  // caller to await it, so a rejection here (e.g. pty.spawn failing because
  // the configured CLI binary is missing or misconfigured) MUST be caught
  // locally - otherwise it is an unhandled rejection and, under Node's
  // default --unhandled-rejections=throw, takes down the whole relay process,
  // killing every other instance's session along with it.
  async runDeferredStartFallback(ws, newInstanceId, clientCols, clientRows, ctx) {
    ws._deferredStartTimer = null;
    const pm = ptyRegistry.get(newInstanceId);
    if (!pm.isBusy && pm.deferredStartDir) {
      logger.info({ instanceId: newInstanceId, clientCols, clientRows }, 'Deferred start fallback: no resize received, starting with set-instance dimensions');
      try {
        await pm.start(pm.deferredStartDir, clientCols, clientRows);
        ctx.sendReplay(pm, newInstanceId);
      } catch (error) {
        // pm.start() already logs the failure and broadcasts a pty-error to
        // any connected listeners; this catch exists only to stop the
        // rejection from propagating unhandled.
        logger.error({ instanceId: newInstanceId, error: error.message }, 'Deferred start fallback failed');
      }
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
