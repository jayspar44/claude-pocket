const { test } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');

// Replaces the spawn half of _start with a controllable fake, so no real CLI
// runs. Resolves `gate` to let the "self-update" finish.
function stubSpawn(pm, gate) {
  pm.spawns = 0;
  pm._start = async function (workingDir) {
    this.deferredStartDir = null;
    this.currentWorkingDir = workingDir;
    await gate;                                  // stands in for `codex update`
    if (this.intentionalStop) return;            // must honour a stop during the await
    this.spawns++;
    this.ptyProcess = { pid: 123, kill() {}, write() {}, resize() {} };
    this.status = 'running';
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
  stubSpawn(pm, new Promise((r) => { release = r; }));

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
  stubSpawn(pm, new Promise((r) => { release = r; }));

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
  stubSpawn(pm, new Promise((r) => { release = r; }));

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
  stubSpawn(pm, Promise.resolve());
  await pm.start('/tmp', 80, 24);
  assert.equal(pm.spawns, 1);
  await pm.start('/tmp', 80, 24);
  assert.equal(pm.spawns, 1, 'second start must not spawn again');
});

test('a resize during the start window sets the spawn dimensions', async () => {
  const pm = new PtyManager('t6', 'claude');
  let release;
  const gate = new Promise((r) => { release = r; });
  pm.spawns = 0;
  pm._start = async function (workingDir, cols, rows) {
    this.deferredStartDir = null;
    await gate;
    if (this.intentionalStop) return;
    const spawnCols = this.lastCols || cols;
    const spawnRows = this.lastRows || rows;
    this.spawnedAt = { cols: spawnCols, rows: spawnRows };
    this.spawns++;
    this.ptyProcess = { pid: 1, kill() {}, write() {}, resize() {} };
    this.status = 'running';
  };

  const started = pm.start('/tmp', 50, 24);   // fallback dims
  assert.equal(pm.status, 'starting');
  pm.lastCols = 92;                            // what the resize handler records
  pm.lastRows = 40;

  release();
  await started;
  assert.deepEqual(pm.spawnedAt, { cols: 92, rows: 40 });
});
