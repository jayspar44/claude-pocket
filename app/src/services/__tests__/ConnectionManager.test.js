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
    isSocketGone: vi.fn(() => false),
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

  it('hasLiveConnections counts CONNECTING and RECONNECTING, not just CONNECTED', () => {
    const { mgr } = make();
    const c = mgr.ensure('i1', 'ws://r/ws');
    expect(mgr.hasLiveConnections()).toBe(true);
    c.state = 'reconnecting';
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
    // sweep disconnects A, so nothing is CONNECTED any more - releasing on that
    // would let Android kill the process before B's retry ever fires.
    const { mgr } = make({ isViewIdle: () => true });
    const a = mgr.ensure('i1', 'ws://r/ws');
    const b = mgr.ensure('i2', 'ws://r/ws');
    b.state = 'reconnecting';
    a.isIdleSince.mockReturnValue(true);

    mgr.tick();

    expect(a.disconnect).toHaveBeenCalledWith('idle');
    expect(a.state).toBe('disconnected');
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
    expect(mgr.hasLiveConnections()).toBe(false);
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

  // The heartbeat exists to avoid waking the radio; leaving it armed with nothing
  // connected is the cost it was meant to remove. The invariant throughout is
  // still ONE interval, ever - never two live at once.
  describe('the heartbeat follows the live connections', () => {
    const liveIntervals = ({ intervals, clearedIds }) => (
      intervals.filter((i) => !clearedIds.includes(i.id))
    );

    it('arms nothing until the first connect', () => {
      const h = makeHeartbeatHarness();
      h.mgr.ensure('i1', 'ws://r/ws');
      expect(h.intervals).toHaveLength(0);

      h.mgr.connect('i1', 'ws://r/ws');
      expect(h.intervals).toHaveLength(1);
    });

    it('still arms only one interval however many instances connect', () => {
      const h = makeHeartbeatHarness();
      h.mgr.connect('i1', 'ws://r/ws');
      h.mgr.connect('i2', 'ws://r/ws');
      h.mgr.connect('i3', 'ws://r/ws');
      expect(h.intervals).toHaveLength(1);
      expect(liveIntervals(h)).toHaveLength(1);
    });

    it('keeps ticking while any other connection is still live', () => {
      const h = makeHeartbeatHarness();
      h.mgr.connect('i1', 'ws://r/ws');
      h.mgr.connect('i2', 'ws://r/ws');
      h.mgr.disconnect('i1', 'user');
      expect(h.clearedIds).toEqual([]);
      expect(liveIntervals(h)).toHaveLength(1);
    });

    it('releases the interval when the last connection is disconnected', () => {
      const h = makeHeartbeatHarness();
      h.mgr.connect('i1', 'ws://r/ws');
      h.mgr.disconnect('i1', 'user');
      expect(h.clearedIds).toEqual([h.intervals[0].id]);
      expect(liveIntervals(h)).toHaveLength(0);
    });

    it('releases the interval on disconnectAll', () => {
      const h = makeHeartbeatHarness();
      h.mgr.connect('i1', 'ws://r/ws');
      h.mgr.connect('i2', 'ws://r/ws');
      h.mgr.disconnectAll('user');
      expect(h.clearedIds).toEqual([h.intervals[0].id]);
    });

    it('releases the interval when the last connection is removed', () => {
      const h = makeHeartbeatHarness();
      h.mgr.connect('i1', 'ws://r/ws');
      h.mgr.remove('i1');
      expect(h.clearedIds).toEqual([h.intervals[0].id]);
    });

    it('releases the interval on the tick after a connection dies on its own', () => {
      // A drained reconnect ladder never calls back into the manager, so nothing
      // but the tick can notice that the map has gone quiet.
      const h = makeHeartbeatHarness();
      h.mgr.connect('i1', 'ws://r/ws');
      h.mgr.get('i1').state = 'disconnected';    // ladder exhausted behind our back
      expect(h.clearedIds).toEqual([]);

      h.intervals[0].fn();                       // the 25s tick
      expect(h.clearedIds).toEqual([h.intervals[0].id]);
    });

    it('arms a fresh interval when a connection comes back after reconnectAll', () => {
      const h = makeHeartbeatHarness();
      h.mgr.connect('i1', 'ws://r/ws');
      h.mgr.disconnect('i1', 'user');
      const c = h.mgr.get('i1');
      c.disconnectReason = 'dropped';           // an involuntary loss, not the user
      c.connect.mockImplementation(function () { this.state = 'connecting'; });
      h.mgr.reconnectAll();
      expect(liveIntervals(h)).toHaveLength(1);
    });

    it('arms exactly one fresh interval when a connection comes back', () => {
      const h = makeHeartbeatHarness();
      h.mgr.connect('i1', 'ws://r/ws');
      h.mgr.disconnect('i1', 'user');
      h.mgr.get('i1').state = 'connecting';
      h.mgr.connect('i1', 'ws://r/ws');
      expect(h.intervals).toHaveLength(2);
      expect(liveIntervals(h)).toHaveLength(1);
    });
  });
  // A resume must revive every connection, not just the active tab's. Two tabs
  // backgrounded through a 40s outage both drain their ladders; reviving only the
  // active one leaves the other with no output and no task-complete notification
  // until the user happens to tap it.
  describe('reconnectAll', () => {
    it('revives every connection shouldConnect allows, and only those', () => {
      const h = makeHeartbeatHarness();
      const dropped = h.mgr.ensure('i1', 'ws://r/ws');
      dropped.state = 'disconnected';
      dropped.disconnectReason = 'dropped';        // ladder drained while backgrounded
      const stopped = h.mgr.ensure('i2', 'ws://r/ws');
      stopped.state = 'disconnected';
      stopped.disconnectReason = 'user';           // the user stopped this one
      const backingOff = h.mgr.ensure('i3', 'ws://r/ws');
      backingOff.state = 'reconnecting';
      backingOff.disconnectReason = 'dropped';
      const healthy = h.mgr.ensure('i4', 'ws://r/ws');   // fakeConn starts connected

      h.mgr.reconnectAll();

      expect(dropped.connect).toHaveBeenCalledTimes(1);
      expect(backingOff.connect).toHaveBeenCalledTimes(1);
      expect(stopped.connect).not.toHaveBeenCalled();
      expect(healthy.connect).not.toHaveBeenCalled();
    });

    it('carries no user intent, so an idle-swept session stays down', () => {
      const h = makeHeartbeatHarness();
      const swept = h.mgr.ensure('i1', 'ws://r/ws');
      swept.state = 'disconnected';
      swept.disconnectReason = 'idle';
      h.mgr.reconnectAll();
      expect(swept.connect).not.toHaveBeenCalled();
    });

    it('is a no-op with no connections', () => {
      const h = makeHeartbeatHarness();
      expect(() => h.mgr.reconnectAll()).not.toThrow();
      expect(h.intervals).toHaveLength(0);
    });
  });
});
