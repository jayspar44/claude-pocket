const { WebSocketServer } = require('ws');
const ptyManager = require('./pty-manager');
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
      this.clients.add(ws);

      logger.info({ clientId, ip: req.socket.remoteAddress }, 'WebSocket client connected');

      // Send connection status
      this.send(ws, { type: 'status', connected: true, clientId });

      // Flag to skip batched output until replay is sent
      // This prevents duplicates from the 50ms batch window
      let skipUntilReplay = true;

      // Subscribe to PTY output FIRST (before getting buffer)
      const ptyListener = (message) => {
        if (skipUntilReplay && message.type === 'output') {
          // Skip output messages until replay is sent
          // These are batched outputs already in the buffer
          return;
        }
        this.send(ws, message);
      };
      ptyManager.addListener(ptyListener);
      ws.ptyListener = ptyListener;

      // Now get buffered output and send replay
      // Any batched output that fires during setup is already in the buffer
      const bufferedOutput = ptyManager.getBufferedOutput();
      if (bufferedOutput) {
        logger.info({ clientId, bufferLength: bufferedOutput.length }, 'Sending replay');
        this.send(ws, { type: 'replay', data: bufferedOutput });
      }

      // Now accept new output
      skipUntilReplay = false;

      // Send PTY status
      this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          logger.error({ error: error.message, clientId }, 'Failed to parse WebSocket message');
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        logger.info({ clientId }, 'WebSocket client disconnected');
        this.clients.delete(ws);
        if (ws.ptyListener) {
          ptyManager.removeListener(ws.ptyListener);
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

  handleMessage(ws, message) {
    const { type } = message;
    logger.debug({ type, clientId: ws.clientId, dataLength: message.data?.length }, 'Received WebSocket message');

    switch (type) {
      case 'input':
        if (message.data) {
          logger.info({ data: message.data, clientId: ws.clientId }, 'Writing input to PTY');
          ptyManager.write(message.data);
        }
        break;

      case 'resize':
        if (message.cols && message.rows) {
          ptyManager.resize(message.cols, message.rows);
        }
        break;

      case 'interrupt':
        ptyManager.interrupt();
        break;

      case 'restart':
        ptyManager.stop();
        ptyManager.clearBuffer();
        ptyManager.start();
        this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });
        break;

      case 'status':
        this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });
        break;

      case 'replay':
        // Send buffered output for session resumption
        const bufferedOutput = ptyManager.getBufferedOutput();
        if (bufferedOutput) {
          this.send(ws, { type: 'replay', data: bufferedOutput });
        }
        break;

      case 'submit':
        // Two-phase submission: text first, then Enter after delay
        if (message.data) {
          ptyManager.write(message.data);
          setTimeout(() => {
            ptyManager.write('\r');
          }, 50);
        }
        break;

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

  generateClientId() {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectedClients() {
    return this.clients.size;
  }
}

module.exports = WebSocketHandler;
