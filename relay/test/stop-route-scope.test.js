const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

// POST /api/pty/stop is only reachable over HTTP - the express app is not
// exported and importing src/index.js would start listening - so this drives a
// real relay process. No PTY is ever started, so no CLI binary is needed.
//
// This pins the SCOPE of a stop, which is deliberately bounded: "the user
// stopped this" lives on the PtyManager object and nowhere else, so it lasts
// exactly as long as that manager does. Both halves are asserted here, because
// the second one is a tradeoff someone will otherwise mistake for a bug:
//
//   1. while the manager is alive, the stop holds - a later status read still
//      reports stoppedByUser, so set-instance declines to auto-start.
//   2. once housekeeping evicts the manager (here via the MAX_INSTANCES=2 cap,
//      the same remove() the 30-minute idle sweep makes), the stop is gone and
//      the id is free to auto-start again.
//
// An earlier revision tried to make (2) untrue with a registry-level map of
// stopped ids. It was rewritten four times and each bound on it broke
// something else, so it was removed; the app compensates by not reconnecting a
// tab whose manager it just deleted.

const RELAY_DIR = path.join(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startRelay(port) {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: RELAY_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      MAX_INSTANCES: '2',
      NODE_ENV: 'production', // plain JSON logs, no pino-pretty worker
      LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  const deadline = Date.now() + 10000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`relay exited early (code ${child.exitCode}):\n${output}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return child;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`relay never became healthy:\n${output}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('a stop holds while its manager lives, and is forgotten when it is evicted', async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const relay = await startRelay(port);

  try {
    const status = (id) => fetch(`${base}/api/pty/status?instanceId=${id}`).then((r) => r.json());

    // The instance exists and has not been stopped by anyone.
    const before = await status('route-a');
    assert.equal(before.stoppedByUser, false);

    // The user taps Stop. The route does not remove the instance, so the
    // manager - and the flag on it - survives.
    const stopped = await fetch(`${base}/api/pty/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId: 'route-a' }),
    }).then((r) => r.json());
    assert.equal(stopped.success, true);
    assert.equal(stopped.status.stoppedByUser, true, 'the live manager records the stop');

    // Re-reading it does not clear it: this is what makes a reconnect's
    // set-instance decline to auto-start.
    const stillStopped = await status('route-a');
    assert.equal(stillStopped.stoppedByUser, true, 'the stop holds while the manager lives');

    // Housekeeping evicts route-a: creating two more instances trips the
    // MAX_INSTANCES=2 cap, and route-a is the least recently used stopped
    // instance with no listeners - the same remove() cleanupIdleInstances()
    // makes after 30 idle minutes.
    await status('route-b');
    await status('route-c');

    // The manager is gone, so the stop is gone with it. This is the accepted
    // bound, not an oversight: the app does not reconnect a tab whose manager
    // it deleted, so nothing re-sends set-instance to exploit it.
    const afterEviction = await status('route-a');
    assert.equal(
      afterEviction.stoppedByUser,
      false,
      'evicting the manager forgets the stop - the bound this test exists to pin'
    );
  } finally {
    relay.kill('SIGKILL');
  }
});
