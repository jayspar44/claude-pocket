const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

// POST /api/pty/stop is only reachable over HTTP - the express app is not
// exported and importing src/index.js would start listening - so this drives a
// real relay process. It is the only way to prove the ROUTE records the user's
// intent in the registry; a unit test on recordUserStop() alone would still
// pass with the route left unfixed.
//
// The scenario is the one from the review, compressed with MAX_INSTANCES=2 so
// no 30-minute idle timer is involved:
//   1. instance A is created and the user stops it
//   2. the app is closed (no ws clients, so A has no listeners)
//   3. housekeeping evicts A - here via the instance cap rather than the idle
//      sweep, which is the same non-user-initiated remove()
//   4. the user comes back: get() builds a brand-new manager for A, which must
//      still report stoppedByUser, or set-instance restarts the session the
//      user deliberately ended.
// No PTY is ever started, so no CLI binary is needed.

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

test('POST /api/pty/stop survives eviction of the instance it stopped', async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const relay = await startRelay(port);

  try {
    const status = (id) => fetch(`${base}/api/pty/status?instanceId=${id}`).then((r) => r.json());

    // 1. The instance exists and has not been stopped by anyone.
    const before = await status('route-a');
    assert.equal(before.stoppedByUser, false);

    // 2. The user taps Stop.
    const stopped = await fetch(`${base}/api/pty/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId: 'route-a' }),
    }).then((r) => r.json());
    assert.equal(stopped.success, true);
    assert.equal(stopped.status.stoppedByUser, true, 'the live manager records the stop');

    // 3. Housekeeping evicts route-a: creating two more instances trips the
    //    MAX_INSTANCES=2 cap, and route-a is the least recently used stopped
    //    instance with no listeners. This is remove() WITHOUT userInitiated -
    //    the same call cleanupIdleInstances() makes after 30 idle minutes.
    await status('route-b');
    await status('route-c');

    // 4. The user comes back to route-a. get() builds a fresh manager, which
    //    must still decline to auto-start.
    const after = await status('route-a');
    assert.equal(
      after.stoppedByUser,
      true,
      'a fresh manager for a stopped id must still decline to auto-start'
    );
  } finally {
    relay.kill('SIGKILL');
  }
});
