const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

// The relay has no authentication of its own - it is reachable by anything that
// can route to the host, and its REST surface spawns PTYs (/api/instances),
// kills them (/api/pty/stop) and reads the filesystem (/api/files/*). The only
// thing standing between a web page the operator happens to visit and that
// surface is CORS: a browser will not hand the response body to page JS unless
// the relay names that page's origin in Access-Control-Allow-Origin.
//
// ALLOWED_ORIGINS is the knob that is supposed to decide this. It shipped
// parsed into config.cors and then never read - index.js reflected whatever
// Origin arrived - so setting it restricted nothing. These tests drive a real
// relay process (the express app is not exported) and pin both halves of the
// contract, because getting either one wrong is silent: nothing logs, and the
// operator's own browser is same-origin and never notices.

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

async function startRelay(port, allowedOrigins) {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: RELAY_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      ALLOWED_ORIGINS: allowedOrigins,
      NODE_ENV: 'production',
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

test('an explicit ALLOWED_ORIGINS list refuses an origin that is not on it', async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const relay = await startRelay(port, 'http://localhost:4500,capacitor://localhost');

  try {
    // The origin the operator configured: named back, so the app keeps working.
    const allowed = await fetch(`${base}/api/health`, {
      headers: { Origin: 'http://localhost:4500' },
    });
    assert.equal(
      allowed.headers.get('access-control-allow-origin'),
      'http://localhost:4500',
      'a configured origin must still be allowed - this is the app itself'
    );

    // Any other page. Without an Access-Control-Allow-Origin naming it, the
    // browser discards the response and the page learns nothing.
    const denied = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(
      denied.headers.get('access-control-allow-origin'),
      null,
      'an unlisted origin must not be reflected - reflecting it hands /api/files/* to any page the operator visits'
    );
    assert.equal(
      denied.headers.get('access-control-allow-credentials'),
      null,
      'a refused origin gets no credentials grant either'
    );
  } finally {
    relay.kill('SIGKILL');
  }
});

test('the wildcard default allows any origin but never grants credentials', async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // '*' is what both relay/.env and relay/.env.production ship today, so this
  // is the behaviour every currently-deployed relay has.
  const relay = await startRelay(port, '*');

  try {
    const res = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    });

    // Wildcard stays permissive on purpose: tightening the default would break
    // every already-installed APK, which reaches the relay from a Capacitor
    // origin the operator never listed.
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      'https://evil.example',
      'a wildcard config still reflects, so deployed clients keep working'
    );

    // But credentials must not ride along with a wildcard. A reflected origin
    // plus Allow-Credentials is exactly the pairing browsers refuse to let you
    // spell as '*', and nothing in this project sends a cookie or an
    // Authorization header - so granting it buys nothing and costs the
    // same-site protection the browser would otherwise apply.
    assert.equal(
      res.headers.get('access-control-allow-credentials'),
      null,
      'wildcard reflection must not be paired with a credentials grant'
    );
  } finally {
    relay.kill('SIGKILL');
  }
});
