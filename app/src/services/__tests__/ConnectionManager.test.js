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

  it('hasLiveConnections counts CONNECTING and RECONNECTING, not just CONNECTED', () => {
    const { mgr } = make();
    const c = mgr.ensure('i1', 'ws://r/ws');
    c.state = 'reconnecting';
    expect(mgr.connectedCount()).toBe(0);
    expect(mgr.hasLiveConnections()).toBe(true);
    c.state = 'connecting';
    expect(mgr.hasLiveConnections()).toBe(true);
    c.state = 'disconnected';
    expect(mgr.hasLiveConnections()).toBe(false);
    c.state = 'destroyed';
    expect(mgr.hasLiveConnections()).toBe(false);
  });

  it('stays live when the last CONNECTED instance is swept while another backs off', () => {
    // The scenario the foreground-service release gate has to survive: A has been
    // idle an hour, B is mid-backoff behind a dead network, both backgrounded. The
    // sweep disconnects A, and connectedCount() is then 0 - releasing on that
    // would let Android kill the process before B's retry ever fires.
    const { mgr } = make({ isViewIdle: () => true });
    const a = mgr.ensure('i1', 'ws://r/ws');
    const b = mgr.ensure('i2', 'ws://r/ws');
    b.state = 'reconnecting';
    a.isIdleSince.mockReturnValue(true);

    mgr.tick();

    expect(a.disconnect).toHaveBeenCalledWith('idle');
    expect(mgr.connectedCount()).toBe(0);
    expect(mgr.hasLiveConnections()).toBe(true);

    // Once B gives up too, nothing is live and the service may be released.
    b.state = 'disconnected';
    expect(mgr.hasLiveConnections()).toBe(false);
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
    expect(mgr.get('i1')).toBeUndefined();
    expect(mgr.get('i2')).toBeUndefined();
  });

  function makeHeartbeatHarness(overrides = {}) {
    const intervals = [];
    const clearedIds = [];
    let nextId = 0;
    const mgr = new ConnectionManager({
      connectionFactory: ({ instanceId }) => fakeConn(instanceId),
      isViewIdle: () => false,
      setInterval_: (fn, ms) => {
        const id = nextId;
        nextId += 1;
        intervals.push({ id, fn, ms });
        return id;
      },
      clearInterval_: (id) => { clearedIds.push(id); },
      ...overrides,
    });
    return { mgr, intervals, clearedIds };
  }

  it('startHeartbeat arms exactly one interval regardless of connection count', () => {
    const { mgr, intervals } = makeHeartbeatHarness();
    mgr.ensure('i1', 'ws://r/ws');
    mgr.ensure('i2', 'ws://r/ws');
    mgr.ensure('i3', 'ws://r/ws');
    mgr.startHeartbeat();
    mgr.startHeartbeat();
    expect(intervals).toHaveLength(1);
    expect(intervals[0].ms).toBe(25000);
  });

  it('stopHeartbeat clears the armed interval and allows a fresh one to be armed', () => {
    const { mgr, intervals, clearedIds } = makeHeartbeatHarness();
    mgr.startHeartbeat();
    const firstId = intervals[0].id;
    mgr.stopHeartbeat();
    expect(clearedIds).toEqual([firstId]);

    mgr.startHeartbeat();
    expect(intervals).toHaveLength(2);
  });

  it('stopHeartbeat is a no-op when no heartbeat is running', () => {
    const { mgr, clearedIds } = makeHeartbeatHarness();
    mgr.stopHeartbeat();
    expect(clearedIds).toEqual([]);
  });

  it('destroyAll clears the heartbeat interval', () => {
    const { mgr, intervals, clearedIds } = makeHeartbeatHarness();
    mgr.startHeartbeat();
    const firstId = intervals[0].id;
    mgr.destroyAll();
    expect(clearedIds).toEqual([firstId]);
  });
});
