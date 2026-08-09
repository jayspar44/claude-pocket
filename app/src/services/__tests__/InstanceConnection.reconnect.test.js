import { describe, it, expect, beforeEach } from 'vitest';
import { InstanceConnection, CONNECTION_STATES, RECONNECT_DELAYS, MAX_RECONNECT_ATTEMPTS, CONNECTION_TIMEOUT } from '../InstanceConnection';
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
  // The cost of a resume signal that never arrives. A tab that drained its
  // ladder while backgrounded sits on the last rung, and the user watches
  // "Reconnecting" for exactly that long - measured at 16s in production,
  // before the tail was flattened. Asserted as a property, not a literal, so
  // retuning the schedule cannot quietly reintroduce a long tail. This is what
  // buying the budget back with more rungs, rather than longer ones, protects.
  it('never makes the user wait more than 4s for a retry', () => {
    expect(Math.max(...RECONNECT_DELAYS)).toBeLessThanOrEqual(4000);
  });

  // The budget has to outlast a relay restart, because deploy.sh does
  // pm2 delete + pm2 start and /deploy is run from the phone - the app never
  // backgrounds, so no resume signal fires and the ladder is the only thing
  // that brings the tabs back. A five-rung version of this schedule spent 15s,
  // which is short of that, and stranded every tab on "Offline". Bounded above
  // as well, so the budget cannot creep upward unnoticed.
  it('covers a relay restart before giving up', () => {
    const total = RECONNECT_DELAYS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(31000);
    expect(total).toBeLessThanOrEqual(40000);
    expect(RECONNECT_DELAYS).toHaveLength(MAX_RECONNECT_ATTEMPTS);
  });

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
    //
    // Loop until reconnecting stops rather than hardcoding an attempt count -
    // that asserts the actual property ("eventually gives up") instead of
    // baking in an off-by-one of the test's own. A bound keeps a regression
    // that loops forever from hanging the suite.
    const { conn, timers } = make();
    conn.connect();
    const delaysUsed = [];
    const bound = MAX_RECONNECT_ATTEMPTS + 2;
    for (let i = 0; i < bound; i++) {
      FakeSocket.last.fireOpen();            // opens fine...
      FakeSocket.last.fireAbruptClose();     // ...but never completes handshake
      if (conn.state !== CONNECTION_STATES.RECONNECTING) break;
      delaysUsed.push(timers.scheduled.at(-1).ms);
      timers.fireLast();
    }
    expect(conn.state).toBe(CONNECTION_STATES.DISCONNECTED);
    expect(conn.error).toMatch(/multiple attempts/i);
    // All nine rungs, in order - an off-by-one in either direction (giving up
    // early and stranding the last rung, or retrying past the ceiling) fails here.
    expect(delaysUsed).toEqual(RECONNECT_DELAYS);
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

  // Drives open/close rounds until the connection stops reconnecting, returning
  // the delays it used. Bounded so a regression that loops forever fails instead
  // of hanging the suite.
  function drainLadder(conn, timers) {
    const delaysUsed = [];
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS + 2; i++) {
      FakeSocket.last.fireOpen();
      FakeSocket.last.fireAbruptClose();          // never completes handshake
      if (conn.state !== CONNECTION_STATES.RECONNECTING) break;
      delaysUsed.push(timers.scheduled.at(-1).ms);
      timers.fireLast();
    }
    return delaysUsed;
  }

  it('a connect from fresh intent after exhaustion gets a full ladder again', () => {
    // Resuming from background with the network still down is the common mobile
    // case. The ladder having drained an hour ago says nothing about whether this
    // attempt can succeed, so fresh intent must start a new ladder - otherwise
    // resume gets one attempt and then gives up for good.
    const { conn, timers } = make();
    conn.connect();
    expect(drainLadder(conn, timers)).toEqual(RECONNECT_DELAYS);
    expect(conn.state).toBe(CONNECTION_STATES.DISCONNECTED);

    conn.connect();                               // app resume / tab select
    expect(conn.attempts).toBe(0);
    // A full nine rungs again, and it still terminates.
    expect(drainLadder(conn, timers)).toEqual(RECONNECT_DELAYS);
    expect(conn.state).toBe(CONNECTION_STATES.DISCONNECTED);
  });

  it('a deterministic handshake failure still exhausts the ladder and stops', () => {
    // The regression guard for the reset above: the ladder's own retry must not
    // reset the counter. A relay that accepts the socket and never answers
    // set-instance fails identically every time, so it has to be given up on.
    const { conn, timers } = make();
    conn.connect();
    const delaysUsed = [];
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS + 2; i++) {
      FakeSocket.last.fireOpen();                 // opens, set-instance sent...
      const timeout = timers.scheduled
        .filter((t) => t.ms === CONNECTION_TIMEOUT && !t.cleared).at(-1);
      timeout.fn();                               // ...but pty-status never comes
      if (conn.state !== CONNECTION_STATES.RECONNECTING) break;
      delaysUsed.push(timers.scheduled.at(-1).ms);
      timers.fireLast();
    }
    expect(conn.state).toBe(CONNECTION_STATES.DISCONNECTED);
    expect(conn.error).toMatch(/multiple attempts/i);
    expect(delaysUsed).toEqual(RECONNECT_DELAYS);
    // Six sockets: the first attempt plus nine rungs. A seventh means the
    // counter reset somewhere on the retry path.
    expect(FakeSocket.instances).toHaveLength(MAX_RECONNECT_ATTEMPTS + 1);
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
