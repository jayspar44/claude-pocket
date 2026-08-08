const { test } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');
const ptyRegistry = require('../src/pty-registry');
const WebSocketHandler = require('../src/websocket-handler');

// A failed set-instance used to leave the connection maimed rather than merely
// refused: skipUntilReplay was raised and the existing PTY listener detached
// before anything that could throw, and only the trailing sendReplay undid
// either. handshakeFailed does not rescue it, because a client already in
// CONNECTED ignores that flag - and the Start button deliberately re-sends
// set-instance over an already-CONNECTED socket. The tab kept reading
// "Connected", input still reached the CLI, and no output ever rendered again.

function runningManager(id) {
  const pm = new PtyManager(id, 'claude');
  pm._runSelfUpdate = () => Promise.resolve();
  pm._spawnPty = () => ({ pid: 1, kill() {}, write() {}, resize() {}, onData() {}, onExit() {} });
  pm.scheduleSave = () => {};
  return pm;
}

function recordingWs() {
  const sent = [];
  return { OPEN: 1, readyState: 1, clientId: 'recovery-client', sent,
           send(raw) { sent.push(JSON.parse(raw)); } };
}

function register(id, pm) {
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());
}

function unregister(id) {
  ptyRegistry.instances.delete(id);
  ptyRegistry.lastAccessTime.delete(id);
}

// Binds a client to a running instance the way a real handshake does.
async function boundClient(handler, ws, id) {
  const ctx = handler.createClientContext(ws);
  await handler.handleMessage(
    ws,
    { type: 'set-instance', instanceId: id, workingDir: '/tmp', cliType: 'claude', cols: 80, rows: 24 },
    ctx
  );
  return ctx;
}

test('a refused instance switch leaves the client still receiving output', async () => {
  const idA = 'recovery-A';
  const pmA = runningManager(idA);
  register(idA, pmA);
  await pmA.start('/tmp', 80, 24);

  const realGet = ptyRegistry.get;
  try {
    const handler = Object.create(WebSocketHandler.prototype);
    const ws = recordingWs();
    const ctx = await boundClient(handler, ws, idA);
    assert.equal(pmA.listeners.size, 1, 'precondition: the client is listening to A');

    // The registry refusing a new instance - the cap is reached and nothing is
    // evictable - is the throw this path actually meets in production.
    ptyRegistry.get = (id) => {
      if (id === 'recovery-B') throw new Error('Maximum instances (10) reached');
      return realGet.call(ptyRegistry, id);
    };

    ws.sent.length = 0;
    await handler.handleMessage(
      ws,
      { type: 'set-instance', instanceId: 'recovery-B', workingDir: '/tmp', cliType: 'claude', cols: 80, rows: 24 },
      ctx
    );

    assert.equal(pmA.listeners.size, 1, 'a refused switch must not detach the listener it already had');
    assert.equal(ctx.skipUntilReplay(), false, 'output must not stay suppressed after a refusal');

    pmA.broadcast({ type: 'output', data: 'STILL_ALIVE' });
    const got = ws.sent.filter((f) => f.type === 'output').map((f) => f.data).join('');
    assert.match(got, /STILL_ALIVE/, 'the client must still receive output from the instance it kept');
  } finally {
    ptyRegistry.get = realGet;
    unregister(idA);
    pmA.stop();
  }
});

test('a refused set-instance does not rebind the socket to an instance it holds no listener for', async () => {
  const idA = 'recovery-C';
  const pmA = runningManager(idA);
  register(idA, pmA);
  await pmA.start('/tmp', 80, 24);

  const realGet = ptyRegistry.get;
  try {
    const handler = Object.create(WebSocketHandler.prototype);
    const ws = recordingWs();
    const ctx = await boundClient(handler, ws, idA);

    ptyRegistry.get = (id) => {
      if (id === 'recovery-D') throw new Error('Maximum instances (10) reached');
      return realGet.call(ptyRegistry, id);
    };

    await handler.handleMessage(
      ws,
      { type: 'set-instance', instanceId: 'recovery-D', workingDir: '/tmp', cliType: 'claude', cols: 80, rows: 24 },
      ctx
    );

    // handleMessage falls back to ws.instanceId for frames that carry none -
    // the app's bare 'replay' and 'geometry' both do - so a stale id here would
    // resolve, and create, the wrong manager later.
    assert.equal(ws.instanceId, idA, 'the socket must still point at the instance it is listening to');
  } finally {
    ptyRegistry.get = realGet;
    unregister(idA);
    pmA.stop();
  }
});

test('a resize that throws mid-handshake does not suppress output forever', async () => {
  const id = 'recovery-E';
  const pm = runningManager(id);
  register(id, pm);
  await pm.start('/tmp', 80, 24);
  // node-pty throws out of resize when the child is already dying.
  pm.resize = () => { throw new Error('ioctl(TIOCSWINSZ) failed'); };

  try {
    const handler = Object.create(WebSocketHandler.prototype);
    const ws = recordingWs();
    const ctx = handler.createClientContext(ws);

    await handler.handleMessage(
      ws,
      { type: 'set-instance', instanceId: id, workingDir: '/tmp', cliType: 'claude', cols: 80, rows: 24 },
      ctx
    );

    const err = ws.sent.find((f) => f.type === 'pty-error');
    assert.ok(err && err.handshakeFailed, 'the failure must still be answered with a handshake-failed error');
    assert.equal(ctx.skipUntilReplay(), false, 'the skip flag must be released even when the handshake throws');

    pm.broadcast({ type: 'output', data: 'AFTER_THROW' });
    const got = ws.sent.filter((f) => f.type === 'output').map((f) => f.data).join('');
    assert.match(got, /AFTER_THROW/, 'a live terminal beats a frozen one');
  } finally {
    unregister(id);
    pm.stop();
  }
});
