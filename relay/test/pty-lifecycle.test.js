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
