require('dotenv').config({ quiet: true });
const http = require('http');
const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const config = require('./config');
const ptyManager = require('./pty-manager');
const WebSocketHandler = require('./websocket-handler');
const commandsRouter = require('./routes/commands');
const filesRouter = require('./routes/files');

const app = express();
const server = http.createServer(app);

// Initialize WebSocket handler
const wsHandler = new WebSocketHandler(server);

// CORS Configuration - allow all origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Skip JSON parsing for image uploads (handled by route-specific express.raw())
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('image/')) {
    return next();
  }
  express.json()(req, res, next);
});

// HTTP request logging middleware
app.use(pinoHttp({
  logger,
  autoLogging: false,
  quietReqLogger: true,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  const ptyStatus = ptyManager.getStatus();
  res.json({
    status: 'ok',
    version: process.env.npm_package_version || '0.1.0',
    pty: ptyStatus,
    clients: wsHandler.getConnectedClients(),
    workingDir: config.workingDir,
  });
});

// PTY status endpoint
app.get('/api/pty/status', (req, res) => {
  res.json(ptyManager.getStatus());
});

// Debug: Get raw buffer content
app.get('/api/pty/buffer', (req, res) => {
  const buffer = ptyManager.getBufferedOutput();
  res.json({
    length: buffer.length,
    content: buffer,
    escaped: JSON.stringify(buffer).slice(1, -1), // Show escape sequences
  });
});

// Restart PTY endpoint
app.post('/api/pty/restart', (req, res) => {
  try {
    // Use provided workingDir, or fall back to current working dir
    const { workingDir } = req.body || {};
    const restartDir = workingDir || ptyManager.currentWorkingDir;
    ptyManager.stop();
    ptyManager.clearBuffer();
    ptyManager.start(restartDir);
    res.json({ success: true, status: ptyManager.getStatus() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start PTY with optional working directory
app.post('/api/pty/start', (req, res) => {
  try {
    const { workingDir } = req.body;
    if (ptyManager.getStatus().running) {
      return res.status(400).json({ error: 'PTY already running. Stop it first or use restart.' });
    }
    ptyManager.start(workingDir);
    res.json({ success: true, status: ptyManager.getStatus(), workingDir: ptyManager.currentWorkingDir });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop PTY endpoint
app.post('/api/pty/stop', (req, res) => {
  try {
    ptyManager.stop();
    ptyManager.clearBuffer();
    res.json({ success: true, status: ptyManager.getStatus() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug logging endpoint (for mobile debugging)
const fs = require('fs');
const debugLogFile = '/Users/jayspar/Documents/projects/claude-pocket/debug.log';
app.post('/api/debug', (req, res) => {
  const { tag, data } = req.body || {};
  const logLine = `${new Date().toISOString()} [${tag}] ${JSON.stringify(data)}\n`;
  fs.appendFileSync(debugLogFile, logLine);
  logger.info({ tag, ...data }, `[DEBUG] ${tag}`);
  res.json({ ok: true });
});

// API Routes
app.use('/api/commands', commandsRouter);
app.use('/api/files', filesRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Claude Pocket Relay',
    version: process.env.npm_package_version || '0.1.0',
    ws: `ws://${req.headers.host}${config.ws.path}`,
  });
});

// Don't auto-start PTY - let the user configure and start from the app
logger.info('PTY auto-start disabled - use /api/pty/start to launch Claude Code');

// Start server
server.listen(config.port, config.host, () => {
  logger.info({
    host: config.host,
    port: config.port,
    workingDir: config.workingDir,
    wsPath: config.ws.path,
  }, 'Relay server started');
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down relay server');
  // Save buffer before stopping (stop() also does this, but explicit for safety)
  ptyManager.saveBuffer();
  ptyManager.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down');
  // Save buffer before stopping
  ptyManager.saveBuffer();
  ptyManager.stop();
  server.close(() => {
    process.exit(0);
  });
});
