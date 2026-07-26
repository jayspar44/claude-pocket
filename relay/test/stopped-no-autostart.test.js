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

test('a PTY that exits on its own is not marked stoppedByUser', () => {
  // The exit path is an inline proc.onExit callback, not a named method, so
  // drive it the way node-pty would: capture the callback at spawn and invoke it.
  const pm = new PtyManager('s4', 'claude');
  let exitCb = null;
  pm._start = async function () {
    const proc = {
      pid: 1,
      kill() {},
      write() {},
      resize() {},
      onData() {},
      onExit(cb) { exitCb = cb; },
    };
    this.ptyProcess = proc;
    this.status = 'running';
    proc.onExit(({ exitCode, signal }) => {
      this.status = 'stopped';
      this.ptyProcess = null;
      void exitCode; void signal;
    });
  };

  return pm.start('/tmp', 80, 24).then(() => {
    assert.equal(pm.status, 'running');
    exitCb({ exitCode: 1, signal: null });      // the CLI died on its own
    assert.equal(pm.status, 'stopped');
    assert.equal(pm.stoppedByUser, false, 'a crash must still allow auto-restart');
  });
});
