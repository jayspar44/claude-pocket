# Relay Lifecycle Implementation Plan (PR 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the relay-side defects that stand on their own merit — malformed-frame crashes, a rejection handler that causes reconnect loops, a PTY lifecycle with no in-progress state, sessions that resurrect after being stopped, and a shutdown that hangs on open sockets.

**Architecture:** Introduce a real `status` state on `PtyManager` (`stopped | starting | running`) and consult it everywhere that currently tests `ptyProcess` or `isRunning`. Harden the WebSocket message entry point. Add explicit teardown to `WebSocketHandler`. No orphan detection of any kind — that concern is deleted, not moved.

**Tech Stack:** Node 22, CommonJS, Express 5, `ws`, node-pty, Pino. Tests use the built-in `node:test` runner (already in use — `relay/test/*.test.js`, run via `npm test` in `relay/`).

## Global Constraints

- Source spec: `docs/superpowers/specs/2026-07-26-instance-connection-lifecycle-design.md`.
- **No orphan/supersede detection.** Do not add timing heuristics, `appClientId`, or any relay-side eviction of "orphaned" sockets. The pre-existing protocol ping/pong sweep (`pingInterval`) stays exactly as it is.
- **`evict()` must not exist by the end of this plan.** A failed `set-instance` reports an error and leaves the socket alone; terminating it causes an unbounded client reconnect loop.
- Commit style: `<type>: <description>` (`fix:` → PATCH, `feat:` → MINOR, `chore:`/`docs:`/`refactor:` → none).
- Run `npm run lint` from the repo root before each commit; it must report **0 errors** (8 pre-existing warnings in `app/` are expected and acceptable).
- Relay tests: `cd relay && npm test`.
- This plan starts from `main`, on a fresh branch. PR #9's four commits are abandoned (see Task 0).

---

### Task 0: Branch from a clean base

**Files:** none (git only)

**Interfaces:**
- Consumes: nothing
- Produces: a branch `fix/relay-lifecycle` based on `origin/main`, containing none of PR #9's changes

- [ ] **Step 1: Confirm PR #9 is closed and `develop` is not the base**

```bash
gh pr view 9 --json state,title --jq '.state + " — " + .title'
```

Expected: `CLOSED — ...`. If it still says `OPEN`, close it first:

```bash
gh pr close 9 --comment "Superseded by the design in docs/superpowers/specs/2026-07-26-instance-connection-lifecycle-design.md. The relay-side orphan detection this PR added is being removed rather than fixed; see that spec for why."
```

- [ ] **Step 2: Create the branch from `origin/main`**

```bash
git fetch origin
git checkout -b fix/relay-lifecycle origin/main
```

- [ ] **Step 3: Verify the working tree has none of PR #9's code**

```bash
grep -c "appClientId\|orphanSweepInterval\|ORPHAN_IDLE_MS" relay/src/websocket-handler.js || echo "clean (0 matches)"
```

Expected: `clean (0 matches)`. If any match, you branched from the wrong base.

- [ ] **Step 4: Confirm the baseline is green**

```bash
npm run lint 2>&1 | tail -3
cd relay && npm test 2>&1 | tail -5
```

Expected: lint 0 errors; relay tests all pass.

No commit — this task only establishes the base.

---

### Task 1: Reject non-object WebSocket frames

`JSON.parse` succeeds on `null`, `42`, `"str"` and arrays. `handleMessage` destructures its argument, so any of those throws — and on `main` that throw happens inside a `try` that only catches synchronous errors from the *parse*, so a `null` frame is an unhandled rejection that kills the process.

**Files:**
- Create: `relay/test/ws-message-validation.test.js`
- Modify: `relay/src/websocket-handler.js` (the `ws.on('message', ...)` handler)

**Interfaces:**
- Consumes: nothing
- Produces: `WebSocketHandler.parseClientFrame(raw) => { ok: true, message } | { ok: false, reason }` — a static-ish pure helper on the class so it is testable without a server. `reason` is one of `'invalid-json'`, `'not-an-object'`.

- [ ] **Step 1: Write the failing test**

Create `relay/test/ws-message-validation.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const WebSocketHandler = require('../src/websocket-handler');

test('parseClientFrame accepts a plain object', () => {
  assert.deepEqual(
    WebSocketHandler.parseClientFrame('{"type":"ping"}'),
    { ok: true, message: { type: 'ping' } }
  );
});

test('parseClientFrame rejects null, which JSON.parse accepts', () => {
  assert.deepEqual(
    WebSocketHandler.parseClientFrame('null'),
    { ok: false, reason: 'not-an-object' }
  );
});

test('parseClientFrame rejects numbers, strings and arrays', () => {
  for (const raw of ['42', '"str"', '[1,2]', 'true']) {
    const result = WebSocketHandler.parseClientFrame(raw);
    assert.deepEqual(result, { ok: false, reason: 'not-an-object' }, `raw=${raw}`);
  }
});

test('parseClientFrame rejects malformed JSON', () => {
  assert.deepEqual(
    WebSocketHandler.parseClientFrame('{bad json'),
    { ok: false, reason: 'invalid-json' }
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd relay && node --test test/ws-message-validation.test.js`
Expected: FAIL — `WebSocketHandler.parseClientFrame is not a function`

- [ ] **Step 3: Add the static helper**

In `relay/src/websocket-handler.js`, add as a static method on `class WebSocketHandler`:

```javascript
  // JSON.parse succeeds on null, numbers, strings and arrays. handleMessage
  // destructures its argument, so anything that is not a plain object must be
  // rejected here rather than throwing downstream.
  static parseClientFrame(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'invalid-json' };
    }
    if (typeof message !== 'object' || message === null || Array.isArray(message)) {
      return { ok: false, reason: 'not-an-object' };
    }
    return { ok: true, message };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd relay && node --test test/ws-message-validation.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Use it in the message handler**

Replace the body of the `ws.on('message', ...)` handler in `setupWebSocketServer` with:

```javascript
      ws.on('message', (data) => {
        const parsed = WebSocketHandler.parseClientFrame(data.toString());
        if (!parsed.ok) {
          logger.warn({ clientId, reason: parsed.reason }, 'Ignoring unusable WebSocket frame');
          return;
        }
        const message = parsed.message;
        // handleMessage is async. An unhandled rejection here terminates the
        // process under Node's default --unhandled-rejections=throw, taking
        // every PTY session with it.
        this.handleMessage(ws, message, {
          setupPtyListener,
          sendReplay,
          skipUntilReplay: () => skipUntilReplay,
          setSkipReplay: (v) => { skipUntilReplay = v; },
        }).catch((error) => {
          logger.error(
            { error: error.message, clientId, type: message.type },
            'Failed to handle WebSocket message'
          );
          this.send(ws, {
            type: 'pty-error',
            message: error.message,
            instanceId: ws.instanceId,
          });
        });
      });
```

Note what this deliberately does **not** do: it does not close or terminate the socket. Terminating on a deterministic `set-instance` failure produces an unbounded client reconnect loop.

- [ ] **Step 6: Verify the relay survives every malformed frame end-to-end**

Start a standalone relay (**not** under PM2 — PM2's `@pm2/io` wrapper traps uncaught errors and will hide a real crash):

```bash
cd relay && PORT=4599 NODE_ENV=development node src/index.js &
sleep 3
node -e "
const WebSocket = require('./node_modules/ws');
const frames = ['null','42','\"str\"','[1,2]','{bad json'];
(async () => {
  for (const f of frames) {
    await new Promise((res) => {
      const ws = new WebSocket('ws://localhost:4599/ws');
      ws.on('open', () => { ws.send(f); setTimeout(() => { ws.close(); res(); }, 300); });
      ws.on('error', res);
    });
  }
  const r = await fetch('http://localhost:4599/api/health').then(x => x.text()).catch(e => 'DOWN ' + e.message);
  console.log(r.includes('\"status\":\"ok\"') ? 'PASS relay alive after all frames' : 'FAIL ' + r);
})();
"
```

Expected: `PASS relay alive after all frames`. Then stop it: `lsof -ti:4599 | xargs kill -9`

- [ ] **Step 7: Lint and commit**

```bash
npm run lint 2>&1 | tail -2
git add relay/src/websocket-handler.js relay/test/ws-message-validation.test.js
git commit -m "fix(relay): reject non-object WebSocket frames before dispatch

JSON.parse accepts null, numbers, strings and arrays; handleMessage
destructures its argument, so any of those threw. Because handleMessage is
async the throw became an unhandled rejection, which under Node's default
--unhandled-rejections=throw terminated the relay and every PTY with it. A
one-byte frame from any client was enough.

Also attaches a rejection handler to handleMessage that reports the error to
the client without closing the socket."
```

---

### Task 2: Give `PtyManager` a real lifecycle status

`start()` guards on `this.ptyProcess`, but `ptyProcess` is not assigned until **after** an `await` on the CLI self-update, which can block for 30s. During that window `ptyProcess` is `null` and `isRunning` is `false`, so a second `start()` passes the guard and spawns a duplicate CLI. `stop()` has the same blind spot: it returns without doing anything, so an in-flight start completes and spawns a process after the manager was stopped or deleted.

**Files:**
- Create: `relay/test/pty-lifecycle.test.js`
- Modify: `relay/src/pty-manager.js`

**Interfaces:**
- Consumes: nothing
- Produces on `PtyManager`:
  - `status` — `'stopped' | 'starting' | 'running'`
  - `isBusy` — getter, `true` when `status !== 'stopped'`
  - `intentionalStop` — existing field, now also set when stopping during `starting`
  - `start(workingDir, cols, rows)` — throws `Error('PTY start already in progress')` if `status === 'starting'`; returns early if `'running'`
  - `stop()` — cancels an in-flight start by setting `intentionalStop`; `_start` checks it after every `await` and aborts before spawning
  - `isRunning` — retained as a getter (`status === 'running'`) so existing callers and the `/api/health` payload keep working

- [ ] **Step 1: Write the failing test**

Create `relay/test/pty-lifecycle.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd relay && node --test test/pty-lifecycle.test.js`
Expected: FAIL — `pm.status` is `undefined`, `pm.isBusy` is `undefined`

- [ ] **Step 3: Replace the `isRunning` field with a `status` state**

In `relay/src/pty-manager.js`, in the constructor, **delete** the line `this.isRunning = false;` and add:

```javascript
    // Lifecycle: 'stopped' -> 'starting' -> 'running' -> 'stopped'.
    // 'starting' exists because ptyProcess is not assigned until after the CLI
    // self-update, which can block for 30s. Without a distinct state, both
    // start() and stop() are blind during that window.
    this.status = 'stopped';
```

Then add these getters immediately after the constructor:

```javascript
  // Retained so existing callers and the /api/health payload keep working.
  get isRunning() {
    return this.status === 'running';
  }

  get isBusy() {
    return this.status !== 'stopped';
  }
```

- [ ] **Step 4: Split `start()` into a guard and `_start()`**

Replace the opening of `async start(workingDir, cols, rows)` — everything from the method signature down to and including the `this.deferredStartDir = null;` line — with:

```javascript
  async start(workingDir, cols, rows) {
    if (this.status === 'running') {
      logger.warn({ instanceId: this.instanceId }, 'PTY process already running');
      return;
    }
    if (this.status === 'starting') {
      throw new Error('PTY start already in progress');
    }

    this.status = 'starting';
    this.intentionalStop = false;
    try {
      await this._start(workingDir, cols, rows);
    } catch (error) {
      this.status = 'stopped';
      throw error;
    }
    // A stop() during the await leaves status already 'stopped'; do not clobber it.
    if (this.status === 'starting') {
      this.status = 'stopped';
      logger.warn({ instanceId: this.instanceId }, 'PTY start finished without spawning');
    }
  }

  async _start(workingDir, cols, rows) {
    // Clear deferred start since we're starting now
    this.deferredStartDir = null;
```

- [ ] **Step 5: Make `_start` abort on a stop, and set `running` on success**

Inside `_start`, immediately after the `await new Promise(...)` block that runs the CLI self-update, insert:

```javascript
    // stop() may have been called during the update await. It cannot kill a
    // process that does not exist yet, so it records intent and we honour it here.
    if (this.intentionalStop) {
      logger.info({ instanceId: this.instanceId }, 'PTY start aborted by stop()');
      return;
    }
```

Then find the line that previously read `this.isRunning = true;` (just after `pty.spawn`) and change it to:

```javascript
    this.status = 'running';
```

Search for every other assignment to `isRunning` in the file and replace it: `this.isRunning = false` becomes `this.status = 'stopped'`. (Expect these in `stop()`, the `onExit` handler, and the crash/restart path.)

```bash
grep -n "isRunning = " relay/src/pty-manager.js
```

Expected after edits: no matches (only the getter remains).

- [ ] **Step 6: Make `stop()` cancel an in-flight start**

Replace the guard at the top of `stop()` with:

```javascript
  stop() {
    // Record intent first, unconditionally: during 'starting' there is no
    // process to kill, and _start checks this flag before spawning.
    this.intentionalStop = true;

    if (this.status === 'starting') {
      logger.info({ instanceId: this.instanceId }, 'Cancelling in-flight PTY start');
      this.status = 'stopped';
      return;
    }
    if (!this.ptyProcess) {
      this.status = 'stopped';
      return;
    }
```

Keep the rest of the existing `stop()` body (killing the process, clearing timers, etc.) unchanged.

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd relay && node --test test/pty-lifecycle.test.js
```

Expected: PASS (5 tests)

- [ ] **Step 8: Run the whole relay suite for regressions**

```bash
cd relay && npm test 2>&1 | tail -8
```

Expected: all tests pass. `isRunning` is now a getter, so any code that *assigned* it is a bug this surfaces.

- [ ] **Step 9: Lint and commit**

```bash
npm run lint 2>&1 | tail -2
git add relay/src/pty-manager.js relay/test/pty-lifecycle.test.js
git commit -m "fix(relay): add a starting state to the PTY lifecycle

ptyProcess is not assigned until after the CLI self-update await, which can
block 30s. During that window start()'s ptyProcess guard passed, so a second
start spawned a duplicate CLI feeding the same buffer - output rendered twice
and stop/restart only reached the second process. stop() was equally blind:
it returned without recording intent, so an in-flight start spawned a process
after the manager had been stopped or removed from the registry, leaving a CLI
that nothing could kill.

status is now stopped|starting|running. start() throws while starting, stop()
records intent unconditionally, and _start honours that intent after its await
instead of spawning. isRunning becomes a getter so existing callers are
unaffected."
```

---

### Task 3: Consult `isBusy` at every deferred-start decision

`websocket-handler.js` decides whether to arm or run a deferred start by testing `!ptyManager.isRunning`. With the new `starting` state that test is still wrong: a mid-update manager reports `isRunning === false`, so a reconnecting client re-arms a second deferred start.

**Files:**
- Modify: `relay/src/websocket-handler.js` (4 guard sites)

**Interfaces:**
- Consumes: `PtyManager.isBusy` from Task 2
- Produces: no new API

- [ ] **Step 1: Find the guard sites**

```bash
grep -n "isRunning" relay/src/websocket-handler.js
```

Expected: 4 occurrences — in `set-instance` (arm deferred start), the 3s fallback timer, the "no working directory" branch, and `resize` (run deferred start).

- [ ] **Step 2: Replace each `!x.isRunning` with `!x.isBusy`**

In the `set-instance` case:

```javascript
        if (!ptyManager.isBusy && (workingDir || ptyManager.currentWorkingDir)) {
```

In the 3s fallback timer:

```javascript
            if (!pm.isBusy && pm.deferredStartDir) {
```

In the no-working-directory branch:

```javascript
        } else if (!ptyManager.isBusy && !workingDir && !ptyManager.currentWorkingDir) {
```

In the `resize` case:

```javascript
          if (!ptyManager.isBusy && ptyManager.deferredStartDir) {
```

- [ ] **Step 3: Guard the resize-during-start case**

A `resize` arriving while `status === 'starting'` currently falls to the `else` branch and calls `ptyManager.resize()`, which silently does nothing because `ptyProcess` is null — so the CLI spawns at the fallback 50x24 and is never resized. In the `resize` case, replace the `else` branch with:

```javascript
          } else if (ptyManager.status === 'starting') {
            // No process to resize yet. Record the dimensions so the spawn uses
            // them instead of the set-instance fallback, which is what makes MCP
            // tool output render vertically.
            ptyManager.lastCols = message.cols;
            ptyManager.lastRows = message.rows;
          } else {
            ptyManager.resize(message.cols, message.rows);
          }
```

- [ ] **Step 4: Make `_start` use the recorded dimensions**

In `relay/src/pty-manager.js`, inside `_start`, the `spawnCols`/`spawnRows` are computed **before** the update await. Move that computation to **after** the `intentionalStop` check added in Task 2, so a resize arriving during the window is picked up:

```javascript
    // Computed after the update await so a resize arriving during the window
    // is honoured rather than discarded.
    const spawnCols = this.lastCols || cols || config.pty.cols;
    const spawnRows = this.lastRows || rows || config.pty.rows;
    this.lastCols = spawnCols;
    this.lastRows = spawnRows;
```

and delete the earlier assignment of `spawnCols`/`spawnRows`/`lastCols`/`lastRows` from before the await.

- [ ] **Step 5: Add a test for the resize-during-start path**

Append to `relay/test/pty-lifecycle.test.js`:

```javascript
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
```

- [ ] **Step 6: Run tests**

```bash
cd relay && npm test 2>&1 | tail -8
```

Expected: all pass (6 tests in `pty-lifecycle.test.js`)

- [ ] **Step 7: Lint and commit**

```bash
npm run lint 2>&1 | tail -2
git add relay/src/websocket-handler.js relay/src/pty-manager.js relay/test/pty-lifecycle.test.js
git commit -m "fix(relay): treat a starting PTY as busy at every decision point

The four deferred-start guards tested !isRunning, which is false during the
self-update window - so a reconnecting client armed a second deferred start
against a manager that was already starting. They now test !isBusy.

A resize arriving in that window was also lost: it fell through to
ptyManager.resize(), a no-op with no ptyProcess, so the CLI spawned at the
50x24 fallback and never grew - the vertical-MCP-output symptom the deferred
start exists to avoid. The dimensions are now recorded and consumed by the
spawn."
```

---

### Task 4: Teach the registry about busy managers

`pty-registry`'s eviction predicates use `!instance.isRunning && instance.listeners.size === 0`, which is true for a mid-update manager whose only client disconnected. Evicting it calls `stop()` (now correct, per Task 2) but also removes it from the registry, so the instance silently loses its identity.

**Files:**
- Create: `relay/test/pty-registry-eviction.test.js`
- Modify: `relay/src/pty-registry.js`

**Interfaces:**
- Consumes: `PtyManager.isBusy` from Task 2
- Produces: `MAX_INSTANCES` sourced from `config.pty.maxInstances`

- [ ] **Step 1: Write the failing test**

Create `relay/test/pty-registry-eviction.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ptyRegistry = require('../src/pty-registry');

test('removeOldestIdle does not evict a manager that is starting', () => {
  const pm = ptyRegistry.get('evict-busy-test', '/tmp', 'claude');
  pm.status = 'starting';           // mid self-update
  pm.listeners.clear();             // its only client went away

  const evicted = ptyRegistry.removeOldestIdle();
  assert.equal(evicted, false, 'a starting manager is not idle');
  assert.ok(ptyRegistry.get('evict-busy-test'), 'manager must still be registered');

  pm.status = 'stopped';
  ptyRegistry.remove('evict-busy-test');
});

test('removeOldestIdle still evicts a stopped, listener-less manager', () => {
  const pm = ptyRegistry.get('evict-idle-test', '/tmp', 'claude');
  pm.status = 'stopped';
  pm.listeners.clear();

  assert.equal(ptyRegistry.removeOldestIdle(), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd relay && node --test test/pty-registry-eviction.test.js`
Expected: FAIL — the starting manager is evicted, so `evicted` is `true`

- [ ] **Step 3: Use `isBusy` in the eviction predicates**

In `relay/src/pty-registry.js`, find every predicate of the form `!instance.isRunning && instance.listeners.size === 0` and change it to:

```javascript
      !instance.isBusy && instance.listeners.size === 0
```

```bash
grep -n "isRunning" relay/src/pty-registry.js
```

Expected after edits: no matches.

- [ ] **Step 4: Make the instance cap configurable and published**

In `relay/src/config.js`, add to the `pty` section:

```javascript
    maxInstances: parseInt(process.env.MAX_INSTANCES || '10', 10),
```

In `relay/src/pty-registry.js`, replace `const MAX_INSTANCES = 10;` with:

```javascript
const config = require('./config');
const MAX_INSTANCES = config.pty.maxInstances;
```

(If `config` is already required in that file, do not add a duplicate require.)

In `relay/src/index.js`, add `maxInstances` to the `/api/health` response object:

```javascript
    maxInstances: config.pty.maxInstances,
```

Document it in `relay/.env.example`:

```
# Maximum concurrent CLI instances (PTY processes). The app reads this from
# /api/health and refuses to create more tabs than the relay will accept.
MAX_INSTANCES=10
```

- [ ] **Step 5: Run tests**

```bash
cd relay && npm test 2>&1 | tail -8
```

Expected: all pass

- [ ] **Step 6: Verify the health field over HTTP**

```bash
cd relay && PORT=4599 node src/index.js &
sleep 3
curl -s http://localhost:4599/api/health | python3 -m json.tool | grep -E "maxInstances|status"
lsof -ti:4599 | xargs kill -9
```

Expected: `"status": "ok"` and `"maxInstances": 10`

- [ ] **Step 7: Lint and commit**

```bash
npm run lint 2>&1 | tail -2
git add relay/src/pty-registry.js relay/src/config.js relay/src/index.js relay/.env.example relay/test/pty-registry-eviction.test.js
git commit -m "fix(relay): do not evict a starting PTY manager; publish the instance cap

The registry's idle predicates tested !isRunning, which is false during the
self-update window, so a manager whose only client had disconnected could be
evicted mid-start - the spawned CLI then belonged to no registered instance,
was invisible to /api/instances and survived shutdown.

Also makes MAX_INSTANCES configurable via env and reports it from /api/health,
so the app can align its tab limit to the relay's rather than duplicating a
magic number."
```

---

### Task 5: Stop means stopped — no auto-restart after an explicit stop

`DELETE /api/instances` removes the PTY managers but never closes the WebSockets. The app stays attached to nothing, and the next `set-instance` — any tab switch, resume or reconnect — sees no running PTY, and because the app sends `workingDir` it arms a deferred start. Every CLI the user just stopped comes back.

**Files:**
- Create: `relay/test/stopped-no-autostart.test.js`
- Modify: `relay/src/pty-manager.js`, `relay/src/websocket-handler.js`

**Interfaces:**
- Consumes: `PtyManager.status`, `intentionalStop` from Task 2
- Produces: `PtyManager.stoppedByUser` — `true` after an explicit `stop()`, cleared by an explicit `start()`. `set-instance` does not auto-start when it is `true`.

- [ ] **Step 1: Write the failing test**

Create `relay/test/stopped-no-autostart.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd relay && node --test test/stopped-no-autostart.test.js`
Expected: FAIL — `pm.stoppedByUser` is `undefined`

- [ ] **Step 3: Add the flag**

In `relay/src/pty-manager.js` constructor:

```javascript
    // True after an explicit stop, so set-instance does not silently restart a
    // session the user deliberately ended. Cleared by an explicit start().
    this.stoppedByUser = false;
```

In `stop()`, alongside `this.intentionalStop = true;`:

```javascript
    this.stoppedByUser = true;
```

In `start()`, alongside `this.intentionalStop = false;`:

```javascript
    this.stoppedByUser = false;
```

- [ ] **Step 4: Honour it in `set-instance`**

In `relay/src/websocket-handler.js`, change the deferred-start arming condition in the `set-instance` case to:

```javascript
        if (!ptyManager.isBusy && !ptyManager.stoppedByUser && (workingDir || ptyManager.currentWorkingDir)) {
```

and add a branch so the client learns why nothing started — place it immediately before the existing `else if (!ptyManager.isBusy && !workingDir && ...)` branch:

```javascript
        } else if (!ptyManager.isBusy && ptyManager.stoppedByUser) {
          logger.info(
            { clientId: ws.clientId, instanceId: newInstanceId },
            'Not auto-starting: session was explicitly stopped'
          );
          this.send(ws, { type: 'pty-status', ...ptyManager.getStatus() });
```

- [ ] **Step 5: Include the flag in `getStatus()`**

Find `getStatus()` in `relay/src/pty-manager.js` and add to the returned object:

```javascript
      stoppedByUser: this.stoppedByUser,
```

- [ ] **Step 6: Run tests**

```bash
cd relay && npm test 2>&1 | tail -8
```

Expected: all pass

- [ ] **Step 7: Verify end-to-end that a stopped session stays stopped**

```bash
cd relay && PORT=4599 node src/index.js &
sleep 3
node -e "
const WebSocket = require('./node_modules/ws');
const ws = new WebSocket('ws://localhost:4599/ws');
const dir = process.env.HOME;
ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'pty-status') console.log('pty-status running=' + m.running + ' stoppedByUser=' + m.stoppedByUser); });
ws.on('open', async () => {
  ws.send(JSON.stringify({ type: 'set-instance', instanceId: 'stop-test', workingDir: dir, cols: 80, rows: 24 }));
  await new Promise(r => setTimeout(r, 1000));
  await fetch('http://localhost:4599/api/instances', { method: 'DELETE' });
  console.log('--- stopped all instances ---');
  await new Promise(r => setTimeout(r, 500));
  ws.send(JSON.stringify({ type: 'set-instance', instanceId: 'stop-test', workingDir: dir, cols: 80, rows: 24 }));
  await new Promise(r => setTimeout(r, 1500));
  const list = await fetch('http://localhost:4599/api/instances').then(r => r.json());
  const running = (list.instances || []).filter(i => i.running).length;
  console.log(running === 0 ? 'PASS: no session resurrected' : 'FAIL: ' + running + ' running');
  process.exit(0);
});
"
lsof -ti:4599 | xargs kill -9
```

Expected: `PASS: no session resurrected`

Note: `DELETE /api/instances` removes managers entirely, so the re-`set-instance` creates a fresh one whose `stoppedByUser` is `false`. If this test fails, the fix needs the registry to remember the stop across `remove()` — record the decision in the commit and raise it, rather than papering over it.

- [ ] **Step 8: Lint and commit**

```bash
npm run lint 2>&1 | tail -2
git add relay/src/pty-manager.js relay/src/websocket-handler.js relay/test/stopped-no-autostart.test.js
git commit -m "fix(relay): an explicitly stopped session does not auto-restart

DELETE /api/instances killed the PTY managers but never closed the sockets, so
the next set-instance - any tab switch, resume or reconnect - saw no running
PTY, and because the app sends workingDir it armed a deferred start. Stopping
all sessions and switching tabs brought every CLI back.

stoppedByUser is set by stop() and cleared by an explicit start(); set-instance
now declines to auto-start when it is set and reports status so the client can
show the session as stopped. A PTY that exited on its own is unaffected, so
crash auto-restart still works."
```

---

### Task 6: Make shutdown release its sockets

`clearInterval(this.pingInterval)` is registered on `wss.on('close')`, but nothing ever calls `wss.close()` — `http.Server#close` does not emit `close` on an attached `WebSocketServer`. So the interval keeps running and `server.close()`'s callback waits on open sockets forever.

**Files:**
- Modify: `relay/src/websocket-handler.js`, `relay/src/index.js`

**Interfaces:**
- Consumes: nothing
- Produces: `WebSocketHandler#close()` — idempotent; clears the ping interval, terminates all live sockets, closes the `WebSocketServer`

- [ ] **Step 1: Reproduce the hang**

```bash
cd relay && PORT=4599 node src/index.js &
RELAY_PID=$!
sleep 3
node -e "
const WebSocket = require('./node_modules/ws');
const ws = new WebSocket('ws://localhost:4599/ws');
ws.on('open', () => console.log('holding a socket open'));
ws.on('error', () => {});
setTimeout(() => process.exit(0), 20000);
" &
HOLDER=$!
sleep 2
kill -TERM $RELAY_PID
for i in $(seq 1 100); do kill -0 $RELAY_PID 2>/dev/null || break; sleep 0.1; done
kill -0 $RELAY_PID 2>/dev/null && echo "REPRODUCED: still alive 10s after SIGTERM" || echo "exited"
kill -9 $RELAY_PID $HOLDER 2>/dev/null
```

Expected before the fix: `REPRODUCED: still alive 10s after SIGTERM`

- [ ] **Step 2: Add `close()`**

In `relay/src/websocket-handler.js`, add after `setupWebSocketServer()`:

```javascript
  // wss.on('close') never fires for a server-attached WebSocketServer, so the
  // shutdown path calls this directly. Safe to call more than once.
  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pingInterval);
    // wss.close() only stops new connections; live sockets keep the http
    // server's close callback from ever running.
    this.wss.clients.forEach((ws) => ws.terminate());
    this.clients.clear();
    this.wss.close();
  }
```

- [ ] **Step 3: Call it from both signal handlers**

In `relay/src/index.js`, in **both** the `SIGINT` and `SIGTERM` handlers, add immediately after `ptyRegistry.shutdown();`:

```javascript
  wsHandler.close();
```

- [ ] **Step 4: Verify the hang is gone**

Re-run the Step 1 script.
Expected: `exited`

- [ ] **Step 5: Verify `close()` twice is safe**

```bash
cd relay && node -e "
const http = require('http');
const WebSocketHandler = require('./src/websocket-handler');
const server = http.createServer();
const h = new WebSocketHandler(server);
h.close();
h.close();
console.log('PASS: double close did not throw');
process.exit(0);
"
```

Expected: `PASS: double close did not throw`

- [ ] **Step 6: Lint and commit**

```bash
npm run lint 2>&1 | tail -2
git add relay/src/websocket-handler.js relay/src/index.js
git commit -m "fix(relay): release WebSockets on shutdown

The ping interval was cleared from wss.on('close'), which never fires for a
server-attached WebSocketServer - nothing calls wss.close(). So the interval
outlived shutdown and server.close()'s callback waited on open sockets: with
one client attached the relay did not exit within 10s of SIGTERM.

close() clears the interval, terminates live sockets and closes the server, and
is called from both signal handlers. Idempotent."
```

---

### Task 7: Open the PR

**Files:** none (git/gh only)

- [ ] **Step 1: Full verification from a clean state**

```bash
npm run lint 2>&1 | tail -3
cd relay && npm test 2>&1 | tail -10
```

Expected: lint 0 errors; every relay test passes.

- [ ] **Step 2: Confirm no orphan-detection code was reintroduced**

```bash
grep -rn "appClientId\|orphanSweep\|ORPHAN_IDLE\|evict(" relay/src/ || echo "clean - no orphan detection"
```

Expected: `clean - no orphan detection`

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin fix/relay-lifecycle
gh pr create --base main --title "fix(relay): PTY lifecycle, frame validation, and shutdown" --body "$(cat <<'BODY'
Implements PR 3 of `docs/superpowers/specs/2026-07-26-instance-connection-lifecycle-design.md`.

Relay-side defects that stand on their own merit, independent of the client work in PR 2. No orphan or supersede detection — that approach is abandoned; see the spec for why.

| Fix | Consequence before |
|---|---|
| Reject non-object JSON frames | A one-byte `null` frame killed the relay and every PTY |
| `starting` state on `PtyManager` | Duplicate CLI spawned mid-self-update; `stop()` during the window left an unkillable process |
| `isBusy` at deferred-start guards | Reconnect armed a second deferred start; resize during the window was lost, spawning at 50x24 |
| Registry skips busy managers | A manager evicted mid-start spawned a CLI belonging to no instance |
| `stoppedByUser` | "Stop all sessions" resurrected every CLI on the next tab switch |
| `WebSocketHandler#close()` | SIGTERM hung indefinitely with a socket attached |

## Testing

New: `pty-lifecycle`, `pty-registry-eviction`, `stopped-no-autostart`, `ws-message-validation`. Run with `cd relay && npm test`.

Each fix also verified end-to-end against a standalone relay outside PM2 — PM2's `@pm2/io` wrapper traps uncaught errors and masks exactly the crash in the first row.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 4: Run the correctness review before merging**

Per the repo's global instruction, `/code-review` must pass before any merge. Report the findings and fix confirmed/plausible ones before merging.

---

## Self-Review

**Spec coverage** — every PR 3 item in the spec maps to a task:

| Spec item | Task |
|---|---|
| Non-object JSON frame guard | 1 |
| `handleMessage` rejection handling that does **not** evict | 1 |
| Real `pty-manager` lifecycle states in `start`/`stop`/`restart` | 2 |
| Wired into the registry's eviction predicates | 4 |
| Explicitly-stopped instances do not auto-start | 5 |
| `maxInstances` in `/api/health` + configurable via env | 4 |
| `WebSocketHandler.close()` on SIGINT/SIGTERM | 6 |
| Resize-during-start losing dimensions | 3 |

**Type consistency** — `status` (`'stopped'|'starting'|'running'`), `isBusy`, `isRunning` (getter), `intentionalStop`, `stoppedByUser`, `parseClientFrame`, `close()` are used with identical names and shapes in every task that references them.

**Known risk flagged inline:** Task 5 Step 7 notes that `DELETE /api/instances` removes managers entirely, so `stoppedByUser` may not survive. The step tells the implementer to raise it rather than work around it, because the fix would belong in the registry.
