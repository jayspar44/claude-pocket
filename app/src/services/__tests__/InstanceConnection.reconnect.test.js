import { describe, it, expect, beforeEach } from 'vitest';
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
