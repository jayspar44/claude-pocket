import { describe, it, expect } from 'vitest';
import { createResizeNotifier, RESIZE_DEBOUNCE_MS } from '../resizeNotifier';

// Collects scheduled timers so tests can fire them deterministically, the same
// shape the connection-layer tests use.
function makeTimers() {
  const scheduled = [];
  return {
    setTimer: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length - 1; },
    clearTimer: (id) => { if (scheduled[id]) scheduled[id].cleared = true; },
    scheduled,
    // Still armed: neither cleared by the notifier nor already fired.
    live: () => scheduled.filter((t) => !t.cleared && !t.fired),
    fireLast: () => {
      const t = scheduled[scheduled.length - 1];
      if (t && !t.cleared && !t.fired) {
        t.fired = true;
        t.fn();
      }
    },
  };
}

function make(extra = {}) {
  const timers = makeTimers();
  const sent = [];
  const notifier = createResizeNotifier({
    notify: (cols, rows) => sent.push({ cols, rows }),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    ...extra,
  });
  return { notifier, timers, sent };
}

describe('createResizeNotifier', () => {
  // The relay defers starting the PTY until a resize frame arrives with real
  // dimensions, falling back to set-instance's dimensions after 3s. A debounce
  // that delays the FIRST size pushes every session toward that fallback.
  it('delivers the first size synchronously, with no timer', () => {
    const { notifier, timers, sent } = make();

    notifier.resize(57, 44);

    expect(sent).toEqual([{ cols: 57, rows: 44 }]);
    expect(timers.scheduled).toHaveLength(0);
  });

  // The bug: a keyboard animation fires a resize per frame and every
  // intermediate geometry reaches the PTY (relay logs show spawns at 57x12 and
  // 57x10). Only the size the burst settles on may be sent.
  it('sends only the settled size after a burst, once', () => {
    const { notifier, timers, sent } = make();
    notifier.resize(57, 44);

    notifier.resize(57, 30);
    notifier.resize(57, 12);
    notifier.resize(57, 10);
    notifier.resize(57, 22);

    expect(sent).toHaveLength(1);
    timers.fireLast();
    expect(sent).toEqual([{ cols: 57, rows: 44 }, { cols: 57, rows: 22 }]);
    expect(timers.live()).toHaveLength(0);
  });

  // Trailing debounce: each new observation restarts the clock, so the timer
  // that survives is the one armed by the LAST observation. A leading edge, or
  // a timer that is not re-armed, would deliver the first mid-animation size.
  it('restarts the interval on every observation', () => {
    const { notifier, timers } = make();
    notifier.resize(57, 44);

    notifier.resize(57, 30);
    notifier.resize(57, 12);

    expect(timers.scheduled).toHaveLength(2);
    expect(timers.scheduled[0].cleared).toBe(true);
    expect(timers.live()).toHaveLength(1);
    expect(timers.scheduled[1].ms).toBe(RESIZE_DEBOUNCE_MS);
  });

  // A keyboard open/close cycle ends where it started, so the whole cycle is
  // churn. Dropping the duplicate is only safe if it also disarms the pending
  // intermediate size - otherwise the timer delivers 57x12 as if it were the
  // size the user settled on, which is worse than not deduplicating at all.
  it('sends nothing when the size returns to the last one sent, and disarms the pending one', () => {
    const { notifier, timers, sent } = make();
    notifier.resize(57, 44);

    notifier.resize(57, 12);
    notifier.resize(57, 44);

    expect(timers.live()).toHaveLength(0);
    timers.fireLast();
    expect(sent).toEqual([{ cols: 57, rows: 44 }]);
  });

  // Rejecting non-positive and non-finite values only - there is deliberately
  // no plausibility floor, because a real small geometry must still reach the
  // PTY. An unreadable measurement must also not discard a pending real size.
  it('ignores non-positive and non-finite sizes without disturbing a pending one', () => {
    const { notifier, timers, sent } = make();
    notifier.resize(57, 44);

    notifier.resize(57, 10);
    notifier.resize(0, 0);
    notifier.resize(57, NaN);
    notifier.resize(-1, 20);
    notifier.resize(undefined, undefined);

    expect(timers.live()).toHaveLength(1);
    timers.fireLast();
    // 57x10 is a plausible landscape-with-keyboard geometry and is delivered.
    expect(sent).toEqual([{ cols: 57, rows: 44 }, { cols: 57, rows: 10 }]);
  });

  // Unmount or dispose: the pending timer must be cleared, or it fires into a
  // torn-down terminal.
  it('cancel clears the pending timer so nothing is delivered afterwards', () => {
    const { notifier, timers, sent } = make();
    notifier.resize(57, 44);
    notifier.resize(57, 12);

    notifier.cancel();

    expect(timers.live()).toHaveLength(0);
    timers.fireLast();
    expect(sent).toEqual([{ cols: 57, rows: 44 }]);
  });

  // A resize can still arrive after cleanup - an animation frame scheduled
  // before the observer was disconnected. It must not arm a new timer that
  // notifies a superseded onResize.
  it('ignores resizes that arrive after cancel', () => {
    const { notifier, timers, sent } = make();
    notifier.resize(57, 44);
    notifier.cancel();

    notifier.resize(57, 20);

    expect(timers.live()).toHaveLength(0);
    expect(sent).toEqual([{ cols: 57, rows: 44 }]);
  });
});
