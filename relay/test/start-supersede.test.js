const { test } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');

// start() -> stop() -> start() while the first attempt is still awaiting the
// CLI self-update (up to 30s of real time). stop() sets status='stopped' and
// the second start() resets intentionalStop, so when the first attempt
// resumes neither flag tells it to stand down: without a generation token it
// spawns a second CLI over the top of the first. The loser is orphaned -
// still wired to onData (writing into the same buffer), no longer referenced
// by this.ptyProcess, and therefore unkillable from the app.
//
// These tests run the REAL _start body; only the _runSelfUpdate and
// _spawnPty seams are stubbed, so the generation check itself executes.

function makeManager(id) {
  const pm = new PtyManager(id, 'claude');
  pm.spawned = [];
  pm._spawnPty = function () {
    const proc = {
      pid: this.spawned.length + 1,
      killed: false,
      kill() { this.killed = true; },
      write() {},
      resize() {},
      onData() {},
      onExit() {},
    };
    this.spawned.push(proc);
    return proc;
  };
  return pm;
}

// A self-update gate that can be released per call, so two overlapping
// _start bodies can be resumed independently and in a chosen order.
function gatedSelfUpdate(pm) {
  const releases = [];
  pm._runSelfUpdate = () => new Promise((resolve) => releases.push(resolve));
  return releases;
}

test('stop-then-start during the update window spawns exactly one CLI', async () => {
  const pm = makeManager('supersede-1');
  const releases = gatedSelfUpdate(pm);

  const first = pm.start('/tmp', 80, 24);
  assert.equal(pm.status, 'starting');

  pm.stop();                       // user taps Stop mid-update
  assert.equal(pm.status, 'stopped');

  const second = pm.start('/tmp', 80, 24);   // user taps Start again
  assert.equal(pm.status, 'starting');

  // Release the second attempt first, then the (stale) first one - the
  // ordering that lets the stale attempt clobber this.ptyProcess.
  releases[1]();
  await second;
  releases[0]();
  await first;

  assert.equal(pm.spawned.length, 1, 'exactly one CLI process may be spawned');
  assert.equal(pm.status, 'running');
  assert.equal(pm.ptyProcess, pm.spawned[0], 'the surviving process must be the one the manager tracks');
});

test('a later stop() kills the process that actually survived', async () => {
  const pm = makeManager('supersede-2');
  const releases = gatedSelfUpdate(pm);

  const first = pm.start('/tmp', 80, 24);
  pm.stop();
  const second = pm.start('/tmp', 80, 24);

  releases[1]();
  await second;
  releases[0]();
  await first;

  pm.stop();

  assert.deepEqual(
    pm.spawned.map((p) => p.killed),
    [true],
    'no orphan may outlive stop()'
  );
  assert.equal(pm.ptyProcess, null);
  assert.equal(pm.status, 'stopped');
});

test('a stale attempt does not clobber a running process it lost the race to', async () => {
  const pm = makeManager('supersede-3');
  const releases = gatedSelfUpdate(pm);

  const first = pm.start('/tmp', 80, 24);
  pm.stop();
  const second = pm.start('/tmp', 80, 24);

  releases[1]();
  await second;
  const survivor = pm.ptyProcess;
  assert.ok(survivor, 'the second attempt must have spawned');

  releases[0]();
  await first;

  assert.equal(pm.ptyProcess, survivor, 'the stale attempt must not replace this.ptyProcess');
  assert.equal(pm.status, 'running', 'the stale attempt must not disturb the running status');

  pm.stop();
});
