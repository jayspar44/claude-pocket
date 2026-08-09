const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

// CORS is deliberately open, and this test exists to keep it that way.
//
// An earlier revision made ALLOWED_ORIGINS an enforced allowlist. That broke
// the app within the hour: PM2 snapshots the deploying shell's env and replays
// it on every restart, and all four processes on the host were still carrying
// ALLOWED_ORIGINS=http://localhost:4500,capacitor://localhost from an old
// .env.example. The APK's real origin is https://localhost (capacitor.config
// .json sets androidScheme "https"), and the tailnet web app is on the
// Tailscale hostname - neither was listed, so every REST call from the phone
// was refused while the WebSocket terminal kept working and the relay logged a
// clean 200 for each one. Silent by construction.
//
// This is one person, one phone, and one Mac mini on a private tailnet. An
// origin allowlist buys nothing here and costs a list that has to stay in sync
// across two deploy folders, four PM2 processes and every future device, where
// a mismatch is invisible. So: reflect whatever origin asks.
//
// No Access-Control-Allow-Credentials. Nothing in the app sends a cookie or an
// Authorization header (axios, no withCredentials, no server-side session), so
// granting it would be pure decoration.

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

// The exact value every PM2 process on the deploy host is still carrying. If
// anyone reintroduces enforcement, this is the config that will be live, and
// these are the origins it would refuse.
const STALE_DEPLOYED_VALUE = 'http://localhost:4500,capacitor://localhost';

test('every origin is allowed, even under a stale restrictive ALLOWED_ORIGINS', async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const relay = await startRelay(port, STALE_DEPLOYED_VALUE);

  try {
    // The two origins the stale list omits - the ones whose absence took the
    // phone's whole REST surface down.
    for (const origin of ['https://localhost', 'http://minibox.rattlesnake-mimosa.ts.net:4502']) {
      const res = await fetch(`${base}/api/health`, { headers: { Origin: origin } });
      assert.equal(
        res.headers.get('access-control-allow-origin'),
        origin,
        `${origin} must be reflected - ALLOWED_ORIGINS must not gate anything`
      );
    }

    // Preflight too: axios sends Content-Type: application/json, so every
    // POST /api/instances and DELETE /api/instances/:id is preflighted. A GET
    // passing proves nothing about those.
    const pre = await fetch(`${base}/api/instances`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://localhost',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.equal(pre.status, 204, 'preflight must be answered');
    assert.equal(
      pre.headers.get('access-control-allow-origin'),
      'https://localhost',
      'preflight must reflect the origin, or every POST and DELETE from the app fails'
    );
    assert.match(
      pre.headers.get('access-control-allow-headers') || '',
      /content-type/i,
      'preflight must allow the Content-Type axios sends'
    );
  } finally {
    relay.kill('SIGKILL');
  }
});

test('a wildcard-shaped value is not turned into a one-entry allowlist', async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // '* ' with a stray space, and ',' - the degenerate values that an enforcing
  // parser turns into "allow nothing" rather than "allow everything".
  const relay = await startRelay(port, '* ');

  try {
    const res = await fetch(`${base}/api/health`, { headers: { Origin: 'https://localhost' } });
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      'https://localhost',
      'no value of ALLOWED_ORIGINS may make the relay refuse an origin'
    );
    assert.equal(
      res.headers.get('access-control-allow-credentials'),
      null,
      'credentials are never granted - nothing in the app sends any'
    );
  } finally {
    relay.kill('SIGKILL');
  }
});
