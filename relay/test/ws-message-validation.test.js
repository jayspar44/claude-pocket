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

// Same surface, but keeps the frames handleMessage sends back so the branch
// that ran can be identified from what the client would actually receive.
function recordingWs() {
  const sent = [];
  return {
    OPEN: 1,
    readyState: 1,
    clientId: 'c2',
    sent,
    send(raw) { sent.push(JSON.parse(raw)); },
  };
}

function fakeCtx(ptyManager) {
  return {
    setupPtyListener: () => ptyManager,
    sendReplay: () => {},
    skipUntilReplay: () => false,
    setSkipReplay: () => {},
  };
}

// Same, but sendReplay emits the pty-status the production one ends with.
// That trailing status is the entire reason set-instance's ordering matters:
// the client clears ptyError on any pty-status.
function replayingCtx(ptyManager, ws) {
  return {
    ...fakeCtx(ptyManager),
    sendReplay: () => {
      ws.send(JSON.stringify({ type: 'pty-status', ...ptyManager.getStatus() }));
    },
  };
}

test('set-instance during the start window records client dimensions instead of dropping them', async () => {
  const pm = new PtyManager('t7', 'claude');
  // Only the CLI self-update and the actual pty.spawn call are stubbed, so
  // the real _start body - including its dimension computation - runs.
  let release;
  const gate = new Promise((r) => { release = r; });
  pm._runSelfUpdate = () => gate;                // stands in for `codex update`
  pm._spawnPty = function (command, args, options) {
    this.spawnedAt = { cols: options.cols, rows: options.rows };
    return { pid: 1, kill() {}, write() {}, resize() {}, onData() {}, onExit() {} };
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

// Finding 8: the same branch, for a frame that carries NO dimensions - a
// non-app client, an older build, or a client whose terminal-dims key is
// absent. clientCols/clientRows fall back to config.pty.cols (50x24), so
// assigning those onto lastCols downgrades a correct in-flight 120x40 spawn.
test('a dimension-less set-instance must not downgrade an in-flight spawn', async () => {
  const pm = new PtyManager('t13', 'claude');
  let release;
  const gate = new Promise((r) => { release = r; });
  pm._runSelfUpdate = () => gate;
  pm._spawnPty = function (command, args, options) {
    this.spawnedAt = { cols: options.cols, rows: options.rows };
    return { pid: 1, kill() {}, write() {}, resize() {}, onData() {}, onExit() {} };
  };

  // A start is in flight with the client's real tablet geometry.
  const started = pm.start('/tmp', 120, 40);
  assert.equal(pm.status, 'starting');

  const handler = Object.create(WebSocketHandler.prototype);
  await handler.handleMessage(fakeWs(), {
    type: 'set-instance',
    instanceId: 't13',
    // no cols/rows at all
  }, fakeCtx(pm));

  assert.deepEqual(
    { cols: pm.lastCols, rows: pm.lastRows },
    { cols: 120, rows: 40 },
    'a frame with no dimensions must leave known-good geometry alone'
  );

  release();
  await started;
  assert.deepEqual(pm.spawnedAt, { cols: 120, rows: 40 }, 'the CLI must not spawn believing it has 50 columns');
});

// Finding 6: the stoppedByUser branch used to sit ahead of the
// no-working-directory branch, so an instance that is both stopped and
// misconfigured got a bare pty-status - an idle terminal with no explanation
// and a Start button the app disables because workingDir is empty.
test('a stopped instance with no working directory still gets the actionable error', async () => {
  const pm = new PtyManager('t14', 'claude');
  pm.stoppedByUser = true;               // user stopped it earlier
  assert.equal(pm.currentWorkingDir, null); // and it has no project folder

  const handler = Object.create(WebSocketHandler.prototype);
  const ws = recordingWs();

  await handler.handleMessage(ws, {
    type: 'set-instance',
    instanceId: 't14',
    // no workingDir
  }, fakeCtx(pm));

  const error = ws.sent.find((m) => m.type === 'pty-error');
  assert.ok(error, 'the client must be told what to fix, not left with a bare pty-status');
  assert.match(error.message, /No working directory configured/);
});

// Finding 4: the error was sent from inside the branch, and set-instance ends
// by calling sendReplay - which sends a pty-status. The client clears ptyError
// on any pty-status, so the explanation was wiped microseconds after it
// arrived, leaving an idle terminal with no hint and a disabled Start button.
test('the no-working-directory error is sent after the replay status, not before', async () => {
  const pm = new PtyManager('t16', 'claude');
  assert.equal(pm.currentWorkingDir, null);

  const handler = Object.create(WebSocketHandler.prototype);
  const ws = recordingWs();

  await handler.handleMessage(
    ws,
    { type: 'set-instance', instanceId: 't16' },  // no workingDir
    replayingCtx(pm, ws)
  );

  const types = ws.sent.map((m) => m.type);
  const errorAt = types.indexOf('pty-error');
  const lastStatusAt = types.lastIndexOf('pty-status');

  assert.ok(errorAt >= 0, 'the client must still be told what to fix');
  assert.ok(lastStatusAt >= 0, 'the replay status is what makes the ordering matter');
  assert.ok(
    errorAt > lastStatusAt,
    `a pty-status after the error clears it on the client (sent: ${types.join(', ')})`
  );
});

test('a stopped instance that IS configured still gets the quiet pty-status', async () => {
  // The reorder must not turn an ordinary user-stopped session into an error.
  const pm = new PtyManager('t15', 'claude');
  pm.currentWorkingDir = '/tmp';
  pm.stoppedByUser = true;

  const handler = Object.create(WebSocketHandler.prototype);
  const ws = recordingWs();

  await handler.handleMessage(ws, { type: 'set-instance', instanceId: 't15' }, fakeCtx(pm));

  assert.equal(ws.sent.some((m) => m.type === 'pty-error'), false, 'a configured stopped session is not an error');
  assert.ok(ws.sent.some((m) => m.type === 'pty-status'), 'it still reports status');
});
