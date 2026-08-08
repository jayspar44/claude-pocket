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

test('flushBatch clears its own timer, so no stray flush is left armed', async () => {
  const { pm, emit } = await runningManager('replay-flush-1');
  try {
    emit('hello');
    assert.notEqual(pm.batchTimer, null, 'queueOutput should have armed a batch timer');

    pm.flushBatch();

    assert.equal(pm.batchTimer, null, 'flushBatch must clear the timer it drains, not just null the handle');
    assert.equal(pm.batchQueue, '');
  } finally {
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

    // Mid-session the skip flag is already false, so the drained bytes DO reach
    // this client as an output frame. That is not a duplicate: the client
    // handles a replay with terminal.clear() followed by a full rewrite, so
    // whatever landed first is erased. The contract is therefore about
    // ordering, plus the replay blob itself carrying the tail exactly once -
    // the blob is the only thing that survives the clear.
    const inReplay = textOf(ws.sent, 'replay').split('TAIL_MARKER').length - 1;
    assert.equal(inReplay, 1, `the replay blob must carry the tail exactly once, saw ${inReplay}`);

    const types = ws.sent.map((f) => f.type);
    assert.ok(
      types.indexOf('output') < types.indexOf('replay'),
      'the drained output must land before the replay, so terminal.clear() erases it'
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
