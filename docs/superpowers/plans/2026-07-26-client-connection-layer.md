# Client Connection Layer Implementation Plan (PR 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a leaked WebSocket structurally impossible on the client, fixing the duplicated terminal output of issue #8 at its source, and fix the behaviour bugs that the unowned lifecycle was hiding.

**Architecture:** One `InstanceConnection` object per instance owns exactly one WebSocket and every timer belonging to it. A `ConnectionManager` owns the map of connections and a single shared heartbeat tick. `InstanceContext` keeps instance metadata and React state mirroring and holds no socket state — its 8 parallel `instanceId`-keyed maps collapse to the manager's one map, and its 16 `wsRefs` mutation sites become method calls.

**Tech Stack:** React 19, Vite 7, Capacitor 8. Tests use **Vitest** (new — the app has no test runner today; `npm run test:app` currently fails because `app/` has no `test` script).

## Global Constraints

- Source spec: `docs/superpowers/specs/2026-07-26-instance-connection-lifecycle-design.md`.
- **The callback-stability rule.** Callbacks exposed by `InstanceContext` must **not** depend on connection state. Today `connectInstance` has `instanceStates` in its dependency array, so every state write re-creates it and re-fires the auto-connect effect — which reconnected instances the user had just disconnected. State flows *out* of connections into React and never back in as a dependency.
- **Attempt counter resets on a successful handshake, not on socket open.** "Successful handshake" = socket opened, `set-instance` sent, and the relay's `pty-status` reply for that instance received. Resetting on open is what made an earlier reconnect loop unbounded.
- **No `appClientId`.** No relay protocol changes at all in this PR.
- The public `InstanceContext` API keeps its current signatures so `Settings.jsx`, `InstanceManager.jsx`, `useRelay.js` and `RelayContext.jsx` need no changes beyond behaviour fixes: `connectInstance`, `disconnectInstance`, `switchInstance`, `sendToInstance`, `addInstanceMessageListener`, `addInstance(name, relayUrl, workingDir, color, customId, cliType)`, `getInstanceState`, `handleAppExit`, and the active-instance conveniences (`connect`, `disconnect`, `send`, `sendInput`, `sendResize`, `sendInterrupt`, `restartPty`, `requestReplay`, `submitInput`, `addMessageListener`).
- `getInstanceState(id)` keeps returning this exact shape: `{ connectionState, ptyStatus, hasUnread, processingStartTime, error, ptyError, taskComplete }`. `connectionState` values stay `'disconnected' | 'connecting' | 'connected' | 'reconnecting'`.
- Timing constants keep their current values: `RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]`, `MAX_RECONNECT_ATTEMPTS = 5`, `CONNECTION_TIMEOUT = 10000`, `HEARTBEAT_INTERVAL = 25000`, `HEARTBEAT_TIMEOUT = 5000`. New: `IDLE_DISCONNECT_MS = 3600000` (1 hour), `DEFAULT_MAX_INSTANCES = 10`.
- Commit style `<type>: <description>`. Run `npm run lint` (0 errors required) and `cd app && npm test` before each commit.
- Branch from `origin/main`. PR #9 is closed and none of its code is carried forward.

---

### Task 0: Branch, and add a test runner to the app

**Files:**
- Modify: `app/package.json`
- Create: `app/vitest.config.js`
- Create: `app/src/services/__tests__/smoke.test.js` (deleted at the end of this task)

**Interfaces:**
- Consumes: nothing
- Produces: `cd app && npm test` runs Vitest; `npm run test:app` from the repo root works for the first time

- [ ] **Step 1: Branch from a clean base**

```bash
git fetch origin
git checkout -b fix/client-connection-layer origin/main
grep -c "appClientId\|deliberateDisconnects" app/src/contexts/InstanceContext.jsx || echo "clean (0 matches)"
```

Expected: `clean (0 matches)`. If any match, you branched from the wrong base.

- [ ] **Step 2: Install Vitest**

```bash
cd app && npm install --save-dev vitest@^3
```

- [ ] **Step 3: Add the config**

Create `app/vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The connection layer is plain JS with injected socket and clock, so it
    // needs no DOM. Keep the default node environment - it is faster and it
    // proves the layer is testable without a browser.
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Add the scripts**

In `app/package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 5: Write a smoke test to prove the runner works**

Create `app/src/services/__tests__/smoke.test.js`:

```javascript
import { describe, it, expect } from 'vitest';

describe('vitest wiring', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run it from both entry points**

```bash
cd app && npm test
cd .. && npm run test:app
```

Expected: both pass, 1 test. `npm run test:app` has never worked before this step.

- [ ] **Step 7: Delete the smoke test and commit**

```bash
rm app/src/services/__tests__/smoke.test.js
npm run lint 2>&1 | tail -2
git add app/package.json app/package-lock.json app/vitest.config.js
git commit -m "chore(app): add Vitest so the app has a test runner

npm run test:app called npm test in app/, which had no test script - so the
root script had never worked. The connection layer this PR introduces is
designed to be unit-tested with an injected socket and clock, which needs a
runner. Node environment, no DOM."
```

---

### Task 1: `InstanceConnection` — connect and handshake

**Files:**
- Create: `app/src/services/InstanceConnection.js`
- Create: `app/src/services/__tests__/InstanceConnection.test.js`
- Create: `app/src/services/__tests__/fakeSocket.js`

**Interfaces:**
- Consumes: nothing
- Produces:

```
new InstanceConnection({
  instanceId: string,
  url: string,
  getHandshakePayload: () => object,   // returns the set-instance message body
  socketFactory?: (url) => socket,     // default (url) => new WebSocket(url)
  clock?: () => number,                // default () => Date.now()
  onStateChange?: (instanceId, { state, disconnectReason, error }) => void,
  onMessage?: (instanceId, message) => void,
})

  .state             'idle'|'connecting'|'connected'|'reconnecting'|'disconnected'|'destroyed'
  .disconnectReason  null|'user'|'idle'|'dropped'
  .connect()         void
  .send(message)     boolean   — false unless state === 'connected'
```

`CONNECTION_STATES` is exported as a frozen object of the state strings.

- [ ] **Step 1: Write the fake socket**

Create `app/src/services/__tests__/fakeSocket.js`:

```javascript
// Minimal stand-in for a browser WebSocket. Tests drive it directly, so every
// transition - including ones impossible to trigger reliably in a browser, like
// a close arriving after the connection was superseded - is reachable.
export const READY = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };

export class FakeSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = READY.CONNECTING;
    this.sent = [];
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    FakeSocket.instances.push(this);
  }

  static reset() {
    FakeSocket.instances = [];
  }

  static get last() {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
  }

  send(data) {
    if (this.readyState !== READY.OPEN) throw new Error('send on non-open socket');
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000, reason = '') {
    if (this.readyState === READY.CLOSED) return;
    this.readyState = READY.CLOSED;
    this.onclose?.({ code, reason, wasClean: true });
  }

  // --- test drivers ---
  fireOpen() {
    this.readyState = READY.OPEN;
    this.onopen?.();
  }

  fireMessage(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }

  fireError() {
    this.onerror?.({});
  }

  // An abrupt drop: no clean handshake, which is what a terminate() looks like.
  fireAbruptClose(code = 1006) {
    this.readyState = READY.CLOSED;
    this.onclose?.({ code, reason: '', wasClean: false });
  }

  get lastSent() {
    return this.sent[this.sent.length - 1];
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `app/src/services/__tests__/InstanceConnection.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InstanceConnection, CONNECTION_STATES } from '../InstanceConnection';
import { FakeSocket } from './fakeSocket';

function make(overrides = {}) {
  const onStateChange = vi.fn();
  const onMessage = vi.fn();
  const conn = new InstanceConnection({
    instanceId: 'inst-1',
    url: 'ws://relay/ws',
    getHandshakePayload: () => ({ workingDir: '/tmp', cliType: 'claude', cols: 80, rows: 24 }),
    socketFactory: (url) => new FakeSocket(url),
    clock: () => 1000,
    onStateChange,
    onMessage,
    ...overrides,
  });
  return { conn, onStateChange, onMessage };
}

describe('InstanceConnection: connect and handshake', () => {
  beforeEach(() => FakeSocket.reset());

  it('starts idle and creates no socket', () => {
    const { conn } = make();
    expect(conn.state).toBe(CONNECTION_STATES.IDLE);
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it('connect() opens exactly one socket and enters connecting', () => {
    const { conn } = make();
    conn.connect();
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTING);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.last.url).toBe('ws://relay/ws');
  });

  it('connect() while connecting does not open a second socket', () => {
    const { conn } = make();
    conn.connect();
    conn.connect();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('sends set-instance on open, with instanceId merged into the payload', () => {
    const { conn } = make();
    conn.connect();
    FakeSocket.last.fireOpen();
    expect(FakeSocket.last.lastSent).toEqual({
      type: 'set-instance',
      instanceId: 'inst-1',
      workingDir: '/tmp',
      cliType: 'claude',
      cols: 80,
      rows: 24,
    });
  });

  it('stays connecting after open until pty-status arrives', () => {
    const { conn } = make();
    conn.connect();
    FakeSocket.last.fireOpen();
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTING);
  });

  it('becomes connected only once pty-status arrives', () => {
    const { conn, onStateChange } = make();
    conn.connect();
    FakeSocket.last.fireOpen();
    FakeSocket.last.fireMessage({ type: 'pty-status', running: true });
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTED);
    expect(onStateChange).toHaveBeenCalledWith('inst-1', expect.objectContaining({
      state: CONNECTION_STATES.CONNECTED,
    }));
  });

  it('forwards every inbound message to onMessage', () => {
    const { conn, onMessage } = make();
    conn.connect();
    FakeSocket.last.fireOpen();
    FakeSocket.last.fireMessage({ type: 'output', data: 'hi' });
    expect(onMessage).toHaveBeenCalledWith('inst-1', { type: 'output', data: 'hi' });
  });

  it('ignores an unparseable frame without changing state', () => {
    const { conn } = make();
    conn.connect();
    FakeSocket.last.fireOpen();
    FakeSocket.last.onmessage({ data: '{not json' });
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTING);
  });

  it('send() returns false unless connected, and true once connected', () => {
    const { conn } = make();
    expect(conn.send({ type: 'input', data: 'x' })).toBe(false);
    conn.connect();
    FakeSocket.last.fireOpen();
    expect(conn.send({ type: 'input', data: 'x' })).toBe(false);
    FakeSocket.last.fireMessage({ type: 'pty-status' });
    expect(conn.send({ type: 'input', data: 'x' })).toBe(true);
    expect(FakeSocket.last.lastSent).toEqual({ type: 'input', data: 'x' });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app && npx vitest run src/services/__tests__/InstanceConnection.test.js`
Expected: FAIL — cannot resolve `../InstanceConnection`

- [ ] **Step 4: Write the minimal implementation**

Create `app/src/services/InstanceConnection.js`:

```javascript
export const CONNECTION_STATES = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
  DESTROYED: 'destroyed',
});

const S = CONNECTION_STATES;

/**
 * Owns exactly one WebSocket for one instance, plus every timer belonging to it.
 *
 * The object IS the reference to its socket. Nothing keys off a map entry that
 * could be deleted while the socket is still open, and handlers are bound to
 * this instance - so a socket from a previous connection cannot reach a live
 * handler. That is what makes a leaked socket structurally impossible, rather
 * than something to be detected after the fact.
 */
export class InstanceConnection {
  constructor({
    instanceId,
    url,
    getHandshakePayload,
    socketFactory = (u) => new WebSocket(u),
    clock = () => Date.now(),
    onStateChange = () => {},
    onMessage = () => {},
  }) {
    this.instanceId = instanceId;
    this.url = url;
    this.getHandshakePayload = getHandshakePayload;
    this.socketFactory = socketFactory;
    this.clock = clock;
    this.onStateChange = onStateChange;
    this.onMessage = onMessage;

    this.state = S.IDLE;
    this.disconnectReason = null;
    this.error = null;
    this.ws = null;
    this.lastActivityAt = clock();
    this.ptyProcessing = false;
  }

  _setState(state, { disconnectReason = null, error = null } = {}) {
    this.state = state;
    this.disconnectReason = disconnectReason;
    this.error = error;
    this.onStateChange(this.instanceId, { state, disconnectReason, error });
  }

  connect() {
    if (this.state === S.DESTROYED) return;
    if (this.state === S.CONNECTING || this.state === S.CONNECTED) return;

    this._setState(S.CONNECTING);

    let ws;
    try {
      ws = this.socketFactory(this.url);
    } catch (err) {
      this._setState(S.DISCONNECTED, { error: err.message });
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      ws.send(JSON.stringify({
        type: 'set-instance',
        instanceId: this.instanceId,
        ...this.getHandshakePayload(),
      }));
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this._handleMessage(message);
    };

    ws.onerror = () => {
      if (this.ws !== ws) return;
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
    };
  }

  _handleMessage(message) {
    // The handshake completes on pty-status, not on socket open. A socket that
    // opens but never completes set-instance is not connected.
    if (message.type === 'pty-status' && this.state === S.CONNECTING) {
      this._setState(S.CONNECTED);
    }
    if (message.type === 'output' || message.type === 'replay') {
      this.lastActivityAt = this.clock();
    }
    if (message.type === 'pty-status') {
      this.ptyProcessing = Boolean(message.processingStartTime);
    }
    this.onMessage(this.instanceId, message);
  }

  send(message) {
    if (this.state !== S.CONNECTED || !this.ws) return false;
    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npx vitest run src/services/__tests__/InstanceConnection.test.js`
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
cd .. && npm run lint 2>&1 | tail -2
git add app/src/services/InstanceConnection.js app/src/services/__tests__/
git commit -m "feat(app): add InstanceConnection with connect and handshake

One object owns one socket. The object is the reference, so there is no map
entry that can be deleted while the socket lives - which is what made sockets
leak permanently and render every byte an extra time.

The handshake completes on the relay's pty-status reply, not on socket open. A
socket that opens but never completes set-instance is not connected, so a
deterministic server-side failure cannot masquerade as a successful connection."
```

---

### Task 2: `InstanceConnection` — drops, backoff, and the late-close case

**Files:**
- Modify: `app/src/services/InstanceConnection.js`
- Create: `app/src/services/__tests__/InstanceConnection.reconnect.test.js`

**Interfaces:**
- Consumes: Task 1's constructor and states
- Produces: `RECONNECT_DELAYS`, `MAX_RECONNECT_ATTEMPTS`, `CONNECTION_TIMEOUT` exported; `connection.attempts` (number, read-only by convention); reconnect scheduling via injected `setTimer`/`clearTimer` (default `setTimeout`/`clearTimeout`) so tests need no fake timers

- [ ] **Step 1: Write the failing tests**

Create `app/src/services/__tests__/InstanceConnection.reconnect.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InstanceConnection, CONNECTION_STATES, RECONNECT_DELAYS, MAX_RECONNECT_ATTEMPTS } from '../InstanceConnection';
import { FakeSocket } from './fakeSocket';

// Collects scheduled timers so tests can fire them deterministically.
function makeTimers() {
  const scheduled = [];
  return {
    setTimer: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length - 1; },
    clearTimer: (id) => { if (scheduled[id]) scheduled[id].cleared = true; },
    scheduled,
    fireLast: () => {
      const t = scheduled[scheduled.length - 1];
      if (!t.cleared) t.fn();
    },
  };
}

function make(extra = {}) {
  const timers = makeTimers();
  const conn = new InstanceConnection({
    instanceId: 'inst-1',
    url: 'ws://relay/ws',
    getHandshakePayload: () => ({ cols: 80, rows: 24 }),
    socketFactory: (url) => new FakeSocket(url),
    clock: () => 1000,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    ...extra,
  });
  return { conn, timers };
}

function connectFully(conn) {
  conn.connect();
  FakeSocket.last.fireOpen();
  FakeSocket.last.fireMessage({ type: 'pty-status' });
}

describe('InstanceConnection: drops and backoff', () => {
  beforeEach(() => FakeSocket.reset());

  it('an abrupt close enters reconnecting with reason dropped', () => {
    const { conn } = make();
    connectFully(conn);
    FakeSocket.last.fireAbruptClose();
    expect(conn.state).toBe(CONNECTION_STATES.RECONNECTING);
    expect(conn.disconnectReason).toBe('dropped');
  });

  it('a CLEAN server close also reconnects', () => {
    // wasClean asks the wrong question: a heartbeat timeout or a relay-side
    // close completes a clean handshake but was not the client's decision.
    const { conn } = make();
    connectFully(conn);
    FakeSocket.last.close(1000, 'server closing');
    expect(conn.state).toBe(CONNECTION_STATES.RECONNECTING);
    expect(conn.disconnectReason).toBe('dropped');
  });

  it('uses the backoff ladder in order', () => {
    const { conn, timers } = make();
    connectFully(conn);
    FakeSocket.last.fireAbruptClose();
    expect(timers.scheduled.at(-1).ms).toBe(RECONNECT_DELAYS[0]);

    timers.fireLast();
    FakeSocket.last.fireOpen();
    FakeSocket.last.fireAbruptClose();       // failed before handshake
    expect(timers.scheduled.at(-1).ms).toBe(RECONNECT_DELAYS[1]);
  });

  it('a repeated handshake failure exhausts the ladder instead of looping forever', () => {
    // The counter must reset on handshake, not on open. Resetting on open makes
    // a deterministic server-side set-instance failure retry forever.
    const { conn, timers } = make();
    conn.connect();
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      FakeSocket.last.fireOpen();            // opens fine...
      FakeSocket.last.fireAbruptClose();     // ...but never completes handshake
      if (conn.state === CONNECTION_STATES.RECONNECTING) timers.fireLast();
    }
    expect(conn.state).toBe(CONNECTION_STATES.DISCONNECTED);
    expect(conn.error).toMatch(/multiple attempts/i);
  });

  it('a successful handshake resets the counter', () => {
    const { conn, timers } = make();
    connectFully(conn);
    FakeSocket.last.fireAbruptClose();
    timers.fireLast();
    connectFully(conn);                       // recovers
    expect(conn.attempts).toBe(0);
    FakeSocket.last.fireAbruptClose();
    expect(timers.scheduled.at(-1).ms).toBe(RECONNECT_DELAYS[0]);
  });

  it('a close from a superseded socket is ignored entirely', () => {
    // The original #8 leak: a backgrounded WebView delivers close late, after
    // the app has already reconnected. That stale close must not touch the live
    // socket's state.
    const { conn, timers } = make();
    connectFully(conn);
    const stale = FakeSocket.last;

    FakeSocket.last.fireAbruptClose();
    timers.fireLast();
    connectFully(conn);
    const live = FakeSocket.last;
    expect(live).not.toBe(stale);

    stale.fireAbruptClose();                  // arrives now, far too late
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTED);
    expect(conn.ws).toBe(live);
  });

  it('a connect timeout drops and retries', () => {
    const { conn, timers } = make();
    conn.connect();
    const timeout = timers.scheduled.find((t) => t.ms === 10000);
    expect(timeout).toBeDefined();
    timeout.fn();
    expect(conn.state).toBe(CONNECTION_STATES.RECONNECTING);
  });

  it('a handshake that never completes hits the connect timeout', () => {
    const { conn, timers } = make();
    conn.connect();
    FakeSocket.last.fireOpen();               // opened, but no pty-status
    const timeout = timers.scheduled.find((t) => t.ms === 10000);
    timeout.fn();
    expect(conn.state).toBe(CONNECTION_STATES.RECONNECTING);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/services/__tests__/InstanceConnection.reconnect.test.js`
Expected: FAIL — `RECONNECT_DELAYS` is not exported; state stays `connected` after close

- [ ] **Step 3: Add the constants and timer injection**

At the top of `app/src/services/InstanceConnection.js`, after `CONNECTION_STATES`:

```javascript
export const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
export const MAX_RECONNECT_ATTEMPTS = 5;
export const CONNECTION_TIMEOUT = 10000;
```

In the constructor parameter list add `setTimer = (fn, ms) => setTimeout(fn, ms)` and `clearTimer = (id) => clearTimeout(id)`, and in the body:

```javascript
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.attempts = 0;
    this._connectTimer = null;
    this._reconnectTimer = null;
```

- [ ] **Step 4: Arm the connect timeout and handle close**

In `connect()`, immediately after `this.ws = ws;`:

```javascript
    // Covers open AND handshake: a socket that opens but never completes
    // set-instance must not sit in connecting forever.
    this._connectTimer = this.setTimer(() => {
      if (this.ws !== ws) return;
      this._drop('Connection timeout');
    }, CONNECTION_TIMEOUT);
```

Replace the empty `ws.onclose` with:

```javascript
    ws.onclose = () => {
      // A close event can arrive long after this socket was superseded, which is
      // routine on mobile. Only the current socket may change state.
      if (this.ws !== ws) return;
      this._drop();
    };
```

- [ ] **Step 5: Clear the connect timeout on a completed handshake and count attempts**

In `_handleMessage`, inside the `pty-status && CONNECTING` branch, before `_setState`:

```javascript
      this._clearConnectTimer();
      this.attempts = 0;   // reset on handshake, never on open
```

Add the private helpers:

```javascript
  _clearConnectTimer() {
    if (this._connectTimer !== null) {
      this.clearTimer(this._connectTimer);
      this._connectTimer = null;
    }
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer !== null) {
      this.clearTimer(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  // Involuntary loss of the socket: network, relay restart, heartbeat timeout,
  // connect timeout, or a clean close the relay initiated. All reconnect.
  _drop(error = null) {
    this._clearConnectTimer();
    this._teardownSocket();

    if (this.attempts >= MAX_RECONNECT_ATTEMPTS) {
      this._setState(S.DISCONNECTED, {
        disconnectReason: 'dropped',
        error: 'Connection failed after multiple attempts',
      });
      return;
    }

    const delay = RECONNECT_DELAYS[Math.min(this.attempts, RECONNECT_DELAYS.length - 1)];
    this.attempts += 1;
    this._setState(S.RECONNECTING, { disconnectReason: 'dropped', error });
    this._reconnectTimer = this.setTimer(() => {
      this._reconnectTimer = null;
      this.connect();
    }, delay);
  }

  _teardownSocket() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    try {
      ws.close(1000, 'Replaced');
    } catch {
      // Already closed.
    }
  }
```

Also change `connect()`'s guard to allow reconnecting, and clear any pending reconnect timer at its start:

```javascript
    if (this.state === S.DESTROYED) return;
    if (this.state === S.CONNECTING || this.state === S.CONNECTED) return;
    this._clearReconnectTimer();
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app && npx vitest run src/services/__tests__/`
Expected: PASS (all tests from Tasks 1 and 2)

- [ ] **Step 7: Commit**

```bash
cd .. && npm run lint 2>&1 | tail -2
git add app/src/services/
git commit -m "feat(app): reconnect on every involuntary close, with a real ladder

Keying reconnection off event.wasClean asked the wrong question: a heartbeat
timeout closes with 4000 and a relay-side close completes cleanly, and both were
treated as intentional - leaving the instance dark until the user reselected it.
Every close the client did not initiate now reconnects.

The attempt counter resets on a completed handshake rather than on socket open,
so a deterministic set-instance failure exhausts the ladder and surfaces an
error instead of retrying about once a second forever.

A close from a superseded socket is ignored outright, which is the late-close
path that leaked a live socket on every background/foreground cycle (#8)."
```

---

### Task 3: `InstanceConnection` — intent, idle, and teardown

**Files:**
- Modify: `app/src/services/InstanceConnection.js`
- Create: `app/src/services/__tests__/InstanceConnection.intent.test.js`

**Interfaces:**
- Consumes: Tasks 1–2
- Produces: `disconnect(reason)` where `reason` is `'user' | 'idle'`; `ping()`; `isIdleSince(thresholdMs) => boolean`; `destroy()`; `HEARTBEAT_TIMEOUT` exported

- [ ] **Step 1: Write the failing tests**

Create `app/src/services/__tests__/InstanceConnection.intent.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { InstanceConnection, CONNECTION_STATES } from '../InstanceConnection';
import { FakeSocket } from './fakeSocket';

function makeTimers() {
  const scheduled = [];
  return {
    setTimer: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length - 1; },
    clearTimer: (id) => { if (scheduled[id]) scheduled[id].cleared = true; },
    scheduled,
    fireLast: () => { const t = scheduled.at(-1); if (!t.cleared) t.fn(); },
  };
}

function make(now = { t: 1000 }) {
  const timers = makeTimers();
  const conn = new InstanceConnection({
    instanceId: 'inst-1',
    url: 'ws://relay/ws',
    getHandshakePayload: () => ({ cols: 80, rows: 24 }),
    socketFactory: (url) => new FakeSocket(url),
    clock: () => now.t,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return { conn, timers, now };
}

function connectFully(conn) {
  conn.connect();
  FakeSocket.last.fireOpen();
  FakeSocket.last.fireMessage({ type: 'pty-status' });
}

describe('InstanceConnection: intent', () => {
  beforeEach(() => FakeSocket.reset());

  it('disconnect("user") goes to disconnected and does NOT reconnect', () => {
    const { conn, timers } = make();
    connectFully(conn);
    conn.disconnect('user');
    expect(conn.state).toBe(CONNECTION_STATES.DISCONNECTED);
    expect(conn.disconnectReason).toBe('user');
    expect(timers.scheduled.filter((t) => !t.cleared && t.ms >= 1000 && t.ms <= 16000)).toHaveLength(0);
  });

  it('the close triggered by disconnect("user") does not start a reconnect', () => {
    const { conn } = make();
    connectFully(conn);
    const ws = FakeSocket.last;
    conn.disconnect('user');
    ws.fireAbruptClose();                       // late close for the socket we closed
    expect(conn.state).toBe(CONNECTION_STATES.DISCONNECTED);
    expect(conn.disconnectReason).toBe('user');
  });

  it('disconnect during reconnecting backoff cancels the pending retry', () => {
    const { conn, timers } = make();
    connectFully(conn);
    FakeSocket.last.fireAbruptClose();
    expect(conn.state).toBe(CONNECTION_STATES.RECONNECTING);
    conn.disconnect('user');
    timers.fireLast();                          // if it were live, this would reconnect
    expect(conn.state).toBe(CONNECTION_STATES.DISCONNECTED);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('connect() after a user disconnect works - selecting the tab is consent', () => {
    const { conn } = make();
    connectFully(conn);
    conn.disconnect('user');
    conn.connect();
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTING);
    expect(conn.disconnectReason).toBe(null);
  });

  it('ping() sends a ping and a missing pong drops the connection', () => {
    const { conn, timers } = make();
    connectFully(conn);
    conn.ping();
    expect(FakeSocket.last.lastSent).toEqual({ type: 'ping' });
    const pongTimer = timers.scheduled.find((t) => t.ms === 5000 && !t.cleared);
    pongTimer.fn();
    expect(conn.state).toBe(CONNECTION_STATES.RECONNECTING);
  });

  it('a pong clears the timeout', () => {
    const { conn, timers } = make();
    connectFully(conn);
    conn.ping();
    FakeSocket.last.fireMessage({ type: 'pong' });
    const pongTimer = timers.scheduled.find((t) => t.ms === 5000);
    expect(pongTimer.cleared).toBe(true);
  });
});

describe('InstanceConnection: idle predicate', () => {
  beforeEach(() => FakeSocket.reset());

  it('is not idle before the threshold elapses', () => {
    const now = { t: 1000 };
    const { conn } = make(now);
    connectFully(conn);
    now.t = 1000 + 3599999;
    expect(conn.isIdleSince(3600000)).toBe(false);
  });

  it('is idle once the threshold elapses with no output', () => {
    const now = { t: 1000 };
    const { conn } = make(now);
    connectFully(conn);
    now.t = 1000 + 3600000;
    expect(conn.isIdleSince(3600000)).toBe(true);
  });

  it('output resets the idle clock', () => {
    const now = { t: 1000 };
    const { conn } = make(now);
    connectFully(conn);
    now.t = 1000 + 3599000;
    FakeSocket.last.fireMessage({ type: 'output', data: 'x' });
    now.t = 1000 + 3600000;
    expect(conn.isIdleSince(3600000)).toBe(false);
  });

  it('a busy PTY is never idle, however long since the last output', () => {
    // The safety property: only a genuinely idle PTY may be disconnected, since
    // an idle PTY with no client cannot start work and so cannot be missed.
    const now = { t: 1000 };
    const { conn } = make(now);
    connectFully(conn);
    FakeSocket.last.fireMessage({ type: 'pty-status', processingStartTime: 500 });
    now.t = 1000 + 7200000;
    expect(conn.isIdleSince(3600000)).toBe(false);
  });

  it('is not idle unless connected', () => {
    const { conn } = make();
    expect(conn.isIdleSince(0)).toBe(false);
  });
});

describe('InstanceConnection: destroy', () => {
  beforeEach(() => FakeSocket.reset());

  it('destroy() closes the socket and blocks further connects', () => {
    const { conn } = make();
    connectFully(conn);
    conn.destroy();
    expect(conn.state).toBe(CONNECTION_STATES.DESTROYED);
    conn.connect();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('destroy() twice does not throw', () => {
    const { conn } = make();
    connectFully(conn);
    conn.destroy();
    expect(() => conn.destroy()).not.toThrow();
  });

  it('destroy() cancels a pending reconnect', () => {
    const { conn, timers } = make();
    connectFully(conn);
    FakeSocket.last.fireAbruptClose();
    conn.destroy();
    timers.fireLast();
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/services/__tests__/InstanceConnection.intent.test.js`
Expected: FAIL — `conn.disconnect is not a function`

- [ ] **Step 3: Implement intent, ping, idle and destroy**

Add `export const HEARTBEAT_TIMEOUT = 5000;` beside the other constants. In the constructor add `this._pongTimer = null;`.

Add these methods:

```javascript
  // The client's own decision to stop. 'user' = explicit action; 'idle' = the
  // idle sweep. Neither reconnects on its own; selecting the tab does.
  disconnect(reason = 'user') {
    if (this.state === S.DESTROYED) return;
    this._clearAllTimers();
    this._teardownSocket();
    this._setState(S.DISCONNECTED, { disconnectReason: reason });
  }

  ping() {
    if (this.state !== S.CONNECTED) return;
    if (!this.send({ type: 'ping' })) return;
    this._clearPongTimer();
    this._pongTimer = this.setTimer(() => {
      this._pongTimer = null;
      this._drop('Heartbeat timeout');
    }, HEARTBEAT_TIMEOUT);
  }

  // Pure over what this connection itself observes. The two view-related idle
  // conditions are React state and belong to the caller, which ANDs them in.
  isIdleSince(thresholdMs) {
    if (this.state !== S.CONNECTED) return false;
    if (this.ptyProcessing) return false;
    return this.clock() - this.lastActivityAt >= thresholdMs;
  }

  destroy() {
    if (this.state === S.DESTROYED) return;
    this._clearAllTimers();
    this._teardownSocket();
    this.state = S.DESTROYED;
    this.disconnectReason = null;
  }

  _clearPongTimer() {
    if (this._pongTimer !== null) {
      this.clearTimer(this._pongTimer);
      this._pongTimer = null;
    }
  }

  _clearAllTimers() {
    this._clearConnectTimer();
    this._clearReconnectTimer();
    this._clearPongTimer();
  }
```

In `_handleMessage`, handle `pong` before anything else:

```javascript
    if (message.type === 'pong') {
      this._clearPongTimer();
      return;
    }
```

In `_drop`, replace `this._clearConnectTimer();` with `this._clearAllTimers();` so a drop cannot leave a pong timer armed.

In `connect()`, reset intent when the caller reconnects deliberately — the guard block becomes:

```javascript
    if (this.state === S.DESTROYED) return;
    if (this.state === S.CONNECTING || this.state === S.CONNECTED) return;
    this._clearReconnectTimer();
    this.disconnectReason = null;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/services/__tests__/`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
cd .. && npm run lint 2>&1 | tail -2
git add app/src/services/
git commit -m "feat(app): record why a connection is down, plus idle and teardown

A connection now carries a reason: user, idle or dropped. Only dropped
reconnects on its own; the other two wait to be reconnected by selecting the
tab. A single boolean could not express this, which is why an earlier attempt
conflated a user disconnect with a system one.

isIdleSince is pure over what the connection observes - time since the last
output, and whether the PTY is processing. It never reports idle while the PTY
is busy, which is the property that makes idle disconnect safe: an idle PTY with
no client attached cannot start work, so no completion can be missed.

destroy() is idempotent and cancels every timer."
```

---

### Task 4: `ConnectionManager` — the map, the shared tick, and the idle sweep

**Files:**
- Create: `app/src/services/ConnectionManager.js`
- Create: `app/src/services/__tests__/ConnectionManager.test.js`

**Interfaces:**
- Consumes: `InstanceConnection`, `CONNECTION_STATES`
- Produces:

```
new ConnectionManager({
  connectionFactory,                 // ({instanceId, url}) => InstanceConnection-like
  isViewIdle: (instanceId) => bool,  // supplied by InstanceContext from a ref
  clock?, setInterval_?, clearInterval_?,
  idleMs?  = IDLE_DISCONNECT_MS,
  heartbeatMs? = HEARTBEAT_INTERVAL,
})

  .ensure(instanceId, url)   InstanceConnection      — creates on first call
  .get(instanceId)           InstanceConnection|undefined
  .connect(instanceId, url)  void
  .disconnect(id, reason)    void
  .disconnectAll(reason)     void
  .send(id, message)         boolean
  .connectedCount()          number
  .remove(instanceId)        void   — destroys and forgets
  .destroyAll()              void
  .startHeartbeat() / .stopHeartbeat()
  .tick()                    void   — exposed for tests; pings all, then sweeps idle
```

`IDLE_DISCONNECT_MS` and `HEARTBEAT_INTERVAL` are exported here.

- [ ] **Step 1: Write the failing tests**

Create `app/src/services/__tests__/ConnectionManager.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { ConnectionManager, IDLE_DISCONNECT_MS } from '../ConnectionManager';

function fakeConn(instanceId) {
  return {
    instanceId,
    state: 'connected',
    disconnectReason: null,
    connect: vi.fn(),
    disconnect: vi.fn(function (r) { this.state = 'disconnected'; this.disconnectReason = r; }),
    send: vi.fn(() => true),
    ping: vi.fn(),
    isIdleSince: vi.fn(() => false),
    destroy: vi.fn(function () { this.state = 'destroyed'; }),
  };
}

function make({ isViewIdle = () => true } = {}) {
  const created = [];
  const mgr = new ConnectionManager({
    connectionFactory: ({ instanceId }) => {
      const c = fakeConn(instanceId);
      created.push(c);
      return c;
    },
    isViewIdle,
  });
  return { mgr, created };
}

describe('ConnectionManager', () => {
  it('ensure() creates one connection per instance and reuses it', () => {
    const { mgr, created } = make();
    const a = mgr.ensure('i1', 'ws://r/ws');
    const again = mgr.ensure('i1', 'ws://r/ws');
    expect(a).toBe(again);
    expect(created).toHaveLength(1);
  });

  it('connectedCount counts only connected connections', () => {
    const { mgr } = make();
    mgr.ensure('i1', 'ws://r/ws');
    mgr.ensure('i2', 'ws://r/ws');
    expect(mgr.connectedCount()).toBe(2);
    mgr.get('i2').state = 'reconnecting';
    expect(mgr.connectedCount()).toBe(1);
  });

  it('one tick pings every connected connection', () => {
    const { mgr } = make();
    mgr.ensure('i1', 'ws://r/ws');
    mgr.ensure('i2', 'ws://r/ws');
    mgr.tick();
    expect(mgr.get('i1').ping).toHaveBeenCalledTimes(1);
    expect(mgr.get('i2').ping).toHaveBeenCalledTimes(1);
  });

  it('disconnects a connection idle in BOTH senses', () => {
    const { mgr } = make({ isViewIdle: () => true });
    const c = mgr.ensure('i1', 'ws://r/ws');
    c.isIdleSince.mockReturnValue(true);
    mgr.tick();
    expect(c.disconnect).toHaveBeenCalledWith('idle');
  });

  it('does NOT disconnect when the connection is busy', () => {
    const { mgr } = make({ isViewIdle: () => true });
    const c = mgr.ensure('i1', 'ws://r/ws');
    c.isIdleSince.mockReturnValue(false);
    mgr.tick();
    expect(c.disconnect).not.toHaveBeenCalled();
  });

  it('does NOT disconnect when the tab is being viewed', () => {
    const { mgr } = make({ isViewIdle: () => false });
    const c = mgr.ensure('i1', 'ws://r/ws');
    c.isIdleSince.mockReturnValue(true);
    mgr.tick();
    expect(c.disconnect).not.toHaveBeenCalled();
  });

  it('uses the 1 hour threshold', () => {
    const { mgr } = make();
    const c = mgr.ensure('i1', 'ws://r/ws');
    mgr.tick();
    expect(c.isIdleSince).toHaveBeenCalledWith(IDLE_DISCONNECT_MS);
    expect(IDLE_DISCONNECT_MS).toBe(3600000);
  });

  it('disconnectAll disconnects every connection with the given reason', () => {
    const { mgr } = make();
    mgr.ensure('i1', 'ws://r/ws');
    mgr.ensure('i2', 'ws://r/ws');
    mgr.disconnectAll('user');
    expect(mgr.get('i1').disconnect).toHaveBeenCalledWith('user');
    expect(mgr.get('i2').disconnect).toHaveBeenCalledWith('user');
  });

  it('remove destroys and forgets the connection', () => {
    const { mgr } = make();
    const c = mgr.ensure('i1', 'ws://r/ws');
    mgr.remove('i1');
    expect(c.destroy).toHaveBeenCalled();
    expect(mgr.get('i1')).toBeUndefined();
  });

  it('destroyAll destroys everything and empties the map', () => {
    const { mgr, created } = make();
    mgr.ensure('i1', 'ws://r/ws');
    mgr.ensure('i2', 'ws://r/ws');
    mgr.destroyAll();
    created.forEach((c) => expect(c.destroy).toHaveBeenCalled());
    expect(mgr.connectedCount()).toBe(0);
  });

  it('startHeartbeat arms exactly one interval regardless of connection count', () => {
    const intervals = [];
    const mgr = new ConnectionManager({
      connectionFactory: ({ instanceId }) => fakeConn(instanceId),
      isViewIdle: () => false,
      setInterval_: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length - 1; },
      clearInterval_: () => {},
    });
    mgr.ensure('i1', 'ws://r/ws');
    mgr.ensure('i2', 'ws://r/ws');
    mgr.ensure('i3', 'ws://r/ws');
    mgr.startHeartbeat();
    mgr.startHeartbeat();
    expect(intervals).toHaveLength(1);
    expect(intervals[0].ms).toBe(25000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/services/__tests__/ConnectionManager.test.js`
Expected: FAIL — cannot resolve `../ConnectionManager`

- [ ] **Step 3: Write the implementation**

Create `app/src/services/ConnectionManager.js`:

```javascript
import { InstanceConnection, CONNECTION_STATES } from './InstanceConnection';

export const HEARTBEAT_INTERVAL = 25000;
export const IDLE_DISCONNECT_MS = 3600000;   // 1 hour
export const DEFAULT_MAX_INSTANCES = 10;

/**
 * Owns the per-instance connections and ONE shared heartbeat.
 *
 * The heartbeat is shared deliberately. Ten connections each running their own
 * 25s timer wake the mobile radio about 24 times a minute at unsynchronised
 * moments and never let it sleep; that, not the socket count, is the real cost
 * of holding connections open. One tick pings them all together.
 */
export class ConnectionManager {
  constructor({
    connectionFactory = (opts) => new InstanceConnection(opts),
    isViewIdle = () => false,
    idleMs = IDLE_DISCONNECT_MS,
    heartbeatMs = HEARTBEAT_INTERVAL,
    setInterval_ = (fn, ms) => setInterval(fn, ms),
    clearInterval_ = (id) => clearInterval(id),
  } = {}) {
    this.connectionFactory = connectionFactory;
    this.isViewIdle = isViewIdle;
    this.idleMs = idleMs;
    this.heartbeatMs = heartbeatMs;
    this.setInterval_ = setInterval_;
    this.clearInterval_ = clearInterval_;
    this.connections = new Map();
    this._heartbeat = null;
  }

  ensure(instanceId, url) {
    let conn = this.connections.get(instanceId);
    if (!conn) {
      conn = this.connectionFactory({ instanceId, url });
      this.connections.set(instanceId, conn);
    }
    return conn;
  }

  get(instanceId) {
    return this.connections.get(instanceId);
  }

  connect(instanceId, url) {
    this.ensure(instanceId, url).connect();
  }

  disconnect(instanceId, reason = 'user') {
    this.connections.get(instanceId)?.disconnect(reason);
  }

  disconnectAll(reason = 'user') {
    this.connections.forEach((conn) => conn.disconnect(reason));
  }

  send(instanceId, message) {
    return this.connections.get(instanceId)?.send(message) ?? false;
  }

  connectedCount() {
    let n = 0;
    this.connections.forEach((c) => {
      if (c.state === CONNECTION_STATES.CONNECTED) n += 1;
    });
    return n;
  }

  remove(instanceId) {
    const conn = this.connections.get(instanceId);
    if (!conn) return;
    conn.destroy();
    this.connections.delete(instanceId);
  }

  destroyAll() {
    this.connections.forEach((c) => c.destroy());
    this.connections.clear();
    this.stopHeartbeat();
  }

  startHeartbeat() {
    if (this._heartbeat !== null) return;
    this._heartbeat = this.setInterval_(() => this.tick(), this.heartbeatMs);
  }

  stopHeartbeat() {
    if (this._heartbeat === null) return;
    this.clearInterval_(this._heartbeat);
    this._heartbeat = null;
  }

  tick() {
    this.connections.forEach((conn) => conn.ping());
    this._sweepIdle();
  }

  // Evaluated by timestamp comparison on the tick, never by a long setTimeout.
  // A one-hour timer in a backgrounded WebView may not fire at all; a missed
  // check here only delays the disconnect, which is harmless.
  _sweepIdle() {
    this.connections.forEach((conn, instanceId) => {
      if (!conn.isIdleSince(this.idleMs)) return;
      if (!this.isViewIdle(instanceId)) return;
      conn.disconnect('idle');
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/services/__tests__/`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
cd .. && npm run lint 2>&1 | tail -2
git add app/src/services/
git commit -m "feat(app): add ConnectionManager with one shared heartbeat

Each connection previously ran its own 25s heartbeat. Ten of them wake the
mobile radio ~24 times a minute at unsynchronised moments and never let it
sleep, which is the actual cost of holding connections open - not the socket
count. One tick now pings them all together.

The same tick runs the idle sweep, by timestamp comparison rather than a
one-hour setTimeout that a backgrounded WebView may never fire. A connection is
only disconnected when it is idle in both senses: nothing from the PTY, and the
tab not being viewed - the latter supplied by the caller, so the connection
layer stays free of view state."
```

---

### Task 5: Rewire `InstanceContext` onto the manager

**Files:**
- Modify: `app/src/contexts/InstanceContext.jsx`

**Interfaces:**
- Consumes: `ConnectionManager`, `InstanceConnection`, `CONNECTION_STATES`
- Produces: the unchanged public context API listed in Global Constraints

- [ ] **Step 1: Record the baseline surface so nothing is dropped**

```bash
cd app && node -e "
const src = require('fs').readFileSync('src/contexts/InstanceContext.jsx','utf8');
const body = src.slice(src.indexOf('const value = useMemo'));
const keys = [...body.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*)[,:]/gm)].map(m => m[1]);
console.log(keys.join('\n'));
" > /tmp/context-api-before.txt
wc -l /tmp/context-api-before.txt
```

Keep this file; Step 7 diffs against it.

- [ ] **Step 2: Delete the socket state and add the manager**

Remove these refs entirely: `wsRefs`, `reconnectAttemptsRef`, `reconnectTimeoutsRef`, `connectionTimeoutsRef`, `heartbeatIntervalsRef`, `pongTimeoutsRef`. Keep `listenersRef`, `isAppVisibleRef`, `activeInstanceIdRef`.

Delete the now-dead helpers: `cleanupTimers`, `startHeartbeat`, and the entire body of `connectInstance`'s socket wiring.

Add near the top of the provider:

```javascript
  // Refs the manager reads through, so the manager never becomes a React
  // dependency - see the callback-stability rule.
  const instancesRef = useRef(instances);
  useEffect(() => { instancesRef.current = instances; }, [instances]);

  const managerRef = useRef(null);
  if (managerRef.current === null) {
    managerRef.current = new ConnectionManager({
      connectionFactory: ({ instanceId, url }) => new InstanceConnection({
        instanceId,
        url,
        getHandshakePayload: () => {
          const inst = instancesRef.current.find((i) => i.id === instanceId);
          const dims = storage.getJSON('terminal-dims', { cols: 50, rows: 24 });
          return {
            workingDir: inst?.workingDir || null,
            cliType: inst?.cliType || 'claude',
            cols: dims.cols,
            rows: dims.rows,
          };
        },
        onStateChange: (id, { state, error }) => {
          updateInstanceStateRef.current(id, {
            connectionState: state === 'destroyed' ? 'disconnected' : state,
            ...(error !== null ? { error } : {}),
          });
        },
        onMessage: (id, message) => handleInstanceMessageRef.current(id, message),
      }),
      isViewIdle: (instanceId) => {
        if (instanceId === activeInstanceIdRef.current) return false;
        const inst = instancesRef.current.find((i) => i.id === instanceId);
        const lastViewed = inst?.lastViewedAt || inst?.lastUsedAt || 0;
        return Date.now() - lastViewed >= IDLE_DISCONNECT_MS;
      },
    });
  }
```

- [ ] **Step 3: Route inbound messages through one stable handler**

The message side-effects currently inline in `ws.onmessage` move to a single function held in a ref, so the connection objects never capture React state:

```javascript
  const updateInstanceStateRef = useRef(null);
  updateInstanceStateRef.current = updateInstanceState;

  const handleInstanceMessageRef = useRef(null);
  handleInstanceMessageRef.current = useCallback((instanceId, message) => {
    if (message.type === 'pty-status') {
      updateInstanceState(instanceId, {
        ptyStatus: message,
        processingStartTime: message.processingStartTime || null,
        ptyError: null,
      });
    } else if (message.type === 'pty-error') {
      updateInstanceState(instanceId, { ptyError: message.message || 'CLI failed to start' });
    } else if (message.type === 'pty-crash') {
      updateInstanceState(instanceId, {
        ptyError: message.exitCode ? `CLI crashed (exit ${message.exitCode})` : 'CLI crashed unexpectedly',
      });
    } else if (message.type === 'task-complete') {
      updateInstanceState(instanceId, { taskComplete: true });
      const isVisible = isAppVisibleRef.current;
      notificationService.log('task-complete', { duration: message.duration, isVisible, willNotify: !isVisible });
      if (!isVisible) {
        notificationService.notifyTaskComplete({ instanceId, duration: message.duration });
      }
    } else if (message.type === 'output' || message.type === 'replay') {
      if (instanceId !== activeInstanceIdRef.current) {
        updateInstanceState(instanceId, { hasUnread: true });
      }
    }
    notifyListeners(instanceId, message);
  }, [updateInstanceState, notifyListeners]);
```

- [ ] **Step 4: Reimplement the public actions as delegation**

```javascript
  // No connection state in the dependency array. This is the callback-stability
  // rule: a dependency on instanceStates re-creates this callback on every state
  // write, which re-fires the auto-connect effect and reconnects instances the
  // user just disconnected.
  const connectInstance = useCallback((instanceId) => {
    const instance = instancesRef.current.find((i) => i.id === instanceId);
    if (!instance) return;
    managerRef.current.connect(instanceId, instance.relayUrl);
  }, []);

  const disconnectInstance = useCallback((instanceId) => {
    managerRef.current.disconnect(instanceId, 'user');
  }, []);

  const sendToInstance = useCallback((instanceId, message) => (
    managerRef.current.send(instanceId, message)
  ), []);
```

- [ ] **Step 5: Start the heartbeat and tear down on unmount**

```javascript
  useEffect(() => {
    const mgr = managerRef.current;
    mgr.startHeartbeat();
    return () => mgr.destroyAll();
  }, []);
```

- [ ] **Step 6: Fix the auto-connect effect to respect intent**

Replace the effect that reads `wsRefs.current[activeInstanceId]`:

```javascript
  // Selecting a tab is consent to connect it, including one the user previously
  // disconnected. But a connection that is already up, coming up, or backing off
  // must be left alone.
  useEffect(() => {
    if (!activeInstanceId) return;
    const instance = instancesRef.current.find((i) => i.id === activeInstanceId);
    if (!instance) return;
    const conn = managerRef.current.get(activeInstanceId);
    const busy = conn && (
      conn.state === CONNECTION_STATES.CONNECTING ||
      conn.state === CONNECTION_STATES.CONNECTED ||
      conn.state === CONNECTION_STATES.RECONNECTING
    );
    if (!busy) connectInstance(activeInstanceId);
  }, [activeInstanceId, connectInstance]);
```

Note `instances` is gone from the dependency array — it is read through `instancesRef`. Leaving it in re-fires this effect on every `lastViewedAt` write.

- [ ] **Step 7: Delete the LRU eviction from `switchInstance`**

Remove the entire `// Manage concurrent connections (keep max 3)` block and the `MAX_CONCURRENT_CONNECTIONS` constant. With the cap equal to the tab cap (Task 6), selecting a tab can never exceed it, so nothing needs sacrificing — and this block was what silently killed sockets on busy tabs, losing their completion notifications.

In the same function, rename the `lastUsedAt` write to `lastViewedAt` (keep reading `lastUsedAt` as a fallback for already-persisted instances, as the `isViewIdle` code above does).

- [ ] **Step 8: Verify the public API is unchanged**

```bash
cd app && node -e "
const src = require('fs').readFileSync('src/contexts/InstanceContext.jsx','utf8');
const body = src.slice(src.indexOf('const value = useMemo'));
const keys = [...body.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*)[,:]/gm)].map(m => m[1]);
console.log(keys.join('\n'));
" > /tmp/context-api-after.txt
diff /tmp/context-api-before.txt /tmp/context-api-after.txt && echo "PASS: context API unchanged"
```

Expected: `PASS: context API unchanged`. Any diff is a consumer-breaking change — fix it rather than updating the consumer.

- [ ] **Step 9: Verify the maps are gone**

```bash
grep -c "wsRefs\|reconnectAttemptsRef\|reconnectTimeoutsRef\|connectionTimeoutsRef\|heartbeatIntervalsRef\|pongTimeoutsRef" app/src/contexts/InstanceContext.jsx || echo "PASS: all socket maps removed"
wc -l app/src/contexts/InstanceContext.jsx
```

Expected: `PASS: all socket maps removed`, and the file meaningfully shorter than 882 lines.

- [ ] **Step 10: Build, lint, test**

```bash
cd app && npm run build 2>&1 | grep -E "✓ built|error"
cd .. && npm run lint 2>&1 | tail -2
cd app && npm test 2>&1 | tail -4
```

Expected: build succeeds, lint 0 errors, all tests pass.

- [ ] **Step 11: Commit**

```bash
git add app/src/contexts/InstanceContext.jsx
git commit -m "refactor(app): delegate all socket state to ConnectionManager

InstanceContext held eight parallel instanceId-keyed maps mutated from sixteen
places, with no owner. A socket's existence was implied only by a map entry, so
any path that deleted or overwrote that entry while the socket was open leaked
it permanently - nothing could reach it to close it, and the duplicate guard
then opened another. That is the whole of issue #8, and it is why the
duplication factor grew over time.

Those maps are now one map of connection objects. The public context API is
unchanged, verified by diffing the exported keys.

Also removes the LRU eviction that killed sockets on busy tabs to stay under a
cap of 3 - taking their task-complete notifications with them - and drops
instances from the auto-connect effect's dependencies so it no longer re-fires
on every lastViewedAt write."
```

---

### Task 6: Align the tab cap to the relay's instance cap

**Files:**
- Modify: `app/src/contexts/InstanceContext.jsx` (`addInstance`)
- Modify: `app/src/api/relay-api.js` (if a health helper is needed)

**Interfaces:**
- Consumes: `maxInstances` from `GET /api/health` (added by the relay plan, Task 4). Falls back to `DEFAULT_MAX_INSTANCES` when absent, so this task does not depend on that PR landing first.
- Produces: `addInstance(...)` returns `{ error: 'instance-limit', limit }` instead of an instance when the cap is reached

- [ ] **Step 1: Write the failing test**

Create `app/src/services/__tests__/instanceLimit.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { canAddInstance, DEFAULT_MAX_INSTANCES } from '../instanceLimit';

describe('canAddInstance', () => {
  it('allows up to the limit', () => {
    expect(canAddInstance(0, 10)).toEqual({ ok: true });
    expect(canAddInstance(9, 10)).toEqual({ ok: true });
  });

  it('refuses at the limit, reporting it', () => {
    expect(canAddInstance(10, 10)).toEqual({ ok: false, reason: 'instance-limit', limit: 10 });
  });

  it('falls back to the default when the relay limit is unknown', () => {
    expect(canAddInstance(10, null)).toEqual({
      ok: false, reason: 'instance-limit', limit: DEFAULT_MAX_INSTANCES,
    });
    expect(DEFAULT_MAX_INSTANCES).toBe(10);
  });

  it('honours a relay limit different from the default', () => {
    expect(canAddInstance(10, 20)).toEqual({ ok: true });
    expect(canAddInstance(20, 20)).toEqual({ ok: false, reason: 'instance-limit', limit: 20 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/services/__tests__/instanceLimit.test.js`
Expected: FAIL — cannot resolve `../instanceLimit`

- [ ] **Step 3: Write the implementation**

Create `app/src/services/instanceLimit.js`:

```javascript
export const DEFAULT_MAX_INSTANCES = 10;

/**
 * The relay is authoritative: it is the side that enforces the cap and throws
 * "Maximum instances (N) reached". The app mirrors it so a tab that cannot work
 * is never created, and falls back to the default until health is fetched.
 */
export function canAddInstance(currentCount, relayLimit) {
  const limit = Number.isFinite(relayLimit) && relayLimit > 0
    ? relayLimit
    : DEFAULT_MAX_INSTANCES;
  if (currentCount >= limit) {
    return { ok: false, reason: 'instance-limit', limit };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/services/__tests__/instanceLimit.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Track the relay limit and enforce it in `addInstance`**

In `InstanceContext.jsx`, add state and a fetch:

```javascript
  const [relayMaxInstances, setRelayMaxInstances] = useState(null);

  useEffect(() => {
    healthApi.check()
      .then((res) => {
        const max = res?.data?.maxInstances;
        if (Number.isFinite(max)) setRelayMaxInstances(max);
      })
      .catch(() => { /* fall back to the default */ });
  }, []);
```

At the top of `addInstance`, after the existing duplicate-`customId` check:

```javascript
    const allowed = canAddInstance(instances.length, relayMaxInstances);
    if (!allowed.ok) {
      return { error: allowed.reason, limit: allowed.limit };
    }
```

- [ ] **Step 6: Surface it where instances are created**

In `app/src/components/instance/InstanceManager.jsx`, wherever `addInstance` is called, handle the refusal:

```javascript
    const created = addInstance(name, relayUrl, workingDir, color, null, cliType);
    if (created?.error === 'instance-limit') {
      alert(`Limit reached: the relay accepts at most ${created.limit} instances. Stop one first.`);
      return;
    }
```

- [ ] **Step 7: Build, lint, test, commit**

```bash
cd app && npm run build 2>&1 | grep -E "✓ built|error"
cd .. && npm run lint 2>&1 | tail -2
cd app && npm test 2>&1 | tail -4
cd ..
git add app/src/services/instanceLimit.js app/src/services/__tests__/instanceLimit.test.js app/src/contexts/InstanceContext.jsx app/src/components/instance/InstanceManager.jsx
git commit -m "feat(app): align the tab limit to the relay's instance cap

Three unaligned numbers before: unlimited tabs in the app, 10 PTYs on the relay,
and a socket pool of 3 with no measurement behind it. The app now mirrors the
relay's limit, read from /api/health with a fallback of 10, and refuses to
create a tab that could not work - saying why instead of failing at set-instance.

With the tab cap equal to the socket cap, selecting a tab can never exceed the
socket cap, which is what allowed the LRU eviction to be deleted."
```

---

### Task 7: Stop actions must not auto-reconnect into a restart

**Files:**
- Modify: `app/src/pages/Settings.jsx`

**Interfaces:**
- Consumes: `disconnectInstance` (existing), plus a new `disconnectAllInstances` on the context
- Produces: `disconnectAllInstances(reason = 'user')` on the context value

- [ ] **Step 1: Expose `disconnectAllInstances`**

In `InstanceContext.jsx`:

```javascript
  const disconnectAllInstances = useCallback((reason = 'user') => {
    managerRef.current.disconnectAll(reason);
  }, []);
```

Add `disconnectAllInstances,` to the `value` object, in the "Multi-instance actions" group. This *is* a public-API addition, so update the baseline file from Task 5 Step 1 rather than treating the diff as a failure:

```bash
echo "disconnectAllInstances" >> /tmp/context-api-before.txt
```

- [ ] **Step 2: Disconnect before stopping, in the bulk handler**

In `Settings.jsx`, `handleStopAllInstances` — add before the API call:

```javascript
      // Disconnect first, with reason 'user', so nothing auto-reconnects and
      // re-sends set-instance. That would arm a deferred start on the relay and
      // bring back every CLI the user just stopped.
      disconnectAllInstances('user');
```

- [ ] **Step 3: Same for the single-instance handler**

In `handleStopInstance`, before `await instancesApi.delete(instanceId)`:

```javascript
      disconnectInstance(instanceId);
```

- [ ] **Step 4: Pull both from the context**

Update the destructure at the top of `Settings.jsx`:

```javascript
  const {
    instances: appInstances,
    addInstance,
    connectInstance,
    switchInstance,
    disconnectInstance,
    disconnectAllInstances,
  } = useInstance();
```

Add them to the `useCallback` dependency arrays of both handlers.

- [ ] **Step 5: Verify recovery still works end-to-end**

With a DEV relay running (`npm run dev:relay`) and the app open:

1. Create two instances with working directories; confirm both connect and their CLIs start.
2. Settings → **Stop all CLI instances**. Confirm the relay list empties and, critically, **switch tabs a few times** — no CLI may reappear. (Before this change every one came back.)
3. Start one instance again from the instance manager; confirm it runs.
4. Settings → **Reset App Data & Reload**. The app comes back with no tabs.
5. Settings → Relay Instances → **Connect** on the surviving relay session. Confirm a tab is recreated with the *same* instanceId, connects, and replays the previous scrollback.

Record the result of each step in the commit message if any deviates.

- [ ] **Step 6: Lint, test, commit**

```bash
npm run lint 2>&1 | tail -2
cd app && npm test 2>&1 | tail -4 && cd ..
git add app/src/pages/Settings.jsx app/src/contexts/InstanceContext.jsx
git commit -m "fix(app): stopping sessions no longer resurrects them

DELETE /api/instances removes the PTY managers but never closes the sockets, so
the app stayed attached to nothing and the next set-instance - any tab switch,
resume or reconnect - armed a deferred start and brought every CLI back.

The Stop actions now disconnect the affected connections with reason 'user'
first, so nothing auto-reconnects into a restart. The relay-side half, which
declines to auto-start a session that was explicitly stopped, is in the relay
lifecycle PR; either half alone is an improvement.

Verified that session recovery from Settings still recreates a tab with the
relay's instanceId and replays its scrollback."
```

---

### Task 8: Verify the original bug is gone, then open the PR

**Files:** none

- [ ] **Step 1: Full suite**

```bash
npm run lint 2>&1 | tail -3
cd app && npm test 2>&1 | tail -6
cd app && npm run build 2>&1 | grep -E "✓ built|error"
```

Expected: 0 lint errors; all tests pass; build succeeds.

- [ ] **Step 2: Reproduce the #8 conditions and confirm a duplication factor of 1**

This is the acceptance test for the whole PR. With a DEV relay running and the app open on a phone or in a browser tab:

1. Open one instance and let its CLI produce output (`ls -la`, or anything long).
2. Background the app for ~40s, foreground it. Repeat **five times** — this is the late-close path that leaked one socket per cycle.
3. On the relay host, check the listener count for that instance:

```bash
curl -s http://localhost:4503/api/instances | python3 -m json.tool | grep -E "instanceId|listenerCount|running"
```

Expected: `listenerCount: 1` for the instance. Before this work it grew by one per cycle, which was the duplication factor.

4. Confirm in the terminal view that output appears **once**.

- [ ] **Step 3: Verify Disconnect now sticks**

Disconnect the active instance from the UI. Expected: it stays `disconnected` — it must not flip to `connecting` on its own. Then select the tab: it reconnects.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin fix/client-connection-layer
gh pr create --base main --title "fix(app): own the WebSocket lifecycle per instance (#8)" --body "$(cat <<'BODY'
Implements PR 2 of `docs/superpowers/specs/2026-07-26-instance-connection-lifecycle-design.md`. Fixes #8 at its source.

## Root cause

`InstanceContext` tracked sockets in a single slot per instance, and a socket's existence was implied only by that map entry. Any path that deleted or overwrote the entry while the socket was still `OPEN` leaked it permanently — nothing held a reference, so nothing could close it, and the duplicate-connection guard then opened another. Eight parallel `instanceId`-keyed maps, mutated from sixteen places in one 882-line file, with no owner.

## Change

One `InstanceConnection` per instance owns its socket and every timer belonging to it; the object *is* the reference, so there is no entry to lose. A `ConnectionManager` owns the map and one shared heartbeat.

| Also fixed | Was |
|---|---|
| Disconnect sticks | Flipped straight back to `connecting` — the auto-connect effect re-fired on every state write |
| Heartbeat timeout reconnects | Closed with a clean `4000`, read as intentional, instance went dark |
| Every tab can notify | LRU eviction killed sockets on busy tabs, losing their `task-complete` |
| Tab cap = relay cap | Unlimited tabs / 10 PTYs / 3 sockets, none aligned |
| Idle disconnect after 1h | — |
| Stop no longer resurrects sessions | Every stopped CLI came back on the next tab switch |

## Testing

Vitest, added here — `npm run test:app` had never worked, because `app/` had no `test` script. The connection layer takes an injected socket and clock, so every transition is covered without a browser, including the late-close-after-supersede case that caused #8.

Acceptance test: five background/foreground cycles leave `listenerCount: 1`. It previously grew by one per cycle.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 5: Run the correctness review before merging**

Per the repo's global instruction, `/code-review` must pass before any merge. Report findings and fix confirmed/plausible ones first.

---

## Self-Review

**Spec coverage** — every PR 2 item maps to a task:

| Spec item | Task |
|---|---|
| `InstanceConnection` owning socket + timers, state machine | 1, 2, 3 |
| Handshake completes on `pty-status`; attempts reset there | 1, 2 |
| `ConnectionManager`, single shared heartbeat | 4 |
| `InstanceContext` delegation, 8 maps → 1 | 5 |
| Callback-stability rule | 5 (Steps 4, 6) |
| Cap aligned to 10, read from `/api/health` | 6 |
| LRU eviction removed | 5 (Step 7) |
| `user` / `idle` / `dropped` reasons | 3 |
| Idle disconnect, timestamp-based, 4 conditions across 2 units | 3 (2 conditions), 4 (`isViewIdle`) |
| `destroyAll()` on unmount | 5 (Step 5) |
| Cap-aware restore | 6 (Steps 5–6) |
| Stop actions disconnect first | 7 |
| Vitest + the required transition cases | 0, 1, 2, 3 |
| Public API unchanged | 5 (Step 8 diff gate) |

**Type consistency** — `CONNECTION_STATES`, `disconnectReason`, `isIdleSince`, `isViewIdle`, `connectedCount`, `destroyAll`, `disconnectAll`, `canAddInstance`, `DEFAULT_MAX_INSTANCES`, `IDLE_DISCONNECT_MS` are used with identical names and signatures across every task that references them. `disconnect(reason)` takes `'user' | 'idle'` everywhere; `'dropped'` is set only internally by `_drop()`.

**Deliberate deviation flagged:** Task 7 Step 1 adds `disconnectAllInstances` to the context value, which the Task 5 Step 8 diff gate would otherwise reject. The step updates the baseline explicitly rather than silently.
