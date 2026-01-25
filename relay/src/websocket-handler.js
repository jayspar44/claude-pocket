const { WebSocketServer } = require('ws');
const ptyRegistry = require('./pty-registry');
const { DEFAULT_INSTANCE_ID } = require('./pty-registry');
const config = require('./config');
const logger = require('./logger');

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
      this.clients.add(ws);

      logger.info({ clientId, ip: req.socket.remoteAddress }, 'WebSocket client connected');

      // Send connection status
      this.send(ws, { type: 'status', connected: true, clientId });

      // Flag to skip batched output until replay is sent
      // This prevents duplicates from the 50ms batch window
      let skipUntilReplay = true;
      let ptyListener = null;

      // Setup PTY listener for this client
      const setupPtyListener = (instanceId) => {
        // Remove old listener if switching instances
        if (ptyListener && ws.currentPtyManager) {
          ws.currentPtyManager.removeListener(ptyListener);
        }

        const ptyManager = ptyRegistry.get(instanceId);
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
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message, { setupPtyListener, sendReplay, skipUntilReplay: () => skipUntilReplay, setSkipReplay: (v) => { skipUntilReplay = v; } });
        } catch (error) {
          logger.error({ error: error.message, clientId }, 'Failed to parse WebSocket message');
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        logger.info({ clientId, instanceId: ws.instanceId }, 'WebSocket client disconnected');
        this.clients.delete(ws);
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

  handleMessage(ws, message, ctx) {
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

        logger.info({ clientId: ws.clientId, oldInstanceId: ws.instanceId, newInstanceId, workingDir }, 'Client switching instance');

        ws.instanceId = newInstanceId;
        ctx.setSkipReplay(true);

        const ptyManager = ctx.setupPtyListener(newInstanceId);

        // Auto-start PTY if not running but we have a working directory
        if (!ptyManager.isRunning && (workingDir || ptyManager.currentWorkingDir)) {
          logger.info({ clientId: ws.clientId, instanceId: newInstanceId, workingDir }, 'PTY not running, auto-starting');
          ptyManager.start(workingDir || ptyManager.currentWorkingDir);
        } else if (!ptyManager.isRunning && !workingDir && !ptyManager.currentWorkingDir) {
          // No working directory - can't start Claude, send error to client
          logger.warn({ clientId: ws.clientId, instanceId: newInstanceId }, 'Cannot start Claude: no working directory configured');
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
          ptyManager.resize(message.cols, message.rows);
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
        ptyManager.stop();
        ptyManager.clearBuffer();
        ptyManager.resetRestartCounter();
        ptyManager.start(workingDir);
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
        // Two-phase submission: text first, then Enter after delay
        if (message.data) {
          ptyManager.write(message.data);
          setTimeout(() => {
            ptyManager.write('\r');
          }, 50);
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
