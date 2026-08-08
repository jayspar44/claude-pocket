const { test } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');
const ptyRegistry = require('../src/pty-registry');
const WebSocketHandler = require('../src/websocket-handler');

// onData appends to the replay buffer AND queues for the 50ms broadcast batch,
// so anything sitting in that queue is already inside the buffer. Snapshotting
// the buffer while a batch is pending therefore ships those bytes twice - once
// in the replay blob, once when the timer fires past a skipUntilReplay that has
// already been cleared. Observed in production as a verbatim duplicate of the
// last couple of lines immediately after a reconnect.

// The fake process every other relay test uses has a no-op onData, so nothing
// has ever driven appendToBuffer/queueOutput/flushBatch. This one keeps the
// callback so a test can push bytes through the real path.
function drivablePty() {
  const proc = {
    pid: 1,
    kill() {},
    write() {},
    resize() {},
    onExit() {},
    onData(cb) { proc._emit = cb; },
  };
  return proc;
}

async function runningManager(id) {
  const pm = new PtyManager(id, 'claude');
  pm._runSelfUpdate = () => Promise.resolve();
  const proc = drivablePty();
  pm._spawnPty = () => proc;
  pm.scheduleSave = () => {};          // keep the test off the disk
  await pm.start('/tmp', 80, 24);
  return { pm, emit: (data) => proc._emit(data) };
}

function recordingWs() {
  const sent = [];
  return { OPEN: 1, readyState: 1, clientId: 'replay-client', sent,
           send(raw) { sent.push(JSON.parse(raw)); } };
}

const settle = () => new Promise((r) => setTimeout(r, 80));   // > BATCH_DELAY_MS

function textOf(frames, type) {
  return frames.filter((f) => f.type === type).map((f) => f.data).join('');
}

// Asserts the cancellation itself rather than the handle. The pre-fix body
// already ended with `this.batchTimer = null`, so `batchTimer === null` was
// true either way - a test written that way passed with the fix reverted, which
// is exactly the shape the repo rule warns about. Observing clearTimeout is
// white-box, but it is the only deterministic way to tell a cancelled timer
// from a dereferenced one: a leaked timer fires into an already-drained queue
// and broadcasts nothing, so it leaves no black-box trace.
test('flushBatch cancels the timer it drains, not just the handle', async () => {
  const { pm, emit } = await runningManager('replay-flush-1');
  const realClear = global.clearTimeout;
  try {
    emit('hello');
    const armed = pm.batchTimer;
    assert.ok(armed, 'queueOutput should have armed a batch timer');

    const cleared = [];
    global.clearTimeout = (t) => { cleared.push(t); return realClear(t); };
    try {
      pm.flushBatch();
    } finally {
      global.clearTimeout = realClear;
    }

    assert.ok(
      cleared.includes(armed),
      'the armed batch timer must be cancelled - nulling the handle leaves it to fire into the next window'
    );
    assert.equal(pm.batchTimer, null);
    assert.equal(pm.batchQueue, '');
  } finally {
    global.clearTimeout = realClear;
    pm.stop();
  }
});

test('a chunk inside the batch window is replayed once, not twice', async () => {
  const id = 'replay-flush-2';
  const { pm, emit } = await runningManager(id);
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());
  try {
    const handler = Object.create(WebSocketHandler.prototype);
    const ws = recordingWs();
    const ctx = handler.createClientContext(ws);
    ctx.setupPtyListener(id, 'claude');

    // Arrives inside the 50ms window - in the buffer already, broadcast pending.
    emit('UNIQUE_MARKER');
    ctx.sendReplay(pm, id);
    await settle();

    const seen = textOf(ws.sent, 'replay') + textOf(ws.sent, 'output');
    const hits = seen.split('UNIQUE_MARKER').length - 1;
    assert.equal(hits, 1, `the client must see the chunk exactly once, saw ${hits}`);

    const types = ws.sent.map((f) => f.type);
    assert.ok(
      !types.slice(0, types.indexOf('replay')).includes('output'),
      'no output frame may precede the replay during a handshake'
    );
  } finally {
    ptyRegistry.instances.delete(id);
    ptyRegistry.lastAccessTime.delete(id);
    pm.stop();
  }
});

test('a mid-session replay request does not duplicate the pending tail', async () => {
  const id = 'replay-flush-3';
  const { pm, emit } = await runningManager(id);
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());
  try {
    const handler = Object.create(WebSocketHandler.prototype);
    const ws = recordingWs();
    const ctx = handler.createClientContext(ws);
    ctx.setupPtyListener(id, 'claude');
    ctx.sendReplay(pm, id);             // finish the handshake; skip flag now false
    ws.sent.length = 0;

    emit('TAIL_MARKER');
    await handler.handleMessage(ws, { type: 'replay', instanceId: id }, ctx);
    await settle();

    // The drained frame must be suppressed for the requester, exactly as on the
    // handshake path: the replay blob already carries those bytes. Letting it
    // through on the theory that terminal.clear() erases it does not work -
    // xterm keeps the cursor's line as row 0 and never resets the column, so
    // the tail survives and the replay is written into it.
    const inReplay = textOf(ws.sent, 'replay').split('TAIL_MARKER').length - 1;
    assert.equal(inReplay, 1, `the replay blob must carry the tail exactly once, saw ${inReplay}`);
    assert.equal(
      textOf(ws.sent, 'output'), '',
      'the requesting client must receive no output frame alongside its replay'
    );
  } finally {
    ptyRegistry.instances.delete(id);
    ptyRegistry.lastAccessTime.delete(id);
    pm.stop();
  }
});

test('the replay still precedes the pty-status that completes the handshake', async () => {
  const id = 'replay-flush-4';
  const { pm, emit } = await runningManager(id);
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());
  try {
    const handler = Object.create(WebSocketHandler.prototype);
    const ws = recordingWs();
    const ctx = handler.createClientContext(ws);
    ctx.setupPtyListener(id, 'claude');

    emit('anything');
    ctx.sendReplay(pm, id);

    const types = ws.sent.map((f) => f.type);
    assert.ok(types.indexOf('replay') < types.indexOf('pty-status'), 'replay must come before pty-status');
  } finally {
    ptyRegistry.instances.delete(id);
    ptyRegistry.lastAccessTime.delete(id);
    pm.stop();
  }
});

test('a replay request still drains the batch for the other clients on the instance', async () => {
  const id = 'replay-flush-5';
  const { pm, emit } = await runningManager(id);
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());
  try {
    const handler = Object.create(WebSocketHandler.prototype);
    const asker = recordingWs();
    const other = recordingWs();
    const askerCtx = handler.createClientContext(asker);
    const otherCtx = handler.createClientContext(other);
    askerCtx.setupPtyListener(id, 'claude');
    otherCtx.setupPtyListener(id, 'claude');
    askerCtx.sendReplay(pm, id);
    otherCtx.sendReplay(pm, id);
    asker.sent.length = 0;
    other.sent.length = 0;

    emit('SHARED');
    await handler.handleMessage(asker, { type: 'replay', instanceId: id }, askerCtx);

    // Suppression is per-connection: the skip flag lives in the asker's own
    // context, so a second device watching the same instance still gets the
    // drained bytes as ordinary output.
    assert.match(textOf(other.sent, 'output'), /SHARED/, 'other clients must still receive the drained output');
    assert.equal(textOf(asker.sent, 'output'), '', 'the asker must not');
  } finally {
    ptyRegistry.instances.delete(id);
    ptyRegistry.lastAccessTime.delete(id);
    pm.stop();
  }
});

test('stop() drains a pending batch even when the process is already gone', async () => {
  const { pm, emit } = await runningManager('replay-flush-6');
  const seen = [];
  pm.addListener((m) => { if (m.type === 'output') seen.push(m.data); });

  emit('PRE_CRASH_TAIL');
  assert.ok(pm.batchTimer, 'precondition: a batch is armed');

  // What node-pty's onExit does: the handle is gone while the final burst is
  // still queued. stop() used to return here before reaching flushBatch, and
  // the restart and delete routes call clearBuffer() straight after - so the
  // stray timer broadcast a tail that was no longer in the replay buffer.
  pm.ptyProcess = null;
  pm.stop();

  assert.ok(
    seen.join('').includes('PRE_CRASH_TAIL'),
    'the queued tail must be broadcast before the buffer is cleared, not after'
  );
  assert.equal(pm.batchTimer, null, 'and its timer must not outlive the stop');
});
