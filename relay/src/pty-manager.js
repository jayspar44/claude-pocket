const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('./config');
const logger = require('./logger');

// Helper to get current git branch (fast, called on each status request)
function getGitBranch(cwd) {
  if (!cwd) return null;
  try {
    return execSync('git branch --show-current', {
      cwd,
      encoding: 'utf8',
      timeout: 1000,  // 1s timeout to prevent blocking
      stdio: ['pipe', 'pipe', 'pipe']  // Suppress stderr
    }).trim() || null;
  } catch {
    return null;  // Not a git repo or error
  }
}

// Batch delay for output messages (reduces WebSocket overhead, improves performance)
const BATCH_DELAY_MS = 50;

// Auto-restart configuration
const AUTO_RESTART_DELAY_MS = 1000; // Wait before restarting
const MAX_RESTART_ATTEMPTS = 3; // Max restarts within window
const RESTART_WINDOW_MS = 30000; // Reset counter after 30s of stability

class PtyManager {
  /**
   * Create a PTY manager instance
   * @param {string} instanceId - Unique identifier for this instance (used for buffer persistence)
   */
  constructor(instanceId = 'default', cliType = 'claude') {
    this.instanceId = instanceId;
    this.cliType = cliType;
    this.ptyProcess = null;
    this.outputBuffer = [];
    this.outputBufferSize = 0;
    this.listeners = new Set();
    this.isRunning = false;
    this.currentWorkingDir = null;
    this.pendingWorkingDir = null; // For updating workingDir without restart
    this.deferredStartDir = null; // For deferring PTY start until first resize with real dimensions
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
    // Idle detection for long task completion
    this.idleTimer = null;
    // Long task tracking for notifications
    this.lastUserInputTime = 0;
    this.processingStartTime = null;
  }

  get cliLabel() {
    return this.cliType === 'gemini' ? 'Gemini CLI' : 'Claude Code';
  }

  setDeferredStart(workingDir) {
    this.deferredStartDir = workingDir;
    logger.info({ instanceId: this.instanceId, workingDir }, 'Deferred PTY start until first resize with real dimensions');
  }

  start(workingDir, cols, rows) {
    if (this.ptyProcess) {
      logger.warn({ instanceId: this.instanceId }, 'PTY process already running');
      return;
    }

    // Clear deferred start since we're starting now
    this.deferredStartDir = null;

    // Use pending working dir if set (changed while running)
    const effectiveWorkingDir = this.pendingWorkingDir || workingDir;
    this.pendingWorkingDir = null;

    if (!effectiveWorkingDir) {
      throw new Error('workingDir is required to start PTY');
    }

    const spawnCols = cols || config.pty.cols;
    const spawnRows = rows || config.pty.rows;
    this.lastCols = spawnCols;
    this.lastRows = spawnRows;

    this.currentWorkingDir = effectiveWorkingDir;
    this.intentionalStop = false;

    // Restore buffer from disk if available
    this.loadBuffer();

    logger.info({ instanceId: this.instanceId, cliType: this.cliType, workingDir: effectiveWorkingDir, cols: spawnCols, rows: spawnRows }, `Starting ${this.cliLabel} process`);

    try {
      const command = this.cliType === 'gemini' ? config.geminiCommand : config.claudeCommand;
      const proc = pty.spawn(command, [], {
        name: 'xterm-256color',
        cols: spawnCols,
        rows: spawnRows,
        cwd: effectiveWorkingDir,
        env: { ...config.pty.env, PWD: effectiveWorkingDir },
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
        const cleanData = data
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')           // CSI sequences
          .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, ''); // OSC sequences (hyperlinks)
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
          logger.info(exitInfo, `${this.cliLabel} process stopped intentionally`);
        } else if (exitCode === 0) {
          logger.info(exitInfo, `${this.cliLabel} process exited normally`);
        } else {
          // Include last output lines for crash diagnosis
          logger.error({
            ...exitInfo,
            lastOutput: this.lastOutputLines,
          }, `${this.cliLabel} process crashed`);

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

      logger.info({ pid: proc.pid }, `${this.cliLabel} process started`);
    } catch (error) {
      logger.error({ error: error.message }, `Failed to start ${this.cliLabel} process`);
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
        message: `${this.cliLabel} crashed repeatedly. Use restart button to try again.`,
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
        logger.info(`Auto-restarting ${this.cliLabel} process`);
        this.start(this.currentWorkingDir, this.lastCols, this.lastRows);
      }
    }, AUTO_RESTART_DELAY_MS);
  }

  resetRestartCounter() {
    this.restartAttempts = 0;
    this.lastRestartTime = 0;
  }

  stop() {
    if (this.ptyProcess) {
      logger.info(`Stopping ${this.cliLabel} process`);
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
      // Clear idle timer
      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }
      this.ptyProcess.kill();
      this.ptyProcess = null;
      this.isRunning = false;
    }
  }

  write(data) {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
      // Track user input time for long task detection
      this.lastUserInputTime = Date.now();
      this.processingStartTime = Date.now();
      // Broadcast status immediately so clients know processing started
      this.broadcast({ type: 'pty-status', ...this.getStatus() });
    }
  }

  resize(cols, rows) {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
      this.lastCols = cols;
      this.lastRows = rows;
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

    // Schedule idle check for long task detection
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.checkIdleState();
    }, 800);

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

  checkIdleState() {
    if (this.processingStartTime) {
      const processingDuration = Date.now() - this.processingStartTime;
      if (processingDuration >= config.longTask.thresholdMs) {
        logger.info({ duration: processingDuration }, 'Long task completed - broadcasting task-complete');
        this.broadcast({
          type: 'task-complete',
          duration: processingDuration,
        });
      }
      this.processingStartTime = null;
    }
    this.broadcast({ type: 'pty-status', ...this.getStatus() });
  }

  getStatus() {
    return {
      instanceId: this.instanceId,
      cliType: this.cliType,
      running: this.isRunning,
      pid: this.ptyProcess?.pid || null,
      bufferSize: this.outputBufferSize,
      bufferLines: this.outputBuffer.join('').split('\n').length,
      workingDir: this.currentWorkingDir,
      gitBranch: getGitBranch(this.currentWorkingDir),  // Dynamic git branch
      processingStartTime: this.processingStartTime,
      listenerCount: this.listeners.size,
    };
  }

  // === Buffer Persistence Methods ===

  getPersistPath() {
    if (!this.currentWorkingDir) {
      return null;
    }
    // Include instanceId in buffer filename for multi-instance support
    const bufferDir = path.dirname(config.buffer.persistPath);
    const bufferFilename = `output-buffer-${this.instanceId}.json`;
    return path.join(this.currentWorkingDir, bufferDir, bufferFilename);
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

// Export the class for multi-instance support via PtyRegistry
module.exports = PtyManager;
