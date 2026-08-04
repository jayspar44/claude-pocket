import { describe, it, expect, beforeEach } from 'vitest';
import {
  InstanceConnection,
  CONNECTION_STATES,
  RESUME_PROBE_TIMEOUT,
  RESUME_STALE_CONNECT_MS,
  HEARTBEAT_TIMEOUT,
} from '../InstanceConnection';
import { FakeSocket, READY } from './fakeSocket';

const S = CONNECTION_STATES;

// resume() exists because readyState lies exactly when it matters. A socket
// killed while the page was frozen usually never delivers a close event, so it
// still reports OPEN or CONNECTING: isSocketGone() is false, shouldConnect()
// says "leave it alone", and nothing touches the connection. In production that
// showed up as a relay seeing NO connection attempt for 11 seconds after a
// resume - the 10s connect timeout was the only thing that could rescue a
// stalled socket - while the user watched "Reconnecting" do nothing.

function makeTimers() {
  const scheduled = [];
  return {
    setTimer: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length - 1; },
    clearTimer: (id) => { if (scheduled[id]) scheduled[id].cleared = true; },
    scheduled,
    live: () => scheduled.filter((t) => !t.cleared && !t.fired),
    fireLast: () => {
      const t = scheduled[scheduled.length - 1];
      if (t && !t.cleared && !t.fired) { t.fired = true; t.fn(); }
    },
  };
}

function make(extra = {}) {
  const timers = makeTimers();
  let now = 1000;
  const conn = new InstanceConnection({
    instanceId: 'inst-1',
    url: 'ws://relay/ws',
    getHandshakePayload: () => ({ cols: 80, rows: 24 }),
    socketFactory: (url) => new FakeSocket(url),
    clock: () => now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    ...extra,
  });
  return { conn, timers, advance: (ms) => { now += ms; } };
}

function connectFully(conn) {
  conn.connect();
  FakeSocket.last.fireOpen();
  FakeSocket.last.fireMessage({ type: 'pty-status' });
}

describe('InstanceConnection.resume', () => {
  beforeEach(() => FakeSocket.reset());

  // The healthy case has to stay cheap. Recycling every live connection on every
  // glance at another browser tab would cost a reconnect and a full replay each
  // time, which is worse than the problem.
  it('probes a connected socket instead of recycling it', () => {
    const { conn } = make();
    connectFully(conn);
    const socket = FakeSocket.last;

    conn.resume();

    expect(conn.state).toBe(S.CONNECTED);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(socket.sent.at(-1)).toEqual({ type: 'ping' });
  });

  // The whole point of the probe is that it resolves fast. The 5s heartbeat
  // deadline is a background health check on a connection with no reason to be
  // suspect; here the user is watching and waiting.
  it('gives the probe a much shorter deadline than the heartbeat', () => {
    const { conn, timers } = make();
    connectFully(conn);

    conn.resume();

    const armed = timers.live().at(-1);
    expect(armed.ms).toBe(RESUME_PROBE_TIMEOUT);
    expect(armed.ms).toBeLessThan(HEARTBEAT_TIMEOUT);
  });

  // A socket that looks OPEN but is dead: the probe's deadline is what turns it
  // into a reconnect. Without resume() this took a full heartbeat cycle.
  it('drops a connected socket that never answers the probe', () => {
    const { conn, timers } = make();
    connectFully(conn);

    conn.resume();
    timers.fireLast();                       // pong deadline expires

    expect(conn.state).toBe(S.RECONNECTING);
    expect(conn.disconnectReason).toBe('dropped');
  });

  it('leaves a connected socket alone when the probe is answered', () => {
    const { conn } = make();
    connectFully(conn);

    conn.resume();
    FakeSocket.last.fireMessage({ type: 'pong' });

    expect(conn.state).toBe(S.CONNECTED);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  // The observed production stall. A connect pending across a background never
  // completes, and waiting out CONNECTION_TIMEOUT is the 11 seconds of silence.
  it('replaces a connect left pending across the background', () => {
    const { conn, advance } = make();
    conn.connect();
    const stalled = FakeSocket.last;
    expect(conn.state).toBe(S.CONNECTING);

    advance(RESUME_STALE_CONNECT_MS + 1);
    conn.resume();

    expect(FakeSocket.instances).toHaveLength(2);
    expect(stalled.readyState).toBe(READY.CLOSED);
    expect(conn.state).toBe(S.CONNECTING);
  });

  // Two visibilitychange events in quick succession must not tear down an
  // in-flight socket over and over, or a connect never gets the ~100-300ms it
  // needs to finish and the tab can never come back at all.
  it('leaves a freshly started connect alone', () => {
    const { conn, advance } = make();
    conn.connect();

    advance(RESUME_STALE_CONNECT_MS - 1);
    conn.resume();
    conn.resume();

    expect(FakeSocket.instances).toHaveLength(1);
  });

  // A resume is the app noticing, not the user asking.
  it('does not revive a session the user stopped', () => {
    const { conn } = make();
    connectFully(conn);
    conn.disconnect('user');

    conn.resume();

    expect(conn.state).toBe(S.DISCONNECTED);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('does not revive a session swept for idleness', () => {
    const { conn } = make();
    connectFully(conn);
    conn.disconnect('idle');

    conn.resume();

    expect(conn.state).toBe(S.DISCONNECTED);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  // An involuntary loss is exactly what a resume should repair.
  it('revives a connection whose ladder drained while backgrounded', () => {
    const { conn } = make();
    connectFully(conn);
    conn._drop('network');
    conn.state = S.DISCONNECTED;
    conn.disconnectReason = 'dropped';

    conn.resume();

    expect(conn.state).toBe(S.CONNECTING);
  });

  // Mid-backoff, the rung may be 16s away. The user is looking at the screen.
  it('cancels a pending backoff rung and opens at once', () => {
    const { conn, timers } = make();
    connectFully(conn);
    conn._drop('network');
    expect(conn.state).toBe(S.RECONNECTING);
    const rung = timers.live().at(-1);

    conn.resume();

    expect(rung.cleared).toBe(true);
    expect(conn.state).toBe(S.CONNECTING);
  });

  it('is a no-op once destroyed', () => {
    const { conn } = make();
    connectFully(conn);
    conn.destroy();

    conn.resume();

    expect(conn.state).toBe(S.DESTROYED);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
