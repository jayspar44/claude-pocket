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
