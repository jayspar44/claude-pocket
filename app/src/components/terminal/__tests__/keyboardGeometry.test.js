import { describe, it, expect } from 'vitest';
import {
  computeKeyboardShift,
  distributeTopScroll,
  createKeyboardFreeze,
  KEYBOARD_SHRINK_RATIO,
  WIDTH_TOLERANCE_PX,
} from '../keyboardGeometry';

describe('computeKeyboardShift', () => {
  // The production case: 32 rows at ~15px plus 16px of .xterm padding, in a
  // container the keyboard has cut to roughly ten rows.
  it('lifts by exactly the amount the grid overflows its container', () => {
    expect(computeKeyboardShift({ gridHeight: 496, containerHeight: 166 })).toBe(330);
  });

  it('never returns a negative lift when the grid fits', () => {
    expect(computeKeyboardShift({ gridHeight: 200, containerHeight: 400 })).toBe(0);
    expect(computeKeyboardShift({ gridHeight: 400, containerHeight: 400 })).toBe(0);
  });

  // offsetHeight is 0 on a detached or hidden node. Lifting by the whole grid
  // height would push it outside its clipping box, and xterm's RenderService
  // IntersectionObserver would then set _isPaused and stop rendering - a
  // terminal that silently goes dead rather than one that looks wrong.
  it('returns 0 rather than a full-height lift for unusable measurements', () => {
    expect(computeKeyboardShift({ gridHeight: 496, containerHeight: 0 })).toBe(0);
    expect(computeKeyboardShift({ gridHeight: 496, containerHeight: -10 })).toBe(0);
    expect(computeKeyboardShift({ gridHeight: NaN, containerHeight: 166 })).toBe(0);
    expect(computeKeyboardShift({ gridHeight: 496, containerHeight: undefined })).toBe(0);
    expect(computeKeyboardShift()).toBe(0);
  });

  // A fractional translate blurs text on a composited layer.
  it('returns an integer for fractional measurements', () => {
    expect(computeKeyboardShift({ gridHeight: 495.6, containerHeight: 166.2 })).toBe(329);
  });
});

describe('distributeTopScroll', () => {
  // The whole point of spending the shift only at the top: everywhere else,
  // scrolling must be byte-for-byte what it was before this existed.
  it('passes travel straight through when the buffer can still scroll', () => {
    expect(distributeTopScroll({ deltaPx: 120, shift: 330, maxShift: 330, atTop: false }))
      .toEqual({ shift: 330, deltaPx: 120 });
  });

  it('does nothing when there is no lift to spend', () => {
    expect(distributeTopScroll({ deltaPx: 120, shift: 0, maxShift: 0, atTop: true }))
      .toEqual({ shift: 0, deltaPx: 120 });
  });

  it('spends the lift once the buffer is exhausted', () => {
    expect(distributeTopScroll({ deltaPx: 100, shift: 330, maxShift: 330, atTop: true }))
      .toEqual({ shift: 230, deltaPx: 0 });
  });

  it('hands back the remainder when the drag outruns the remaining lift', () => {
    expect(distributeTopScroll({ deltaPx: 90, shift: 50, maxShift: 330, atTop: true }))
      .toEqual({ shift: 0, deltaPx: 40 });
  });

  it('never drives the lift below zero', () => {
    const r = distributeTopScroll({ deltaPx: 5000, shift: 330, maxShift: 330, atTop: true });
    expect(r.shift).toBe(0);
    expect(r.deltaPx).toBe(4670);
  });

  // Restored before the buffer moves, so the two undo in the reverse order
  // they were spent and the boundary has no discontinuity.
  it('restores the lift before scrolling back toward newer content', () => {
    expect(distributeTopScroll({ deltaPx: -100, shift: 0, maxShift: 330, atTop: true }))
      .toEqual({ shift: 100, deltaPx: 0 });
  });

  it('never drives the lift above its maximum', () => {
    const r = distributeTopScroll({ deltaPx: -5000, shift: 300, maxShift: 330, atTop: false });
    expect(r.shift).toBe(330);
    expect(r.deltaPx).toBe(-4970);
  });

  it('leaves a fully restored lift alone', () => {
    expect(distributeTopScroll({ deltaPx: -80, shift: 330, maxShift: 330, atTop: false }))
      .toEqual({ shift: 330, deltaPx: -80 });
  });
});

describe('createKeyboardFreeze', () => {
  const PORTRAIT = 393;

  it('seeds on the first observation and does not freeze at mount', () => {
    const f = createKeyboardFreeze();
    const r = f.observe({ height: 800, width: PORTRAIT });
    expect(r.kind).toBe('seed');
    expect(r.frozen).toBe(false);
    expect(f.state.epoch).toBe(0);
  });

  it('freezes on the native signal even for a shallow keyboard', () => {
    const f = createKeyboardFreeze();
    f.observe({ height: 800, width: PORTRAIT });
    // 10% shrink - well short of the ratio, which a landscape tablet keyboard
    // can be. keyboardExpected is ground truth, so no ratio is applied.
    const r = f.observe({ height: 720, width: PORTRAIT, keyboardExpected: true });
    expect(r.kind).toBe('keyboard-open');
    expect(r.frozen).toBe(true);
  });

  // The web path. Capacitor's keyboardWillShow never fires in a browser, so
  // the ratio is the only signal there is.
  it('freezes from the ratio alone when the native signal never arrives', () => {
    const f = createKeyboardFreeze();
    f.observe({ height: 800, width: PORTRAIT });
    const r = f.observe({ height: 800 * KEYBOARD_SHRINK_RATIO - 1, width: PORTRAIT });
    expect(r.kind).toBe('keyboard-open');
    expect(r.frozen).toBe(true);
  });

  it('treats browser chrome as a layout change and re-seeds', () => {
    const f = createKeyboardFreeze();
    f.observe({ height: 800, width: PORTRAIT });
    const r = f.observe({ height: 744, width: PORTRAIT }); // 7% - a URL bar
    expect(r.kind).toBe('layout-change');
    expect(r.frozen).toBe(false);
    expect(f.state.baselineHeight).toBe(744);
  });

  // A genuine viewport change MUST still resize the PTY, even mid-keyboard.
  it('unfreezes when the width changes, because that is a rotation', () => {
    const f = createKeyboardFreeze();
    f.observe({ height: 800, width: PORTRAIT });
    expect(f.observe({ height: 400, width: PORTRAIT }).frozen).toBe(true);

    const r = f.observe({ height: 393, width: 800 });
    expect(r.kind).toBe('layout-change');
    expect(r.frozen).toBe(false);
    expect(f.state.epoch).toBe(2);
  });

  // The highest-probability way this design fails on a device: if a pixel of
  // WebView width jitter counted as a rotation, the freeze would never engage
  // and the bug would persist silently.
  it('ignores sub-tolerance width jitter during the animation', () => {
    const f = createKeyboardFreeze();
    f.observe({ height: 800, width: PORTRAIT });
    const r = f.observe({ height: 400, width: PORTRAIT + WIDTH_TOLERANCE_PX });
    expect(r.kind).toBe('keyboard-open');
    expect(r.frozen).toBe(true);
  });

  it('unfreezes when the keyboard closes', () => {
    const f = createKeyboardFreeze();
    f.observe({ height: 800, width: PORTRAIT });
    f.observe({ height: 400, width: PORTRAIT });
    const r = f.observe({ height: 800, width: PORTRAIT });
    expect(r.kind).toBe('keyboard-closed');
    expect(r.frozen).toBe(false);
  });

  // ~15-20 samples per animation must not become ~15-20 transitions.
  it('bumps the epoch exactly once across an animation burst', () => {
    const f = createKeyboardFreeze();
    f.observe({ height: 800, width: PORTRAIT });
    for (const height of [640, 410, 250, 250]) {
      f.observe({ height, width: PORTRAIT });
    }
    expect(f.state.frozen).toBe(true);
    expect(f.state.epoch).toBe(1);
  });

  // Adopting a mid-animation height as the new "full" height would make the
  // next full reading look like a layout change instead of a close.
  it('does not move the baseline while frozen', () => {
    const f = createKeyboardFreeze();
    f.observe({ height: 800, width: PORTRAIT });
    f.observe({ height: 250, width: PORTRAIT });
    expect(f.state.baselineHeight).toBe(800);
    expect(f.observe({ height: 800, width: PORTRAIT }).kind).toBe('keyboard-closed');
  });

  // Both keyboardDidHide and the visualViewport resize behind it call this.
  it('forceUnfreeze is idempotent', () => {
    const f = createKeyboardFreeze();
    f.observe({ height: 800, width: PORTRAIT });
    f.observe({ height: 250, width: PORTRAIT });
    expect(f.forceUnfreeze().frozen).toBe(false);
    const epochAfter = f.state.epoch;
    f.forceUnfreeze();
    expect(f.state.epoch).toBe(epochAfter);
  });

  it('stays frozen through a partial height change while the keyboard is up', () => {
    const f = createKeyboardFreeze();
    f.observe({ height: 844, width: 390 });
    expect(f.observe({ height: 250, width: 390 }).frozen).toBe(true);
    const r = f.observe({ height: 400, width: 390 });
    expect(r.frozen).toBe(true);
    expect(r.changed).toBe(false);
    expect(f.state.epoch).toBe(1);
  });
});
