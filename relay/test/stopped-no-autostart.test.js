const { test } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');

test('stoppedByUser is false on a fresh manager', () => {
  const pm = new PtyManager('s1', 'claude');
  assert.equal(pm.stoppedByUser, false);
});

test('stop() marks the manager as stopped by the user', () => {
  const pm = new PtyManager('s2', 'claude');
  pm.stop();
  assert.equal(pm.stoppedByUser, true);
});

test('an explicit start clears stoppedByUser', async () => {
  const pm = new PtyManager('s3', 'claude');
  pm.stop();
  assert.equal(pm.stoppedByUser, true);

  pm._start = async function () {
    this.ptyProcess = { pid: 1, kill() {}, write() {}, resize() {} };
    this.status = 'running';
  };
  await pm.start('/tmp', 80, 24);
  assert.equal(pm.stoppedByUser, false);
});

test('a PTY that exits on its own is not marked stoppedByUser', async () => {
  // The exit path is an inline proc.onExit callback inside _start, so the only
  // way to run the PRODUCTION handler is to let the real _start wire it up:
  // stub the _spawnPty seam (no node-pty involved) and capture the callback
  // node-pty would have been handed. An earlier version of this test replaced
  // _start wholesale and invoked a locally defined callback instead, so the
  // real handler - the intentionalStop logging, the pty-crash broadcast and
  // the scheduleRestart() call - never ran, and the assertion below held for
  // any implementation of it.
  const pm = new PtyManager('s4', 'claude');
  pm._runSelfUpdate = () => Promise.resolve();

  let exitCb = null;
  pm._spawnPty = () => ({
    pid: 4242,
    kill() {},
    write() {},
    resize() {},
    onData() {},
    onExit(cb) { exitCb = cb; },
  });

  // scheduleRestart is stubbed only to keep its real 1s setTimeout (and the
  // retry spawn behind it) out of the test run. That it is CALLED is the
  // assertion - dropping that call is exactly how auto-restart would break.
  let restartScheduled = false;
  pm.scheduleRestart = () => { restartScheduled = true; };

  const crashes = [];
  pm.addListener((m) => { if (m.type === 'pty-crash') crashes.push(m); });

  await pm.start('/tmp', 80, 24);
  assert.equal(pm.status, 'running');
  assert.ok(exitCb, 'the real _start must have wired an onExit handler');

  exitCb({ exitCode: 1, signal: null });      // the CLI died on its own

  assert.equal(pm.status, 'stopped');
  assert.equal(pm.ptyProcess, null);
  assert.equal(pm.stoppedByUser, false, 'a crash must still allow auto-restart');
  assert.equal(restartScheduled, true, 'an unintentional exit must schedule an auto-restart');
  assert.equal(crashes.length, 1, 'clients must be told the CLI crashed');
  assert.equal(crashes[0].exitCode, 1);
});

test('an intentional stop does not schedule an auto-restart', async () => {
  // The other half of the same production handler: stop() sets
  // intentionalStop, so the exit it causes must not be reported as a crash or
  // undone by a restart.
  const pm = new PtyManager('s5', 'claude');
  pm._runSelfUpdate = () => Promise.resolve();

  let exitCb = null;
  pm._spawnPty = () => ({
    pid: 4243,
    kill() {},
    write() {},
    resize() {},
    onData() {},
    onExit(cb) { exitCb = cb; },
  });

  let restartScheduled = false;
  pm.scheduleRestart = () => { restartScheduled = true; };

  const crashes = [];
  pm.addListener((m) => { if (m.type === 'pty-crash') crashes.push(m); });

  await pm.start('/tmp', 80, 24);
  pm.stop();                                  // user taps Stop
  exitCb({ exitCode: 0, signal: 'SIGHUP' });  // node-pty reports the exit

  assert.equal(restartScheduled, false, 'a user stop must not be undone by auto-restart');
  assert.equal(crashes.length, 0, 'an intentional stop is not a crash');
  assert.equal(pm.stoppedByUser, true);
});
