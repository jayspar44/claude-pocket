import { describe, it, expect } from 'vitest';
import { createResizeNotifier, RESIZE_DEBOUNCE_MS, RESIZE_MAX_WAIT_MS } from '../resizeNotifier';

// A controllable clock, so the max-wait tests never depend on real time.
function makeClock() {
  let t = 0;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

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

  // Trailing-edge debouncing alone has no upper bound: sizes arriving closer
  // together than the delay re-arm the timer forever and nothing is ever sent.
  // The relay's deferred start gives up after 3s and spawns at handshake
  // dimensions, so an unbounded wait is a correctness problem, not just
  // latency. The budget runs from the start of the burst, so the timer the
  // last observation arms is shorter than the plain debounce.
  it('caps how long a never-settling burst can withhold a size', () => {
    const clock = makeClock();
    const { notifier, timers, sent } = make({ now: clock.now });
    notifier.resize(57, 44);

    // A size every 50ms - always inside the 200ms debounce, so a plain
    // trailing debounce would never fire.
    for (let i = 0; i < 40; i++) {
      clock.advance(50);
      notifier.resize(57, 30 + i);
    }

    const last = timers.scheduled[timers.scheduled.length - 1];
    expect(last.ms).toBeLessThan(RESIZE_DEBOUNCE_MS);
    expect(last.ms).toBe(0);

    timers.fireLast();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ cols: 57, rows: 69 });
  });

  // The budget is per burst, not for the life of the notifier: a later resize
  // after a quiet period gets the full debounce again, not a starved one.
  it('restarts the max-wait budget for each new burst', () => {
    const clock = makeClock();
    const { notifier, timers } = make({ now: clock.now });
    notifier.resize(57, 44);

    notifier.resize(57, 30);
    timers.fireLast();

    clock.advance(RESIZE_MAX_WAIT_MS * 5);
    notifier.resize(57, 20);

    const last = timers.scheduled[timers.scheduled.length - 1];
    expect(last.ms).toBe(RESIZE_DEBOUNCE_MS);
  });
});
