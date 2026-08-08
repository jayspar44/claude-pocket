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

      const ctx = this.createClientContext(ws);

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
        this.handleMessage(ws, message, ctx).catch((error) => {
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

  // Extracted from the connection handler so the replay/listener wiring can be
  // driven directly in tests - the same reason handleSetInstance and
  // runDeferredStartFallback are methods. Nothing outside this scope reads the
  // closed-over state: ws.on('close') goes through ws.ptyListener and
  // ws.currentPtyManager, which setupPtyListener assigns.
  createClientContext(ws) {
    const clientId = ws.clientId;
    // Skip batched output until the replay is sent, so the 50ms batch window
    // cannot deliver bytes the replay blob already carries.
    let skipUntilReplay = true;
    let ptyListener = null;

    const setupPtyListener = (instanceId, cliType) => {
      // Resolve the manager BEFORE detaching anything. get() throws when the
      // instance cap is reached and nothing is evictable; removing the old
      // listener ahead of that throw detaches this client from the PTY it was
      // happily watching and never re-attaches it, so the tab keeps saying
      // "Connected", input still reaches the CLI, and no output ever renders
      // again. Either this function changes nothing, or it completes.
      const ptyManager = ptyRegistry.get(instanceId, undefined, cliType);

      if (ptyListener && ws.currentPtyManager) {
        ws.currentPtyManager.removeListener(ptyListener);
      }
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

    const sendReplay = (ptyManager, instanceId) => {
      const bufferedOutput = this.snapshotForReplay(ptyManager);
      if (bufferedOutput) {
        logger.info({ clientId, instanceId, bufferLength: bufferedOutput.length }, 'Sending replay');
        this.send(ws, { type: 'replay', data: bufferedOutput, instanceId });
      }
      skipUntilReplay = false;
      this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });
    };

    return {
      setupPtyListener,
      sendReplay,
      skipUntilReplay: () => skipUntilReplay,
      setSkipReplay: (v) => { skipUntilReplay = v; },
    };
  }

  // The batch queue always holds bytes that are ALREADY in the replay buffer:
  // onData appends to the buffer before it queues for broadcast. Snapshotting
  // with a batch still pending therefore ships those bytes twice - once inside
  // the replay blob, once when the 50ms timer fires - which is what made the
  // client render the same tail twice after every reconnect. Draining first is
  // what makes the two disjoint, and it is why skipUntilReplay finally does
  // what its comment always claimed.
  snapshotForReplay(ptyManager) {
    ptyManager.flushBatch();
    return ptyManager.getBufferedOutput();
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

      case 'set-instance':
        // Every set-instance must be answered, and the client's handshake
        // completes on the pty-status this path sends and on nothing else. A
        // throw that leaves the client with silence therefore costs it a 10s
        // connect timeout and then the whole reconnect ladder, re-running a
        // failure that repeats identically - the registry refusing the
        // instance because its cap is reached and nothing is evictable.
        //
        // handshakeFailed means "this frame is the entire answer to your
        // set-instance; no pty-status is coming". The client ends the attempt
        // on it rather than waiting and retrying. It is set only here: a
        // mid-session pty-error (a CLI that failed to spawn) must leave a
        // working connection alone, and the client ignores the flag unless it
        // is still mid-handshake.
        try {
          await this.handleSetInstance(ws, message, ctx);
        } catch (error) {
          // Whatever threw, output must not stay suppressed. handshakeFailed is
          // only honoured by a client still in CONNECTING; the Start button
          // re-sends set-instance over an already-CONNECTED socket, and such a
          // client ignores this frame entirely. Leaving skipUntilReplay true
          // there drops every output frame forever while the tab still reads
          // "Connected".
          ctx.setSkipReplay(false);
          logger.error(
            { clientId: ws.clientId, instanceId: message.instanceId, error: error.message },
            'set-instance failed; answering with a handshake-failed error'
          );
          this.send(ws, {
            type: 'pty-error',
            message: error.message,
            instanceId: message.instanceId || DEFAULT_INSTANCE_ID,
            handshakeFailed: true,
          });
        }
        break;

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
          // If PTY is deferred, start it now with real xterm.js dimensions.
          // stoppedByUser is checked as well as deferredStartDir: stop()
          // clears the deferred dir, but a resize must never be the thing
          // that revives a session the user explicitly ended.
          if (!ptyManager.isBusy && !ptyManager.stoppedByUser && ptyManager.deferredStartDir) {
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

      // Diagnostic only - never touches the PTY. The client reports what xterm
      // actually is; lastCols/lastRows are what the PTY was last told to be.
      // Those two disagreeing is the one condition that shreds a TUI's line
      // breaks, and nothing has ever been able to observe it: the relay only
      // saw the client's own claims. Rendering the same stream offline gave 0
      // wrapped rows at the width it was produced for and 38 one column
      // narrower, so `wrapped` is the artifact count on the client's screen.
      // It counts viewport rows only, so that offline "38" - measured over a
      // whole 62KB stream - is not directly comparable to what arrives here.
      case 'geometry': {
        const { cols, rows, wrapped } = message;
        // has() rather than get(): get() would create a PtyManager, and a
        // diagnostic must never be the thing that spawns an instance or trips
        // the instance cap.
        if (!cols || !rows || !ptyRegistry.has(instanceId)) break;

        const ptyManager = ptyRegistry.get(instanceId);
        const detail = {
          instanceId,
          clientId: ws.clientId,
          xtermCols: cols,
          xtermRows: rows,
          ptyCols: ptyManager.lastCols,
          ptyRows: ptyManager.lastRows,
          wrapped,
          status: ptyManager.status,
        };

        // lastCols is unset until the first spawn or resize, so before then
        // there is no PTY size to disagree with - not a mismatch, just nothing
        // to compare yet.
        const sized = ptyManager.lastCols && ptyManager.lastRows;
        if (sized && (cols !== ptyManager.lastCols || rows !== ptyManager.lastRows)) {
          logger.warn(detail, 'Geometry mismatch: xterm differs from PTY');
          ws._lastGeometry = null; // so recovery logs as a change, not silence
          break;
        }

        // The healthy case has to be observable at least once, or silence in
        // the log cannot be told apart from the reports never arriving - which
        // is exactly the hole the first deployment of this fell into. So the
        // first report and every subsequent change get an info line, and an
        // unchanging healthy terminal then falls quiet.
        const signature = `${cols}x${rows}:${wrapped > 0}`;
        if (ws._lastGeometry !== signature) {
          ws._lastGeometry = signature;
          logger.info(detail, wrapped > 0
            // Agreed sizes but wrapped rows on screen. Shell output can wrap
            // legitimately, so this is a lead rather than a fault.
            ? 'Geometry agrees but rows are wrapped'
            : 'Geometry agrees');
        } else {
          logger.debug(detail, 'Geometry check');
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
        // Same drain as the handshake path. Here skipUntilReplay is already
        // false, so the flushed output frame does reach this client just ahead
        // of the replay - harmless, because the client handles a replay with
        // terminal.clear() plus a full rewrite, which erases it microseconds
        // later. Wrapping this in setSkipReplay(true/false) instead would
        // reintroduce a flag that a throw could leave stuck on.
        const bufferedOutput = this.snapshotForReplay(ptyManager);
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

  // The whole of set-instance, in one place so handleMessage can wrap it in a
  // single try/catch. Every exit from here has sent the client a pty-status;
  // every throw out of it is answered by the handshakeFailed pty-error above,
  // so the client is never left waiting on an answer that will not come.
  async handleSetInstance(ws, message, ctx) {
    // Client wants to switch to a specific instance
    const newInstanceId = message.instanceId || DEFAULT_INSTANCE_ID;
    const workingDir = message.workingDir;
    const cliType = message.cliType || 'claude';
    const clientCols = message.cols || config.pty.cols;
    const clientRows = message.rows || config.pty.rows;

    // recoveryMs/recoveryAttempts are client diagnostics carried on the
    // handshake. Nothing branches on them - they exist because recovery
    // latency is otherwise invisible here: the relay only learns a client
    // exists once a socket completes, so every attempt that fails before the
    // upgrade leaves no trace on either side. Together they separate "the
    // client spent that time retrying" (attempts > 0) from "the client only
    // started trying just now" (recoveryMs ~ 0), which is the difference
    // between a backoff problem and a resume-handler problem.
    logger.info({
      clientId: ws.clientId,
      oldInstanceId: ws.instanceId,
      newInstanceId,
      workingDir,
      cliType,
      clientCols,
      clientRows,
      recoveryMs: message.recoveryMs,
      recoveryAttempts: message.recoveryAttempts,
    }, 'Client switching instance');

    // setupPtyListener first: only once it returns is this socket genuinely
    // bound to the new instance. Assigning ws.instanceId ahead of the bind
    // leaves a refused switch pointing the socket at an instance it holds no
    // listener for - and handleMessage falls back to ws.instanceId for any
    // frame that carries none (the app's bare 'replay' and 'geometry' frames
    // do), so a later frame would resolve, and create, the wrong manager.
    const ptyManager = ctx.setupPtyListener(newInstanceId, cliType);

    ws.instanceId = newInstanceId;
    ws.cliType = cliType;
    ctx.setSkipReplay(true);

    // Decided here, reported after the replay below. sendReplay ends with
    // a pty-status, and the client clears ptyError on any pty-status - so
    // an error sent before it is wiped by the status that follows, and the
    // user gets an idle terminal with no explanation.
    const missingWorkingDir = !ptyManager.isBusy
      && !workingDir
      && !ptyManager.currentWorkingDir;

    // Set by the stoppedByUser branch below, reported in the same place and
    // for the same reason. The flag lives on this manager and is keyed on the
    // instance id alone, and 'default' is the one id every install shares - so
    // the client meeting this decline is not necessarily the one that made the
    // stop. A second phone's app points at the same 'default' manager, and
    // without this it gets an idle terminal, no explanation, and no hint that
    // the one control that fixes it (Start) is a menu away.
    let declinedForUserStop = false;

    // userStart is set only by the app's Start button, never by an
    // automatic (re)connect, so it is the one signal that may undo an
    // explicit stop. Without it "stop means stopped" would also block the
    // user's own Start; with it, reconnects still decline to auto-start.
    if (message.userStart) {
      ptyManager.stoppedByUser = false;
    }

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
      //
      // Pass the frame's own dimensions, undefined included, rather than
      // clientCols/clientRows: start() seeds lastCols/lastRows from
      // whatever it is handed, so passing the config fallback (50x24) for
      // a frame that carried no dimensions would overwrite known-good
      // geometry.
      if (ws._deferredStartTimer) clearTimeout(ws._deferredStartTimer);
      ws._deferredStartTimer = setTimeout(() => {
        this.runDeferredStartFallback(ws, newInstanceId, message.cols, message.rows, ctx);
      }, 3000);
    } else if (missingWorkingDir) {
      // No working directory - can't start Claude. Checked ahead of
      // stoppedByUser: an instance that is both stopped and misconfigured
      // needs the actionable error, otherwise the client shows an idle
      // terminal with no hint and a disabled Start button.
      logger.warn({ clientId: ws.clientId, instanceId: newInstanceId }, 'Cannot start CLI: no working directory configured');
    } else if (!ptyManager.isBusy && ptyManager.stoppedByUser) {
      logger.info(
        { clientId: ws.clientId, instanceId: newInstanceId },
        'Not auto-starting: session was explicitly stopped'
      );
      // No pty-status here: sendReplay() below ends with one, and nothing
      // between the two changes the status (the instance is stopped, so
      // neither the isRunning resize nor the 'starting' dimension write
      // applies). Sending it twice is two identical frames for one event.
      declinedForUserStop = true;
    } else if (workingDir && ptyManager.currentWorkingDir !== workingDir) {
      // Store pending working dir for next restart
      ptyManager.pendingWorkingDir = workingDir;
      logger.info({ instanceId: newInstanceId, pendingWorkingDir: workingDir }, 'Working directory change queued for next restart');
    }

    // Resize PTY to client dimensions before sending replay
    if (ptyManager.isRunning) {
      ptyManager.resize(clientCols, clientRows);
    } else if (ptyManager.status === 'starting' && message.cols && message.rows) {
      // No process to resize yet. Record the dimensions so the spawn uses
      // them instead of whatever dimensions the in-flight start() call was
      // given - otherwise a reconnecting client's real dimensions are lost
      // and the CLI spawns at the fallback size. Only for a frame that
      // actually carries dimensions: clientCols falls back to
      // config.pty.cols (50), which would downgrade a correct in-flight
      // 120x40 spawn whenever a client omits them.
      ptyManager.lastCols = message.cols;
      ptyManager.lastRows = message.rows;
    }

    // Send replay for this instance
    ctx.sendReplay(ptyManager, newInstanceId);

    // Last, so the pty-status sendReplay just sent cannot clear it. The two
    // are mutually exclusive by the if/else chain above; the else-if says so.
    if (missingWorkingDir) {
      this.send(ws, {
        type: 'pty-error',
        message: 'No working directory configured. Set a project folder in instance settings.',
        instanceId: newInstanceId,
      });
    } else if (declinedForUserStop) {
      // No handshakeFailed flag: the instance is bound and usable, this is an
      // explanation of an idle terminal, not a refusal. The client shows it in
      // the status bar and leaves the connection alone.
      this.send(ws, {
        type: 'pty-error',
        message: 'Session stopped. Open the instance list and tap Start to run it again.',
        instanceId: newInstanceId,
      });
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
    // The whole body is inside the try, ptyRegistry.get() included: get()
    // throws when the instance cap is reached and no idle instance can be
    // evicted, and a throw out here is just as unhandled as one from
    // pm.start() - same bare setTimeout, same dead relay.
    try {
      const pm = ptyRegistry.get(newInstanceId);
      // stoppedByUser guard: same reasoning as the resize handler above - an
      // explicit stop between set-instance and this timer must win.
      if (!pm.isBusy && !pm.stoppedByUser && pm.deferredStartDir) {
        logger.info({ instanceId: newInstanceId, clientCols, clientRows }, 'Deferred start fallback: no resize received, starting with set-instance dimensions');
        await pm.start(pm.deferredStartDir, clientCols, clientRows);
        ctx.sendReplay(pm, newInstanceId);
      }
    } catch (error) {
      // pm.start() already logs its own failures and broadcasts a pty-error
      // to any connected listeners; this catch exists only to stop the
      // rejection from propagating unhandled.
      logger.error({ instanceId: newInstanceId, error: error.message }, 'Deferred start fallback failed');
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
