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

  // Finding 3: when ptyRegistry.get() throws - "Maximum instances (N)
  // reached" - the relay's only answer to set-instance is a pty-error. With
  // the handshake keyed to pty-status alone the tab sat in CONNECTING until
  // the 10s timeout, then ran the whole 1/2/4/8/16s ladder with a blank
  // terminal, while the explanation had already arrived on the first attempt.
  it('completes the handshake on a pty-error, the relay\'s other answer to set-instance', () => {
    const { conn, onMessage } = make();
    conn.connect();
    FakeSocket.last.fireOpen();
    FakeSocket.last.fireMessage({ type: 'pty-error', message: 'Maximum instances (3) reached' });
    expect(conn.state).toBe(CONNECTION_STATES.CONNECTED);
    expect(onMessage).toHaveBeenCalledWith('inst-1', expect.objectContaining({
      type: 'pty-error',
      message: 'Maximum instances (3) reached',
    }));
  });

  // Guard on the above, not proof of it: this one holds either way. A
  // pty-error is only handshake-completing while CONNECTING, so the ordinary
  // mid-session one - a CLI that failed to spawn - must remain inert.
  it('leaves a mid-session pty-error alone', () => {
    const { conn } = make();
    conn.connect();
    FakeSocket.last.fireOpen();
    FakeSocket.last.fireMessage({ type: 'pty-status', running: true });
    FakeSocket.last.fireMessage({ type: 'pty-error', message: 'CLI failed to start' });
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
