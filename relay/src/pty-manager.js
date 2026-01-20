const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

// Batch delay for output messages (reduces WebSocket overhead, improves performance)
const BATCH_DELAY_MS = 50;

class PtyManager {
  constructor() {
    this.ptyProcess = null;
    this.outputBuffer = [];
    this.outputBufferSize = 0;
    this.listeners = new Set();
    this.isRunning = false;
    this.currentWorkingDir = null;
    // Batching state
    this.batchQueue = '';
    this.batchTimer = null;
    // Persistence state
    this.saveTimer = null;
  }

  start(workingDir = null) {
    if (this.ptyProcess) {
      logger.warn('PTY process already running');
      return;
    }

    // Use provided workingDir, or fall back to config
    const cwd = workingDir || config.workingDir;
    this.currentWorkingDir = cwd;

    // Restore buffer from disk if available
    this.loadBuffer();

    logger.info({ workingDir: cwd }, 'Starting Claude Code process');

    try {
      const proc = pty.spawn(config.claudeCommand, [], {
        name: 'xterm-256color',
        cols: config.pty.cols,
        rows: config.pty.rows,
        cwd: cwd,
        env: { ...config.pty.env, PWD: cwd },
      });

      this.ptyProcess = proc;
      this.isRunning = true;

      proc.onData((data) => {
        // Send raw output to xterm.js (handles all ANSI sequences natively)
        // Use batching to reduce WebSocket overhead (50ms window)
        this.appendToBuffer(data);
        this.queueOutput(data);
      });

      proc.onExit(({ exitCode, signal }) => {
        logger.info({ exitCode, signal }, 'Claude Code process exited');
        // Only clear if this is still the current process (prevents race condition on restart)
        if (this.ptyProcess === proc) {
          this.isRunning = false;
          this.ptyProcess = null;
        }
        this.broadcast({ type: 'pty-status', running: this.isRunning, exitCode, signal });
      });

      logger.info({ pid: proc.pid }, 'Claude Code process started');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to start Claude Code process');
      throw error;
    }
  }

  stop() {
    if (this.ptyProcess) {
      logger.info('Stopping Claude Code process');
      // Flush any pending batched output
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.flushBatch();
      }
      // Flush any pending buffer save
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        this.saveBuffer();
      }
      this.ptyProcess.kill();
      this.ptyProcess = null;
      this.isRunning = false;
    }
  }

  write(data) {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  resize(cols, rows) {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
      logger.debug({ cols, rows }, 'Terminal resized');
    }
  }

  interrupt() {
    if (this.ptyProcess) {
      // Send Ctrl+C
      this.ptyProcess.write('\x03');
      logger.debug('Interrupt signal sent');
    }
  }

  appendToBuffer(data) {
    this.outputBuffer.push(data);
    this.outputBufferSize += data.length;

    // Trim buffer if it exceeds max size
    while (this.outputBufferSize > config.buffer.maxSize && this.outputBuffer.length > 1) {
      const removed = this.outputBuffer.shift();
      this.outputBufferSize -= removed.length;
    }

    // Also limit by line count (approximate)
    const lineCount = this.outputBuffer.join('').split('\n').length;
    while (lineCount > config.buffer.maxLines && this.outputBuffer.length > 1) {
      const removed = this.outputBuffer.shift();
      this.outputBufferSize -= removed.length;
    }

    // Schedule persisting buffer to disk
    this.scheduleSave();
  }

  getBufferedOutput() {
    return this.outputBuffer.join('');
  }

  clearBuffer() {
    this.outputBuffer = [];
    this.outputBufferSize = 0;
    // Also delete persisted file (session-scoped, not across sessions)
    this.deletePersistFile();
  }

  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  broadcast(message) {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (error) {
        logger.error({ error: error.message }, 'Error in PTY listener');
      }
    }
  }

  // Batch output messages to reduce WebSocket overhead
  queueOutput(data) {
    this.batchQueue += data;

    // If no timer running, start one
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), BATCH_DELAY_MS);
    }
  }

  flushBatch() {
    if (this.batchQueue) {
      logger.debug({ length: this.batchQueue.length }, 'Flushing output batch');
      this.broadcast({ type: 'output', data: this.batchQueue });
      this.batchQueue = '';
    }
    this.batchTimer = null;
  }

  getStatus() {
    return {
      running: this.isRunning,
      pid: this.ptyProcess?.pid || null,
      bufferSize: this.outputBufferSize,
      bufferLines: this.outputBuffer.join('').split('\n').length,
      workingDir: this.currentWorkingDir,
    };
  }

  // === Buffer Persistence Methods ===

  getPersistPath() {
    const baseDir = this.currentWorkingDir || config.workingDir;
    return path.join(baseDir, config.buffer.persistPath);
  }

  ensurePersistDir() {
    const persistPath = this.getPersistPath();
    const dir = path.dirname(persistPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug({ dir }, 'Created persistence directory');
    }
  }

  scheduleSave() {
    // Debounce saves to avoid excessive disk writes
    if (this.saveTimer) return;

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveBuffer();
    }, config.buffer.saveDebounceMs);
  }

  saveBuffer() {
    if (!this.currentWorkingDir) return;

    try {
      this.ensurePersistDir();
      const persistPath = this.getPersistPath();
      const data = {
        timestamp: Date.now(),
        pid: this.ptyProcess?.pid || null,
        buffer: this.outputBuffer,
      };
      fs.writeFileSync(persistPath, JSON.stringify(data), 'utf8');
      logger.debug({ path: persistPath, lines: this.outputBuffer.length }, 'Buffer saved to disk');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to save buffer');
    }
  }

  loadBuffer() {
    if (!this.currentWorkingDir) return;

    try {
      const persistPath = this.getPersistPath();
      if (!fs.existsSync(persistPath)) {
        logger.debug('No persisted buffer found');
        return;
      }

      const content = fs.readFileSync(persistPath, 'utf8');
      const data = JSON.parse(content);

      if (data.buffer && Array.isArray(data.buffer)) {
        this.outputBuffer = data.buffer;
        this.outputBufferSize = data.buffer.join('').length;
        logger.info({
          lines: this.outputBuffer.length,
          size: this.outputBufferSize,
          savedAt: new Date(data.timestamp).toISOString(),
        }, 'Restored buffer from disk');
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to load buffer');
      // Don't fail - just start with empty buffer
      this.outputBuffer = [];
      this.outputBufferSize = 0;
    }
  }

  deletePersistFile() {
    try {
      const persistPath = this.getPersistPath();
      if (fs.existsSync(persistPath)) {
        fs.unlinkSync(persistPath);
        logger.debug({ path: persistPath }, 'Deleted persisted buffer file');
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to delete buffer file');
    }
  }
}

// Singleton instance
const ptyManager = new PtyManager();

module.exports = ptyManager;
