const { test } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');
const ptyRegistry = require('../src/pty-registry');
const WebSocketHandler = require('../src/websocket-handler');

// pty.spawn() throwing (missing/misconfigured CLI binary - a realistic
// production scenario, not a sandbox artifact) is a synchronous throw inside
// an async _start(), so it becomes a rejected promise. Both
// PtyManager.attemptAutoRestart() (crash auto-restart) and
// WebSocketHandler.runDeferredStartFallback() (the set-instance deferred-start
// fallback) call start() from a bare setTimeout with nothing to await the
// result - an uncaught rejection there is unhandled and, under Node's default
// --unhandled-rejections=throw, kills the entire relay process, taking every
// other instance's session down with it. These tests inject the failure
// directly (no real timer, no real pty.spawn) and assert it stays contained.

function stubFailingStart(pm, message) {
  pm._start = async function () {
    throw new Error(message);
  };
}

test('PtyManager.start() leaves status stopped and broadcasts pty-error on a spawn failure', async () => {
  const pm = new PtyManager('spawn-fail-1', 'claude');
  stubFailingStart(pm, 'posix_spawnp failed.');

  const messages = [];
  pm.addListener((m) => messages.push(m));

  await assert.rejects(() => pm.start('/tmp', 80, 24), /posix_spawnp failed/);
  assert.equal(pm.status, 'stopped', 'status must not be stuck at starting');

  const errorMsg = messages.find((m) => m.type === 'pty-error');
  assert.ok(errorMsg, 'a pty-error frame must be broadcast');
  assert.equal(errorMsg.message, 'posix_spawnp failed.');
});

test('attemptAutoRestart() survives a spawn failure without an unhandled rejection', async () => {
  const pm = new PtyManager('spawn-fail-2', 'claude');
  pm.currentWorkingDir = '/tmp';
  stubFailingStart(pm, 'spawn claude ENOENT');

  let unhandled = null;
  const onUnhandled = (err) => { unhandled = err; };
  process.on('unhandledRejection', onUnhandled);

  // No try/catch here on purpose: attemptAutoRestart() must not reject at
  // all - that is exactly what the fix guarantees for the real setTimeout
  // caller, which has no catch of its own.
  await pm.attemptAutoRestart();

  // Rejections surface on a later microtask/macrotask turn, not synchronously
  // - give the event loop a chance to flag one before asserting none did.
  await new Promise((r) => setImmediate(r));

  process.off('unhandledRejection', onUnhandled);

  assert.equal(unhandled, null, 'the spawn failure must not become an unhandled rejection');
  assert.equal(pm.status, 'stopped', 'status must recover to stopped so a later retry is possible');
});

test('attemptAutoRestart() is a no-op when a process is already running or a stop was requested', async () => {
  const pm = new PtyManager('spawn-fail-3', 'claude');
  pm.ptyProcess = { pid: 1, kill() {}, write() {}, resize() {} };
  stubFailingStart(pm, 'should not be called');

  await pm.attemptAutoRestart(); // ptyProcess is set -> guarded branch skips start()
  assert.equal(pm.status, 'stopped', 'unchanged - attemptAutoRestart never called start()');
});

// --- websocket-handler.js's deferred-start fallback ---

function fakeWs() {
  return { OPEN: 1, readyState: 1, send() {}, clientId: 'fake-client' };
}

function fakeCtx() {
  return { sendReplay: () => {} };
}

test('runDeferredStartFallback() survives a spawn failure without an unhandled rejection', async () => {
  const id = 'spawn-fail-ws-1';
  const pm = ptyRegistry.get(id, '/tmp', 'claude');
  stubFailingStart(pm, 'posix_spawnp failed.');
  pm.setDeferredStart('/tmp'); // mirrors the state set-instance leaves before the 3s timer fires

  let unhandled = null;
  const onUnhandled = (err) => { unhandled = err; };
  process.on('unhandledRejection', onUnhandled);

  const handler = Object.create(WebSocketHandler.prototype);
  const ws = fakeWs();

  // No try/catch here on purpose, same reasoning as attemptAutoRestart above.
  await handler.runDeferredStartFallback(ws, id, 80, 24, fakeCtx());

  await new Promise((r) => setImmediate(r));
  process.off('unhandledRejection', onUnhandled);

  assert.equal(unhandled, null, 'the spawn failure must not become an unhandled rejection');
  assert.equal(pm.status, 'stopped', 'status must recover to stopped so a later retry is possible');
  assert.equal(ws._deferredStartTimer, null, 'the timer handle must be cleared regardless of outcome');

  ptyRegistry.remove(id);
});

test('runDeferredStartFallback() does nothing if the manager is no longer idle+deferred', async () => {
  const id = 'spawn-fail-ws-2';
  const pm = ptyRegistry.get(id, '/tmp', 'claude');
  // No setDeferredStart() call: deferredStartDir stays null, so the guard
  // inside runDeferredStartFallback must skip calling start() entirely.
  stubFailingStart(pm, 'should not be called');

  const handler = Object.create(WebSocketHandler.prototype);
  await handler.runDeferredStartFallback(fakeWs(), id, 80, 24, fakeCtx());

  assert.equal(pm.status, 'stopped');
  ptyRegistry.remove(id);
});

// The same hazard one line earlier. runDeferredStartFallback() begins by
// resolving the manager, and ptyRegistry.get() throws when the instance cap is
// reached and no idle instance can be evicted - a state a busy relay reaches
// on its own, and one the 3s timer is especially likely to meet, because in
// the interval since set-instance other clients have had time to fill the
// registry. A throw from that call is just as unhandled as one from start():
// same bare setTimeout, same dead relay. It has to be inside the try.
test('runDeferredStartFallback() contains a throw from ptyRegistry.get(), not just from start()', async () => {
  const id = 'spawn-fail-ws-3';
  const original = ptyRegistry.get;
  ptyRegistry.get = () => { throw new Error('Maximum instances (10) reached'); };

  let unhandled = null;
  const onUnhandled = (err) => { unhandled = err; };
  process.on('unhandledRejection', onUnhandled);

  const ws = fakeWs();
  try {
    // No assert.rejects: the method must resolve, because the real caller is a
    // setTimeout with nothing to catch what it returns.
    await handler_runFallback(ws, id);
    await new Promise((r) => setImmediate(r));
  } finally {
    ptyRegistry.get = original;
    process.off('unhandledRejection', onUnhandled);
  }

  assert.equal(unhandled, null, 'a cap rejection must not escape the fallback');
  assert.equal(ws._deferredStartTimer, null, 'the timer handle must still be cleared');
});

function handler_runFallback(ws, id) {
  const handler = Object.create(WebSocketHandler.prototype);
  return handler.runDeferredStartFallback(ws, id, 80, 24, fakeCtx());
}
