const { test } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');

// These tests run the REAL _start() body. Only the two injection seams
// _runSelfUpdate (stands in for `<cli> update`) and _spawnPty (stands in for
// node-pty's pty.spawn) are overridden, so no real CLI binary is ever
// invoked and no real PTY is ever spawned - but every other line of _start
// (the starting-status window, the intentionalStop check, the dimension
// computation, the buffer load, the spawn call itself) executes for real.

// Gates the self-update await exactly like the real execFile callback would,
// without ever touching child_process.
function stubSelfUpdate(pm, gate) {
  pm._runSelfUpdate = () => gate;
}

// Fake node-pty process: just enough surface for the onData/onExit wiring
// that runs immediately after a successful spawn.
function fakePtyProcess(pid = 1) {
  return {
    pid,
    kill() {},
    write() {},
    resize() {},
    onData() {},
    onExit() {},
  };
}

// Counts real spawn attempts and hands back a fake process, so assertions
// can tell "the real _start reached pty.spawn" from "it aborted before that".
function stubSpawn(pm) {
  pm.spawns = 0;
  pm._spawnPty = function (command, args, options) {
    this.spawns++;
    this.spawnedAt = { cols: options.cols, rows: options.rows };
    return fakePtyProcess();
  };
}

test('status starts as stopped and isBusy is false', () => {
  const pm = new PtyManager('t1', 'claude');
  assert.equal(pm.status, 'stopped');
  assert.equal(pm.isBusy, false);
  assert.equal(pm.isRunning, false);
});

test('status is starting during the self-update window', async () => {
  const pm = new PtyManager('t2', 'claude');
  let release;
  stubSelfUpdate(pm, new Promise((r) => { release = r; }));
  stubSpawn(pm);

  const started = pm.start('/tmp', 80, 24);
  assert.equal(pm.status, 'starting');
  assert.equal(pm.isBusy, true);
  assert.equal(pm.isRunning, false, 'isRunning must be false until spawned');

  release();
  await started;
  assert.equal(pm.status, 'running');
  assert.equal(pm.isRunning, true);
});

test('a second start during the window throws instead of spawning twice', async () => {
  const pm = new PtyManager('t3', 'claude');
  let release;
  stubSelfUpdate(pm, new Promise((r) => { release = r; }));
  stubSpawn(pm);

  const first = pm.start('/tmp', 80, 24);
  await assert.rejects(
    () => pm.start('/tmp', 80, 24),
    /already in progress/
  );

  release();
  await first;
  assert.equal(pm.spawns, 1, 'exactly one CLI must be spawned');
});

test('stop() during the window prevents the spawn', async () => {
  const pm = new PtyManager('t4', 'claude');
  let release;
  stubSelfUpdate(pm, new Promise((r) => { release = r; }));
  stubSpawn(pm);

  const started = pm.start('/tmp', 80, 24);
  assert.equal(pm.status, 'starting');

  pm.stop();
  assert.equal(pm.intentionalStop, true, 'stop must record intent even with no ptyProcess');
  assert.equal(pm.status, 'stopped');

  release();
  await started;
  assert.equal(pm.spawns, 0, 'no CLI may be spawned after stop');
});

test('start() is a no-op when already running', async () => {
  const pm = new PtyManager('t5', 'claude');
  stubSelfUpdate(pm, Promise.resolve());
  stubSpawn(pm);
  await pm.start('/tmp', 80, 24);
  assert.equal(pm.spawns, 1);
  await pm.start('/tmp', 80, 24);
  assert.equal(pm.spawns, 1, 'second start must not spawn again');
});

test('a resize during the start window sets the spawn dimensions', async () => {
  const pm = new PtyManager('t6', 'claude');
  let release;
  stubSelfUpdate(pm, new Promise((r) => { release = r; }));
  stubSpawn(pm);

  const started = pm.start('/tmp', 50, 24);   // fallback dims
  assert.equal(pm.status, 'starting');
  pm.lastCols = 92;                            // what the resize handler records
  pm.lastRows = 40;

  release();
  await started;
  assert.deepEqual(pm.spawnedAt, { cols: 92, rows: 40 });
});

// Finding 7: lastCols/lastRows survive stop(), so on a session that died
// without user intent (three crashes exhaust MAX_RESTART_ATTEMPTS) they hold
// the PREVIOUS session's geometry. The dimensions the caller passes are the
// current ones - the deferred start fires from a live resize frame - so they
// must replace the stale record, not lose to it.
test('the caller dimensions beat a stale lastCols from a dead session', async () => {
  const pm = new PtyManager('t9', 'claude');
  stubSelfUpdate(pm, Promise.resolve());
  stubSpawn(pm);

  // Landscape session ran at 100x40 and then died on its own.
  pm.lastCols = 100;
  pm.lastRows = 40;

  // User reopens in portrait; the resize handler starts the deferred PTY with
  // the dimensions xterm.js just reported.
  await pm.start('/tmp', 60, 90);

  assert.deepEqual(pm.spawnedAt, { cols: 60, rows: 90 }, 'the CLI must spawn at the current geometry');
  assert.deepEqual({ cols: pm.lastCols, rows: pm.lastRows }, { cols: 60, rows: 90 });
});

test('a caller that passes no dimensions keeps the known-good lastCols', async () => {
  // POST /api/pty/start and POST /api/pty/restart pass none at all: nothing
  // current is on offer, so the client's last reported geometry must stand
  // rather than dropping to the 50x24 config fallback.
  const pm = new PtyManager('t10', 'claude');
  stubSelfUpdate(pm, Promise.resolve());
  stubSpawn(pm);

  pm.lastCols = 120;
  pm.lastRows = 40;

  await pm.start('/tmp');

  assert.deepEqual(pm.spawnedAt, { cols: 120, rows: 40 }, 'a dimension-less start must not downgrade to the fallback');
});

// Finding 7 (second half): resize() only recorded lastCols/lastRows when a
// ptyProcess existed, so a stopped session could not learn its new geometry -
// which is what left the stale record above in place across a rotation.
test('resize() records dimensions even with no process running', () => {
  const pm = new PtyManager('t11', 'claude');
  assert.equal(pm.status, 'stopped');
  assert.equal(pm.ptyProcess, null);

  pm.resize(64, 88);

  assert.deepEqual({ cols: pm.lastCols, rows: pm.lastRows }, { cols: 64, rows: 88 });
});

// Finding 9: the wrapper's catch sets status='stopped' unconditionally, but
// _start assigns this.ptyProcess (and wires onData/onExit) before the rest of
// its try block runs. A throw after that assignment leaves a LIVE CLI child
// behind a 'stopped' status; guarding on status alone would let the next
// start() spawn a second CLI over the top of it, orphaning the first beyond
// the reach of stop().
test('a live ptyProcess blocks a start even when status says stopped', async () => {
  const pm = new PtyManager('t12', 'claude');
  stubSelfUpdate(pm, Promise.resolve());
  stubSpawn(pm);

  // Exactly the state _start leaves behind when it throws after the
  // this.ptyProcess assignment: a real child process, status reset to stopped.
  pm.ptyProcess = fakePtyProcess(4242);
  pm.status = 'stopped';

  await pm.start('/tmp', 80, 24);

  assert.equal(pm.spawns, 0, 'a second CLI must not be spawned over a live process');
  assert.equal(pm.ptyProcess.pid, 4242, 'the live process must still be the one the manager tracks');
});

test('a throwing spawn leaves status stopped and broadcasts pty-error', async () => {
  const pm = new PtyManager('t8', 'claude');
  stubSelfUpdate(pm, Promise.resolve());
  pm._spawnPty = () => { throw new Error('posix_spawnp failed.'); };

  const messages = [];
  pm.addListener((m) => messages.push(m));

  await assert.rejects(() => pm.start('/tmp', 80, 24), /posix_spawnp failed/);
  assert.equal(pm.status, 'stopped', 'status must not be stuck at starting');

  const errorMsg = messages.find((m) => m.type === 'pty-error');
  assert.ok(errorMsg, 'a pty-error frame must be broadcast');
  assert.equal(errorMsg.message, 'posix_spawnp failed.');
});
