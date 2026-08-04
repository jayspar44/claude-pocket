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
      // Diagnostics the relay logs and ignores. A first attempt, so no time
      // has been spent recovering yet.
      recoveryMs: 0,
      recoveryAttempts: 0,
    });
  });

  // The relay uses these to tell "the client spent 15s retrying" apart from
  // "the client only started trying just now" - the difference between a
  // backoff problem and a resume-handler problem, which is otherwise invisible
  // because attempts that fail before the WebSocket upgrade reach no log.
  it('reports the ladder rungs burned before a handshake finally lands', () => {
    const { conn } = make();
    conn.connect();
    conn._drop('network');          // attempt 1 fails
    conn._open();
    conn._drop('network');          // attempt 2 fails
    conn._open();
    FakeSocket.last.fireOpen();

    expect(FakeSocket.last.lastSent.recoveryAttempts).toBe(2);
  });

  it('starts a fresh recovery count after a completed handshake', () => {
    const { conn } = make();
    conn.connect();
    conn._drop('network');          // a costly first recovery: two rungs
    conn._open();
    conn._drop('network');
    conn._open();
    FakeSocket.last.fireOpen();
    FakeSocket.last.fireMessage({ type: 'pty-status' });
    expect(FakeSocket.last.lastSent.recoveryAttempts).toBe(2);

    conn._drop('network');          // a later, cheap one
    conn._open();                   // _drop only schedules; this is the retry
    FakeSocket.last.fireOpen();

    // 1, not 3: the count measures this recovery, not the tab's whole history.
    expect(FakeSocket.last.lastSent.recoveryAttempts).toBe(1);
  });

  it('does not let a handshake payload override type or instanceId', () => {
    const { conn } = make({
      getHandshakePayload: () => ({
        type: 'bogus-type',
        instanceId: 'bogus-instance',
        workingDir: '/tmp',
      }),
    });
    conn.connect();
    FakeSocket.last.fireOpen();
    expect(FakeSocket.last.lastSent).toEqual({
      type: 'set-instance',
      instanceId: 'inst-1',
      workingDir: '/tmp',
      recoveryMs: 0,
      recoveryAttempts: 0,
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

  // REPLACES 'completes the handshake on a pty-error', which asserted the
  // opposite and is deliberately gone. Completing the handshake on any
  // pty-error parked the tab in CONNECTED over a socket the relay had bound no
  // PTY manager to: green dot, blank terminal, enabled composer, and every way
  // back closed at once - shouldConnect leaves CONNECTED alone and StatusBar
  // hides Reconnect while connected. A pty-error is not an answer that a
  // handshake succeeded.
  it('does not complete the handshake on a plain pty-error', () => {
    const { conn } = make();
    conn.connect();
    FakeSocket.last.fireOpen();
    FakeSocket.last.fireMessage({ type: 'pty-error', message: 'CLI failed to start' });
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTING);
  });

  // The relay's refusal: at MAX_INSTANCES with nothing evictable, set-instance
  // throws and the answer carries handshakeFailed - no pty-status is coming.
  // The tab ends DISCONNECTED, which is the only state it can be recovered
  // from, with the reason forwarded so the UI can show it.
  it('ends the attempt on a handshake-failed pty-error, in disconnected', () => {
    const { conn, onMessage } = make();
    conn.connect();
    FakeSocket.last.fireOpen();
    FakeSocket.last.fireMessage({
      type: 'pty-error',
      message: 'Maximum instances (3) reached',
      handshakeFailed: true,
    });

    expect(conn.state).toBe(CONNECTION_STATES.DISCONNECTED);
    expect(conn.disconnectReason).toBe('refused');
    expect(conn.error).toBe('Maximum instances (3) reached');
    // Forwarded as well as acted on: ptyError is what puts the reason on screen.
    expect(onMessage).toHaveBeenCalledWith('inst-1', expect.objectContaining({
      type: 'pty-error',
      message: 'Maximum instances (3) reached',
    }));
  });

  // A refusal must not arm the ladder: it is deterministic until the user frees
  // an instance on the relay, and nothing on this side can make that happen.
  it('arms no retry after a refusal, and reconnects on user intent', () => {
    const timers = [];
    const { conn } = make({
      setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      clearTimer: (id) => { timers[id - 1] = null; },
    });
    conn.connect();
    FakeSocket.last.fireOpen();
    FakeSocket.last.fireMessage({
      type: 'pty-error',
      message: 'Maximum instances (3) reached',
      handshakeFailed: true,
    });

    expect(timers.filter(Boolean)).toHaveLength(0);   // connect timer cleared, none armed
    expect(FakeSocket.instances).toHaveLength(1);

    // The way back: the Reconnect button, tab selection, or an app foreground -
    // all of which reach connect(). One socket per attempt, none on a timer.
    conn.connect();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTING);
  });

  // A pty-error is only handshake-relevant while CONNECTING, so the ordinary
  // mid-session one - a CLI that failed to spawn - must remain inert, even if
  // it somehow carried the flag.
  it('leaves a mid-session pty-error alone', () => {
    const { conn } = make();
    conn.connect();
    FakeSocket.last.fireOpen();
    FakeSocket.last.fireMessage({ type: 'pty-status', running: true });
    FakeSocket.last.fireMessage({ type: 'pty-error', message: 'CLI failed to start' });
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTED);
    FakeSocket.last.fireMessage({ type: 'pty-error', message: 'x', handshakeFailed: true });
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTED);
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

describe('InstanceConnection: the handshake payload is required', () => {
  beforeEach(() => FakeSocket.reset());

  // Without the guard this constructs happily and fails ~41s later: onopen
  // throws, set-instance is never sent, the relay never replies pty-status, and
  // the connect timer plus the whole reconnect ladder run their course.
  it('refuses to construct without getHandshakePayload', () => {
    expect(() => new InstanceConnection({ instanceId: 'inst-1', url: 'ws://relay/ws' }))
      .toThrow(TypeError);
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it('refuses a getHandshakePayload that is not callable', () => {
    expect(() => new InstanceConnection({
      instanceId: 'inst-1',
      url: 'ws://relay/ws',
      getHandshakePayload: { workingDir: '/tmp' },
    })).toThrow(TypeError);
  });
});
