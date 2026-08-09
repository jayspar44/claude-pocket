import { describe, it, expect, vi } from 'vitest';
import { createForegroundService } from '../foregroundService';

// A plugin whose native calls never settle on their own, so a test can hold one
// in flight - which is the whole scenario.
function fakePlugin() {
  const settle = { start: null, stop: null, failStart: null };
  return {
    start: vi.fn(() => new Promise((resolve, reject) => {
      settle.start = resolve;
      settle.failStart = reject;
    })),
    stop: vi.fn(() => new Promise((resolve) => { settle.stop = resolve; })),
    settle,
  };
}

describe('createForegroundService', () => {
  it('starts the native service once, however often start() is called', () => {
    const plugin = fakePlugin();
    const svc = createForegroundService(plugin);
    svc.start();
    svc.start();
    svc.start();
    expect(plugin.start).toHaveBeenCalledTimes(1);
    expect(svc.isRunning()).toBe(true);
  });

  // The bug: the flag used to be cleared in stop()'s .then(), so it stayed true
  // while the native stop was in flight. A connection reaching CONNECTED in that
  // window skipped start(), the stop then resolved and cleared the flag, and the
  // app was left holding an open socket with no foreground service.
  it('starts again when a connect lands while the stop is still in flight', async () => {
    const plugin = fakePlugin();
    const svc = createForegroundService(plugin);
    svc.start();
    svc.stop();                       // native stop in flight, not yet resolved
    svc.start();                      // a connection reaches CONNECTED

    expect(plugin.start).toHaveBeenCalledTimes(2);
    expect(svc.isRunning()).toBe(true);

    plugin.settle.stop();             // the stop finally resolves...
    await Promise.resolve();
    expect(svc.isRunning()).toBe(true);   // ...and must not clear the flag now
  });

  it('stops only a service it believes is running', () => {
    const plugin = fakePlugin();
    const svc = createForegroundService(plugin);
    svc.stop();
    expect(plugin.stop).not.toHaveBeenCalled();

    svc.start();
    svc.stop();
    svc.stop();
    expect(plugin.stop).toHaveBeenCalledTimes(1);
    expect(svc.isRunning()).toBe(false);
  });

  it('releases the flag when the native start fails, so a retry can start', async () => {
    const plugin = fakePlugin();
    const svc = createForegroundService(plugin);
    svc.start();
    plugin.settle.failStart(new Error('no permission'));
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.isRunning()).toBe(false);

    svc.start();
    expect(plugin.start).toHaveBeenCalledTimes(2);
  });

  it('is a no-op with no plugin, which is every non-Android platform', () => {
    const svc = createForegroundService(null);
    expect(() => { svc.start(); svc.stop(); }).not.toThrow();
    expect(svc.isRunning()).toBe(false);
  });
});
