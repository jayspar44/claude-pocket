# Instance Connection Lifecycle — Design

**Date:** 2026-07-26
**Status:** Approved, ready for implementation plan

## Goal

Make a leaked WebSocket structurally impossible on the client, so duplicated terminal output cannot recur — replacing three rounds of relay-side heuristics that tried to *detect* sockets the client had lost track of.

## Background

Issue #8 reported the terminal rendering every byte 3–4×. The relay was broadcasting each output batch once per attached socket, and the app funnelled them all into one xterm.

The root cause is client-side. `InstanceContext` tracks sockets in a single slot per instance (`wsRefs.current[instanceId]`), and a socket's existence is implied **only** by that map entry. Any path that deletes or overwrites the entry while the socket is still `OPEN` leaks it permanently: nothing holds a reference, so nothing can close it, and the duplicate-connection guard then sees an empty slot and opens another socket. The duplication factor grew over time — 3× in old scrollback, 4× in newer — because each occurrence added one permanent orphan.

The original trigger was a `close` event delivered late (routine on mobile, where a backgrounded WebView defers delivery until the app resumes and has already reconnected). The stale close evicted whatever sat in `wsRefs`, which by then was the current live socket.

### Why the previous approach failed

PR #9 attempted to fix this on the relay: infer which sockets were orphaned and evict them. Three review rounds each found real defects introduced by the previous round's fixes:

| Round | Fix attempted | Defect it introduced |
|---|---|---|
| 1 | Silence-based orphan sweep (75s idle) | Evicted live backgrounded clients; its clean `4002` close made pre-existing app builds tear down their *live* socket's state |
| 2 | `appClientId` supersede + `evict()` + `starting` flag + `deliberateDisconnects` flag | Rejection handler crashed on a `null` frame; evict-on-set-instance-failure created an unbounded ~1/s reconnect loop; `starting` wired only into the spawn side, so Stop/Restart silently dropped work and could spawn an unkillable CLI |
| 3 | — | Confirmed 4 of 5 findings were regressions from round 2 |

Two structural reasons:

1. **Orphanhood is unknowable from the relay.** A leaked socket and a backgrounded-but-attached socket are indistinguishable — the browser answers protocol pings automatically in both cases. Any timing heuristic must therefore misfire in one direction or the other.
2. **Each fix added a flag to an unowned lifecycle.** The client had 8 parallel maps keyed by `instanceId` (`wsRefs`, `reconnectAttempts`, `reconnectTimeouts`, `connectionTimeouts`, `heartbeatIntervals`, `pongTimeouts`, `deliberateDisconnects`, `listeners`) mutated from 16 sites across an 882-line file. Every fix became a 9th map, and each new map interacted badly with paths not enumerated.

## Non-goals

- Relay-side orphan detection of any kind. The `appClientId` supersede mechanism and the silence sweep are both removed. The pre-existing protocol ping/pong sweep remains as the backstop for genuinely dead TCP connections, which is what it is actually good at.
- Multi-device coherence. If the same instance is driven from a second device, the phone may miss a completion notification (buffer replay still recovers the output). Accepted; this is a single-user tool.
- Push notifications for disconnected instances. Out of scope.
- Unrelated refactoring of `InstanceContext`'s instance-metadata half.

## Architecture

Three units, replacing the connection half of `InstanceContext`.

### New: `app/src/services/InstanceConnection.js`

Plain JS, no React. Owns exactly one WebSocket and every timer belonging to it.

**Owns:** the socket; connect timeout; pong timeout; reconnect timer; attempt counter; `state`; `disconnectReason`; `lastActivityAt`.

**State machine:**

```
idle ──connect()──> connecting ──open──> connected
                         │                  │
                         │ close/timeout    │ close
                         ▼                  ▼
                    reconnecting <──────────┘   (reason: dropped)
                         │
                         │ backoff elapsed
                         └──> connecting

any ──disconnect(reason)──> disconnected   (reason: user | idle)
any ──destroy()──────────> destroyed
```

**Interface:**

| Member | Purpose |
|---|---|
| `constructor({ instanceId, url, socketFactory, clock, onStateChange, onMessage })` | `socketFactory` and `clock` injected for tests; default to `WebSocket` and `Date.now` |
| `connect()` | No-op unless `idle`, `disconnected`, or `reconnecting` |
| `disconnect(reason)` | `reason` is `'user'` or `'idle'`. Closes, sets state, cancels all timers |
| `send(message)` | Returns `false` unless `connected`. Stamps nothing — see *Handshake* |
| `ping()` | Called by the manager's shared tick |
| `isIdleSince(threshold)` | Pure predicate over `lastActivityAt` + last known PTY status |
| `destroy()` | Idempotent, unconditional teardown |
| `state`, `disconnectReason` | Read-only |

**The invariant that eliminates the bug class:** the socket is created in exactly one place and torn down in exactly one place, and the object *is* the reference. There is no map entry that can be deleted while the socket lives. Handlers are bound to `this`, so a socket belonging to a previous connection cannot reach a live handler — which makes the identity guards added in PR #8/#9 unnecessary rather than load-bearing.

**Handshake:** `set-instance` is sent from the connection's own `open` handler and is internal to the object. Callers never construct it, so it cannot be sent without its required fields.

### New: `app/src/services/ConnectionManager.js`

Owns `Map<instanceId, InstanceConnection>` and the **single shared heartbeat interval**.

Today each connection runs its own 25s heartbeat. Ten unsynchronised heartbeats wake the mobile radio ~24×/minute and keep it from sleeping; that — not socket count — is the real battery cost of holding connections open. One tick pings all `connected` connections together so the radio wakes once.

On each tick: ping every connected connection, then run the idle check.

| Member | Purpose |
|---|---|
| `get(instanceId)` / `ensure(instanceId, url)` | Connection lookup / creation |
| `connect(id)` / `disconnect(id, reason)` / `send(id, msg)` | Delegation |
| `disconnectAll(reason)` | For bulk Stop |
| `connectedCount()` | Cap enforcement |
| `destroyAll()` | Teardown |

### Modified: `app/src/contexts/InstanceContext.jsx`

Keeps instance metadata and React state mirroring. Holds **no** socket state. The 8 parallel maps collapse to the manager's single map; the 16 `wsRefs` mutation sites become method calls.

Public API is unchanged in signature — `connectInstance`, `disconnectInstance`, `switchInstance`, `sendToInstance`, `addMessageListener`, `addInstance` — so `Settings.jsx`, `InstanceManager.jsx`, `useRelay.js` and `RelayContext.jsx` need no changes beyond what falls out of behaviour fixes.

**Hard requirement — the callback-stability rule.** The exposed callbacks must **not** depend on connection state. Today `connectInstance` has `instanceStates` in its dependency array, so every state write re-creates it, which re-fires the auto-connect effect, which reconnected an instance the user had just disconnected — this is what defeated the `deliberateDisconnects` flag. State flows *out* of connections into React and never back in as a dependency. Connection identity is stable for the life of the instance; effects fire on `activeInstanceId` changes only.

## Disconnect reasons

The current code records only *that* a connection is down, never *why*, which is why one boolean could not express the required behaviour.

| Reason | Auto-connect | Reconnect on tab select | Set by |
|---|---|---|---|
| `user` | No | Yes | Disconnect button, app exit, Settings Stop actions |
| `idle` | No | Yes | Idle check (below) |
| `dropped` | Yes, backoff ladder | — | Network loss, relay restart, heartbeat timeout, relay-side close |

Selecting a `user`- or `idle`-disconnected instance reconnects it: the selection *is* the user changing their mind.

Reconnect backoff and cap are unchanged (`[1s, 2s, 4s, 8s, 16s]`, 5 attempts). The attempt counter resets on a **successful handshake**, not on socket open — resetting on open is what made the round-2 reconnect loop unbounded.

**"Successful handshake" is defined as:** the socket opened, `set-instance` was sent, and the relay's `pty-status` reply for that instance arrived. The relay already sends `pty-status` at the end of every `set-instance` (via `sendReplay`), so no protocol change is needed. Until that reply arrives the connection is `connecting`, not `connected`, and the attempt counter is untouched — so a deterministic server-side failure during `set-instance` exhausts the ladder and surfaces an error instead of looping forever.

## Connection cap

Three unaligned numbers today: unlimited app tabs, 10 relay PTYs (`MAX_INSTANCES`, hardcoded), 3 app sockets (`MAX_CONCURRENT_CONNECTIONS`, apparently arbitrary — no measurement behind it).

**Align to one constant: 10.** The app refuses to create an 11th tab with a visible reason; the socket cap equals the tab cap.

The app and relay are separate packages and cannot literally share a constant. Rather than duplicate a magic number in two repos-worth of code and hope they stay in sync:

- The relay exposes its limit in the `/api/health` payload (it already reports `instanceCount`; add `maxInstances`).
- The app uses that value when known, falling back to a local default of 10 when health has not yet been fetched.
- PR 3 makes the relay's limit configurable (`MAX_INSTANCES` env var; it is hardcoded today), so the pair can be raised together from one place.

This keeps the relay authoritative — it is the side that actually enforces the limit and throws `Maximum instances (N) reached`.

Consequences:

- **The LRU-eviction path disappears.** If tabs ≤ socket cap, selecting a tab can never push over the cap, so nothing is ever parked to make room. This deletes the `lastUsedAt` sacrifice policy and a whole disconnect reason.
- **The silent-completion hole closes.** `task-complete` notifications arrive over the WebSocket, so an LRU-evicted tab finished silently. Every tab now stays connected, so every tab can notify.
- The existing cap did not hold the line anyway: it counted only `OPEN` (missing `CONNECTING`) and ran only inside `switchInstance`, so mount-time connects and the reconnect ladder could exceed it with nothing to pull back.

## Idle disconnect

Disconnect a tab after **1 hour** of no activity, to avoid holding sockets for tabs doing nothing.

**Safety argument:** an idle PTY with no connected client **cannot spontaneously start work.** A CLI at its prompt only produces output in response to input, and input only arrives from a connected client. So disconnecting a genuinely idle tab cannot cause a missed completion notification — there is nothing that could complete. This is the exact opposite of LRU eviction, which killed sockets on *busy* tabs.

**"No activity" — all four conditions:**

| Condition | Owned by | Source |
|---|---|---|
| No `output` frame within the window | `InstanceConnection` | `lastActivityAt`, updated on every inbound `output`/`replay` |
| PTY not processing | `InstanceConnection` | last `pty-status.processingStartTime === null` |
| Not the active tab | `InstanceContext` | `activeInstanceId` |
| Not viewed within the window | `InstanceContext` | `instance.lastViewedAt` (rename of `lastUsedAt`, already written on switch) |

The four conditions span two units, so ownership must be explicit. `InstanceConnection.isIdleSince(threshold)` is a pure predicate over **only** what the connection itself observes — the first two rows. The two view-related conditions are React state the connection must not reach into.

`ConnectionManager` therefore takes an injected `isViewIdle(instanceId) => boolean` callback, supplied by `InstanceContext` from a ref (not a dependency, per the callback-stability rule). A connection is disconnected as `idle` only when `connection.isIdleSince(IDLE_MS) && isViewIdle(instanceId)`. This keeps the connection unit-testable without React and keeps the manager free of view state.

**Evaluate by timestamp comparison on the shared heartbeat tick — never by a long `setTimeout`.** A 1-hour timer in a backgrounded WebView may not fire, or fires an hour late; that same throttling caused the original leak. A missed check merely delays the disconnect, which is harmless.

## Session recovery and bulk stop

Existing Settings capabilities that must survive unchanged:

| Capability | Mechanism |
|---|---|
| List relay sessions | `instancesApi.list()`, polled while visible |
| **Recover a lost session** | `handleRestoreInstance`: if no tab exists for a relay instance, `addInstance(...)` **reusing the server's instanceId**, then `connectInstance` + `switchInstance` |
| Stop one relay session | `instancesApi.delete(id)` |
| **Stop all relay sessions** | `instancesApi.deleteAll()` |
| Reset app data | `localStorage.clear()` + reload |

Recovery makes the relay the source of truth for sessions, so Reset App Data or a reinstall does not lose running work. `connectInstance`, `switchInstance`, and `addInstance`-with-explicit-id keep their signatures.

Three requirements:

1. **Restore is cap-aware.** After Reset App Data the app has 1 tab while the relay may hold 10 sessions. Restoring must work up to the cap and then state the reason plainly rather than failing silently. With both limits at 10 they cannot genuinely conflict, but restore is the path that surfaces the message if they ever do.

2. **`destroyAll()` on provider unmount.** Do not rely on page unload to close sockets.

3. **Stopping sessions must not resurrect them.** `deleteAll` removes the PTY managers but **never closes the WebSockets**. The app stays attached to nothing; on the next `set-instance` — tab switch, app resume, any reconnect — `ptyRegistry.get()` creates a fresh manager and, because the app sends `workingDir`, `setDeferredStart` fires and the CLI **starts again**. Stop all sessions, switch tabs, and they are all back. This defect exists today, independent of this work.

   - *Client half (PR 2):* Settings stop actions disconnect the corresponding connections with reason `user` (`disconnectAll('user')` for the bulk action), so they cannot auto-reconnect into a restart.
   - *Relay half (PR 3):* an explicitly stopped instance does not auto-start on the next `set-instance`; it waits for an explicit start. `pty-manager` already has an `intentionalStop` concept that is simply not consulted here.

   Resulting semantics: **Stop means stopped.** The Start button or `handleRestoreInstance` brings a session back.

## Error handling

| Situation | Behaviour |
|---|---|
| Connect timeout (10s) | Close, reason `dropped`, enter backoff |
| Heartbeat pong timeout (5s) | Close, reason `dropped`, enter backoff — currently a clean `4000` close that skipped reconnect entirely, leaving the instance dark |
| Relay closes/terminates the socket | reason `dropped`, backoff |
| `WebSocket` constructor throws | State `disconnected`, error surfaced, no orphaned timers |
| Malformed inbound frame | Logged, dropped; connection unaffected |
| `send()` while not `connected` | Returns `false`; caller decides. No queueing |
| Reconnect attempts exhausted (5) | State `disconnected`, error surfaced. Tab select clears the counter and retries |

Errors are cleared on a successful handshake, not on socket open — an `error` set by a dying socket must not outlive the connection that replaces it.

## Testing

The app currently has **no test script at all**: `npm run test:app` calls `npm test` in `app/`, which does not exist. This design requires one. Add **Vitest**, since Vite is already the build tool, and wire `test:app` to it.

`InstanceConnection` takes a socket factory and a clock, so a fake socket drives every transition in plain Node with no browser. Required cases — each is a defect this session actually produced or found:

| Case | Guards against |
|---|---|
| Late `close` after the connection was superseded | The original #8 leak |
| `close` during `connecting` | Orphaned connect timeout |
| `disconnect()` during `reconnecting` backoff | Reconnect firing after user disconnect |
| User-disconnect, then a React state write | Auto-connect effect clobbering intent |
| User-disconnect, then tab select | Must reconnect |
| Deterministic handshake failure, repeated | Unbounded reconnect loop (attempt counter must not reset) |
| Idle threshold crossed with injected clock | Idle disconnect under timer throttling |
| PTY busy but tab unviewed for > 1h | Must **not** disconnect |
| `destroy()` twice; `send()` in every state | Idempotency |

`ConnectionManager`: shared tick pings all connected; cap enforcement; `disconnectAll`.

Integration checks stay manual against a running DEV relay, verified with `pm2 describe` listener counts: the duplication factor must be 1 after repeated background/foreground cycles.

## PR sequence

| PR | Contents | Fixes |
|---|---|---|
| **1. Close #9** | Revert `develop` to `main`. Keep nothing | — |
| **2. Connection layer** | `InstanceConnection`, `ConnectionManager`, `InstanceContext` delegation, cap aligned to 10 both sides, shared heartbeat, `user`/`idle`/`dropped`, cap-aware restore, `disconnectAll` on Settings stop, Vitest + the cases above | #8 properly; Disconnect-doesn't-stick; silent completions; heartbeat-timeout-never-reconnects; client half of the resurrection bug |
| **3. Relay lifecycle** | Non-object JSON frame guard; `handleMessage` rejection handling that logs and reports but does **not** evict; real `pty-manager` lifecycle states wired into `start`/`stop`/`restart` and the registry's eviction predicates; explicitly-stopped instances do not auto-start; `maxInstances` in `/api/health` + configurable via env; `WebSocketHandler.close()` on SIGINT/SIGTERM | Relay findings that stand on their own merit, independent of orphan detection |

PR 2 depends on PR 3 only for the `maxInstances` health field, and degrades gracefully without it via the local default — so the two can land in either order.

PR #9 is closed rather than reduced. Its two salvageable pieces — the `onmessage`/`onerror` identity guards — are subsumed by PR 2, where a socket that is not this object's socket cannot reach a handler at all. The frame guard moves to PR 3. The branch carries four commits of churn that would only confuse the history.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Relay-side silence sweep | Orphanhood is unknowable from outside; misfires on backgrounded clients either way |
| `appClientId` deterministic supersede | Solves a problem that ceases to exist once the client cannot lose a socket; adds a protocol field and a relay eviction path for nothing |
| Reduce PR #9 to the identity guards only | Leaves 8 parallel maps and 16 mutation sites — the actual bug class — in place, and leaves the connection layer untestable |
| Keep cap at 3, add relay-side notifications for parked tabs | Significant work to preserve a cap with no measurement behind it; raising the cap deletes the problem |
