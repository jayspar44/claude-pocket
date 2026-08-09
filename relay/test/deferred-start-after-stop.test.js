const { test } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');
const ptyRegistry = require('../src/pty-registry');
const WebSocketHandler = require('../src/websocket-handler');

// set-instance arms a deferred start (deferredStartDir) and waits for a
// resize carrying real xterm.js dimensions. If the user stops the session
// while that trigger is still armed - e.g. the socket drops inside the 3s
// fallback window (the close handler clears the timer, not the dir) and the
// user then taps Stop - the next resize frame must NOT resurrect the CLI.
// Two independent guards make that true: stop() disarms the trigger, and the
// deferred-start guards also refuse to fire for a session stoppedByUser.

function countingSpawnManager(id) {
  const pm = new PtyManager(id, 'claude');
  pm.spawns = 0;
  pm._runSelfUpdate = () => Promise.resolve();
  pm._spawnPty = function () {
    this.spawns++;
    return { pid: 1, kill() {}, write() {}, resize() {}, onData() {}, onExit() {} };
  };
  return pm;
}

function fakeWs() {
  return { OPEN: 1, readyState: 1, send() {}, clientId: 'fake-client' };
}

function fakeCtx() {
  return { sendReplay: () => {}, setSkipReplay: () => {} };
}

test('stop() disarms a pending deferred start', () => {
  const pm = new PtyManager('deferred-stop-1', 'claude');
  pm.setDeferredStart('/tmp');
  assert.equal(pm.deferredStartDir, '/tmp');

  pm.stop();

  assert.equal(pm.deferredStartDir, null, 'an explicit stop must clear the armed deferred start');
});

test('a resize after an explicit stop does not spawn a deferred CLI', async () => {
  const id = 'deferred-stop-2';
  const pm = countingSpawnManager(id);
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());

  // The exact sequence from the review: deferred start armed, socket drops
  // inside the 3s window, then POST /api/pty/stop.
  pm.setDeferredStart('/tmp');
  pm.stop();

  const handler = Object.create(WebSocketHandler.prototype);
  await handler.handleMessage(fakeWs(), { type: 'resize', instanceId: id, cols: 92, rows: 40 }, fakeCtx());

  assert.equal(pm.spawns, 0, 'a resize must not revive a session the user stopped');
  assert.equal(pm.status, 'stopped');

  ptyRegistry.remove(id);
});

test('the resize deferred-start guard also refuses when stoppedByUser is set', async () => {
  const id = 'deferred-stop-3';
  const pm = countingSpawnManager(id);
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());

  // Belt and braces: exercise the guard on its own, with the trigger still
  // armed, so it holds even if some future path leaves deferredStartDir set
  // after a user stop.
  pm.stoppedByUser = true;
  pm.deferredStartDir = '/tmp';

  const handler = Object.create(WebSocketHandler.prototype);
  await handler.handleMessage(fakeWs(), { type: 'resize', instanceId: id, cols: 92, rows: 40 }, fakeCtx());

  assert.equal(pm.spawns, 0, 'stoppedByUser must veto the deferred start');

  ptyRegistry.remove(id);
});

test('the deferred-start fallback timer also refuses when stoppedByUser is set', async () => {
  const id = 'deferred-stop-4';
  const pm = countingSpawnManager(id);
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());

  pm.stoppedByUser = true;
  pm.deferredStartDir = '/tmp';

  const handler = Object.create(WebSocketHandler.prototype);
  await handler.runDeferredStartFallback(fakeWs(), id, 80, 24, fakeCtx());

  assert.equal(pm.spawns, 0, 'the 3s fallback must not revive a session the user stopped');

  ptyRegistry.remove(id);
});

test('a normal deferred start still fires on resize when the user has not stopped it', async () => {
  const id = 'deferred-stop-5';
  const pm = countingSpawnManager(id);
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());

  pm.setDeferredStart('/tmp');

  const handler = Object.create(WebSocketHandler.prototype);
  await handler.handleMessage(fakeWs(), { type: 'resize', instanceId: id, cols: 92, rows: 40 }, fakeCtx());

  assert.equal(pm.spawns, 1, 'the ordinary deferred-start path must be unaffected');
  assert.deepEqual({ cols: pm.lastCols, rows: pm.lastRows }, { cols: 92, rows: 40 });

  pm.stop();
  ptyRegistry.remove(id);
});
