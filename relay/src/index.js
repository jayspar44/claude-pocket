require('dotenv').config({ quiet: true });
const http = require('http');
const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const config = require('./config');
const ptyRegistry = require('./pty-registry');
const { DEFAULT_INSTANCE_ID } = require('./pty-registry');
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

// Skip body parsing for routes that handle their own parsing
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  // Skip for image uploads (handled by route-specific express.raw())
  if (contentType.startsWith('image/')) {
    return next();
  }
  // Skip for base64 upload route (has its own 15mb limit)
  if (req.path === '/api/files/upload-base64') {
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
  const instances = ptyRegistry.listInstances();
  const defaultInstance = ptyRegistry.getDefault();
  res.json({
    status: 'ok',
    version: process.env.npm_package_version || '0.1.0',
    pty: defaultInstance ? defaultInstance.getStatus() : { running: false },
    instanceCount: instances.length,
    clients: wsHandler.getConnectedClients(),
    workingDir: defaultInstance?.currentWorkingDir,
  });
});

// === Instance Management API ===

// List all instances
app.get('/api/instances', (req, res) => {
  const instances = ptyRegistry.listInstances();
  res.json({
    instances,
    count: instances.length,
    clients: wsHandler.getConnectedClients(),
  });
});

// Create/get instance with optional auto-start
app.post('/api/instances', (req, res) => {
  try {
    const { instanceId, workingDir, autoStart = false } = req.body;

    if (!instanceId) {
      return res.status(400).json({ error: 'instanceId is required' });
    }

    const ptyManager = ptyRegistry.get(instanceId, workingDir);

    if (autoStart && !ptyManager.isRunning && workingDir) {
      ptyManager.start(workingDir);
    }

    res.json({
      success: true,
      instance: ptyManager.getStatus(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete instance
app.delete('/api/instances/:instanceId', (req, res) => {
  try {
    const { instanceId } = req.params;
    const removed = ptyRegistry.remove(instanceId);

    if (!removed) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    res.json({ success: true, instanceId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop and delete ALL instances
app.delete('/api/instances', (req, res) => {
  try {
    const instances = ptyRegistry.listInstances();
    const removed = [];

    for (const instance of instances) {
      if (ptyRegistry.remove(instance.instanceId)) {
        removed.push(instance.instanceId);
      }
    }

    logger.info({ count: removed.length }, 'Stopped all PTY instances');
    res.json({ success: true, removed, count: removed.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get instance status
app.get('/api/instances/:instanceId', (req, res) => {
  try {
    const { instanceId } = req.params;

    if (!ptyRegistry.has(instanceId)) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const ptyManager = ptyRegistry.get(instanceId);
    res.json({
      instance: ptyManager.getStatus(),
      clients: wsHandler.getInstanceClients(instanceId),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === PTY Status/Control API (with optional instanceId) ===

// PTY status endpoint
app.get('/api/pty/status', (req, res) => {
  const instanceId = req.query.instanceId || DEFAULT_INSTANCE_ID;
  const ptyManager = ptyRegistry.get(instanceId);
  res.json(ptyManager.getStatus());
});

// Debug: Get raw buffer content
app.get('/api/pty/buffer', (req, res) => {
  const instanceId = req.query.instanceId || DEFAULT_INSTANCE_ID;
  const ptyManager = ptyRegistry.get(instanceId);
  const buffer = ptyManager.getBufferedOutput();
  res.json({
    instanceId,
    length: buffer.length,
    content: buffer,
    escaped: JSON.stringify(buffer).slice(1, -1), // Show escape sequences
  });
});

// Restart PTY endpoint
app.post('/api/pty/restart', (req, res) => {
  try {
    const { workingDir, instanceId = DEFAULT_INSTANCE_ID } = req.body || {};
    const ptyManager = ptyRegistry.get(instanceId);
    const restartDir = workingDir || ptyManager.currentWorkingDir;

    if (!restartDir) {
      return res.status(400).json({ error: 'workingDir required for new instance' });
    }

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
    const { workingDir, instanceId = DEFAULT_INSTANCE_ID } = req.body;
    const ptyManager = ptyRegistry.get(instanceId, workingDir);

    if (ptyManager.getStatus().running) {
      return res.status(400).json({ error: 'PTY already running. Stop it first or use restart.' });
    }

    if (!workingDir && !ptyManager.currentWorkingDir) {
      return res.status(400).json({ error: 'workingDir required for new instance' });
    }

    ptyManager.start(workingDir || ptyManager.currentWorkingDir);
    res.json({ success: true, status: ptyManager.getStatus(), workingDir: ptyManager.currentWorkingDir });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop PTY endpoint
app.post('/api/pty/stop', (req, res) => {
  try {
    const { instanceId = DEFAULT_INSTANCE_ID, clearBuffer = true } = req.body || {};
    const ptyManager = ptyRegistry.get(instanceId);

    ptyManager.stop();
    if (clearBuffer) {
      ptyManager.clearBuffer();
    }
    res.json({ success: true, status: ptyManager.getStatus() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
    features: ['multi-instance'],
  });
});

// Don't auto-start PTY - let the user configure and start from the app
logger.info('PTY auto-start disabled - use /api/pty/start or set-instance WebSocket message to launch Claude Code');

// Start server
server.listen(config.port, config.host, () => {
  logger.info({
    host: config.host,
    port: config.port,
    wsPath: config.ws.path,
  }, 'Relay server started');
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down relay server');
  ptyRegistry.shutdown();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down');
  ptyRegistry.shutdown();
  server.close(() => {
    process.exit(0);
  });
});
