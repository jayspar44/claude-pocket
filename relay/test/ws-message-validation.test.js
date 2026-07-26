const { test } = require('node:test');
const assert = require('node:assert/strict');
const WebSocketHandler = require('../src/websocket-handler');
const PtyManager = require('../src/pty-manager');

test('parseClientFrame accepts a plain object', () => {
  assert.deepEqual(
    WebSocketHandler.parseClientFrame('{"type":"ping"}'),
    { ok: true, message: { type: 'ping' } }
  );
});

test('parseClientFrame rejects null, which JSON.parse accepts', () => {
  assert.deepEqual(
    WebSocketHandler.parseClientFrame('null'),
    { ok: false, reason: 'not-an-object' }
  );
});

test('parseClientFrame rejects numbers, strings and arrays', () => {
  for (const raw of ['42', '"str"', '[1,2]', 'true']) {
    const result = WebSocketHandler.parseClientFrame(raw);
    assert.deepEqual(result, { ok: false, reason: 'not-an-object' }, `raw=${raw}`);
  }
});

test('parseClientFrame rejects malformed JSON', () => {
  assert.deepEqual(
    WebSocketHandler.parseClientFrame('{bad json'),
    { ok: false, reason: 'invalid-json' }
  );
});

// Fakes just enough of the ws/ctx surface for handleMessage's 'set-instance'
// case: no real WebSocketServer or PTY registry lookup is reached on this
// path, since the manager is already busy and the message carries no
// workingDir, so none of the deferred-start branches fire.
function fakeWs() {
  return { OPEN: 1, readyState: 1, send() {}, clientId: 'c1' };
}

function fakeCtx(ptyManager) {
  return {
    setupPtyListener: () => ptyManager,
    sendReplay: () => {},
    skipUntilReplay: () => false,
    setSkipReplay: () => {},
  };
}

test('set-instance during the start window records client dimensions instead of dropping them', async () => {
  const pm = new PtyManager('t7', 'claude');
  let release;
  const gate = new Promise((r) => { release = r; });
  pm._start = async function (workingDir, cols, rows) {
    this.deferredStartDir = null;
    this.currentWorkingDir = workingDir;
    await gate;                                  // stands in for `codex update`
    if (this.intentionalStop) return;
    this.spawnedAt = { cols: this.lastCols || cols, rows: this.lastRows || rows };
    this.ptyProcess = { pid: 1, kill() {}, write() {}, resize() {} };
    this.status = 'running';
  };

  // A start is already in flight, given the 50x24 fallback dimensions - the
  // same shape as the deferred-start 3s fallback timer starting the PTY
  // before this client's set-instance arrives.
  const started = pm.start('/tmp', 50, 24);
  assert.equal(pm.status, 'starting');

  const handler = Object.create(WebSocketHandler.prototype);

  // Reconnecting client: instanceId is known and workingDir is omitted, so
  // set-instance's own branches for arming/erroring a deferred start don't
  // fire (isBusy is already true) - only the final resize-or-record check at
  // the bottom of the 'set-instance' case runs.
  await handler.handleMessage(fakeWs(), {
    type: 'set-instance',
    instanceId: 't7',
    cols: 92,
    rows: 40,
  }, fakeCtx(pm));

  assert.equal(pm.lastCols, 92, 'set-instance dimensions must be recorded, not dropped');
  assert.equal(pm.lastRows, 40);

  release();
  await started;
  assert.deepEqual(pm.spawnedAt, { cols: 92, rows: 40 });
});
