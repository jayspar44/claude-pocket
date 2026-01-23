const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

// Batch delay for output messages (reduces WebSocket overhead, improves performance)
const BATCH_DELAY_MS = 50;

// Auto-restart configuration
const AUTO_RESTART_DELAY_MS = 1000; // Wait before restarting
const MAX_RESTART_ATTEMPTS = 3; // Max restarts within window
const RESTART_WINDOW_MS = 30000; // Reset counter after 30s of stability

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
    // Auto-restart state
    this.restartAttempts = 0;
    this.lastRestartTime = 0;
    this.intentionalStop = false;
    // Diagnostics
    this.processStartTime = 0;
    this.lastOutputLines = []; // Keep last 10 lines for crash diagnosis
    // Option detection state
    this.lastDetectedOptions = null;
    // Idle state tracking for option detection
    this.isIdle = false;
    this.lastOutputTime = 0;
    this.idleTimer = null;
    this.optionExpiryTimer = null;
  }

  start(workingDir) {
    if (this.ptyProcess) {
      logger.warn('PTY process already running');
      return;
    }

    if (!workingDir) {
      throw new Error('workingDir is required to start PTY');
    }

    this.currentWorkingDir = workingDir;
    this.intentionalStop = false;

    // Restore buffer from disk if available
    this.loadBuffer();

    logger.info({ workingDir }, 'Starting Claude Code process');

    try {
      const proc = pty.spawn(config.claudeCommand, [], {
        name: 'xterm-256color',
        cols: config.pty.cols,
        rows: config.pty.rows,
        cwd: workingDir,
        env: { ...config.pty.env, PWD: workingDir },
      });

      this.ptyProcess = proc;
      this.isRunning = true;
      this.processStartTime = Date.now();
      this.lastOutputLines = [];

      // Broadcast updated status to all connected clients (fixes status bar after auto-restart)
      this.broadcast({ type: 'pty-status', ...this.getStatus() });

      proc.onData((data) => {
        // Send raw output to xterm.js (handles all ANSI sequences natively)
        // Use batching to reduce WebSocket overhead (50ms window)
        this.appendToBuffer(data);
        this.queueOutput(data);

        // Track last lines for crash diagnosis (strip ANSI codes for readability)
        const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        const lines = cleanData.split('\n').filter(l => l.trim());
        for (const line of lines) {
          this.lastOutputLines.push(line.substring(0, 200)); // Limit line length
          if (this.lastOutputLines.length > 10) {
            this.lastOutputLines.shift();
          }
        }
      });

      proc.onExit(({ exitCode, signal }) => {
        const uptimeMs = Date.now() - this.processStartTime;
        const uptimeSeconds = Math.round(uptimeMs / 1000);
        const exitInfo = {
          exitCode,
          signal,
          pid: proc.pid,
          uptimeSeconds,
          intentionalStop: this.intentionalStop,
          restartAttempts: this.restartAttempts,
        };

        // Log with appropriate level based on exit type
        if (this.intentionalStop) {
          logger.info(exitInfo, 'Claude Code process stopped intentionally');
        } else if (exitCode === 0) {
          logger.info(exitInfo, 'Claude Code process exited normally');
        } else {
          // Include last output lines for crash diagnosis
          logger.error({
            ...exitInfo,
            lastOutput: this.lastOutputLines,
          }, 'Claude Code process crashed');

          // Broadcast crash details to clients for debugging
          this.broadcast({
            type: 'pty-crash',
            exitCode,
            signal,
            uptime: uptimeSeconds,
            lastOutput: this.lastOutputLines.slice(-5),
          });
        }

        // Only clear if this is still the current process (prevents race condition on restart)
        if (this.ptyProcess === proc) {
          this.isRunning = false;
          this.ptyProcess = null;
        }
        this.broadcast({ type: 'pty-status', running: this.isRunning, exitCode, signal });

        // Auto-restart if not intentionally stopped
        if (!this.intentionalStop) {
          this.scheduleRestart();
        }
      });

      logger.info({ pid: proc.pid }, 'Claude Code process started');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to start Claude Code process');
      throw error;
    }
  }

  scheduleRestart() {
    const now = Date.now();

    // Reset counter if enough time has passed since last restart
    if (now - this.lastRestartTime > RESTART_WINDOW_MS) {
      this.restartAttempts = 0;
    }

    // Check if we've exceeded max restart attempts
    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      logger.error({ attempts: this.restartAttempts }, 'Max restart attempts exceeded, giving up');
      this.broadcast({
        type: 'pty-error',
        message: 'Claude Code crashed repeatedly. Use restart button to try again.',
      });
      return;
    }

    this.restartAttempts++;
    this.lastRestartTime = now;

    logger.info(
      { attempt: this.restartAttempts, maxAttempts: MAX_RESTART_ATTEMPTS, delayMs: AUTO_RESTART_DELAY_MS },
      'Scheduling auto-restart'
    );

    // Notify clients of pending restart
    this.broadcast({ type: 'pty-restarting', attempt: this.restartAttempts });

    setTimeout(() => {
      if (!this.ptyProcess && !this.intentionalStop) {
        logger.info('Auto-restarting Claude Code process');
        this.start(this.currentWorkingDir);
      }
    }, AUTO_RESTART_DELAY_MS);
  }

  resetRestartCounter() {
    this.restartAttempts = 0;
    this.lastRestartTime = 0;
  }

  stop() {
    if (this.ptyProcess) {
      logger.info('Stopping Claude Code process');
      this.intentionalStop = true; // Prevent auto-restart
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
      // Clear idle and expiry timers
      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }
      if (this.optionExpiryTimer) {
        clearTimeout(this.optionExpiryTimer);
        this.optionExpiryTimer = null;
      }
      this.ptyProcess.kill();
      this.ptyProcess = null;
      this.isRunning = false;
    }
  }

  write(data) {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
      // Clear detected options when user sends input
      if (this.lastDetectedOptions) {
        this.clearDetectedOptions();
      }
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
    this.lastOutputTime = Date.now();
    this.isIdle = false;

    // Clear options on substantive new output (user typed, Claude responding)
    // This prevents stale options from persisting during new conversation flow
    const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    if (cleanData.length >= config.optionDetection.minSubstantiveChars && this.lastDetectedOptions) {
      this.clearDetectedOptions();
    }

    // Schedule idle detection (will run option detection when idle)
    this.scheduleIdleDetection();

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
    // Option detection now handled by idle detection in queueOutput()
  }

  scheduleIdleDetection() {
    // Clear any pending idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    // Schedule idle check after threshold
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.isIdle = true;
      this.checkIdleState();
    }, config.optionDetection.idleThresholdMs);
  }

  checkIdleState() {
    // Only detect options when PTY is idle (Claude waiting for input)
    if (!this.isIdle) return;

    const options = this.detectNumberedOptions();

    // Only broadcast if options changed
    const optionsKey = options ? options.join(',') : '';
    const lastKey = this.lastDetectedOptions ? this.lastDetectedOptions.join(',') : '';

    if (optionsKey !== lastKey) {
      this.lastDetectedOptions = options;
      this.broadcast({ type: 'options-detected', options: options || [] });
      if (options) {
        logger.debug({ options }, 'Detected numbered options');
        // Schedule auto-expiry
        this.scheduleOptionExpiry();
      }
    }
  }

  scheduleOptionExpiry() {
    // Clear any pending expiry
    if (this.optionExpiryTimer) {
      clearTimeout(this.optionExpiryTimer);
    }

    // Auto-clear options after timeout (user hasn't interacted)
    this.optionExpiryTimer = setTimeout(() => {
      this.optionExpiryTimer = null;
      if (this.lastDetectedOptions) {
        logger.debug('Options expired, clearing');
        this.clearDetectedOptions();
      }
    }, config.optionDetection.expiryMs);
  }

  detectNumberedOptions() {
    // Get recent buffer content
    const fullBuffer = this.getBufferedOutput();
    const recentBuffer = fullBuffer.slice(-config.optionDetection.bufferLookback);

    // Strip ANSI codes for clean parsing
    const clean = recentBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

    // Skip if inside a code block (odd number of ```)
    const codeBlockCount = (clean.match(/```/g) || []).length;
    if (codeBlockCount % 2 === 1) {
      return null;
    }

    // Improved pattern: require capital letter after number to filter out code/markdown
    // Matches: "1.", "1)", "1:", "[1]", "(1)" followed by space and capital letter
    const pattern = /(?:^|\n)\s*(?:(\d)[.):\]]\s+[A-Z]|\[(\d)\]\s+[A-Z]|\((\d)\)\s+[A-Z])/gm;
    const numbers = new Set();

    let match;
    while ((match = pattern.exec(clean)) !== null) {
      const num = parseInt(match[1] || match[2] || match[3]);
      if (num >= 1 && num <= 9) numbers.add(num);
    }

    // Only return if we found sequential options starting from 1
    if (numbers.size >= 2 && numbers.has(1)) {
      const sorted = Array.from(numbers).sort((a, b) => a - b);
      // Verify they're mostly sequential (allow gaps of 1)
      let isSequential = true;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] > 2) {
          isSequential = false;
          break;
        }
      }
      if (isSequential) {
        return sorted;
      }
    }

    return null;
  }

  clearDetectedOptions() {
    this.lastDetectedOptions = null;
    this.broadcast({ type: 'options-detected', options: [] });
    // Clear expiry timer
    if (this.optionExpiryTimer) {
      clearTimeout(this.optionExpiryTimer);
      this.optionExpiryTimer = null;
    }
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
    if (!this.currentWorkingDir) {
      return null;
    }
    return path.join(this.currentWorkingDir, config.buffer.persistPath);
  }

  ensurePersistDir() {
    const persistPath = this.getPersistPath();
    if (!persistPath) return;
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
    const persistPath = this.getPersistPath();
    if (!persistPath) return;

    try {
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
