/**
 * Decides when the terminal's geometry must be held still, and how far to lift
 * the grid so its bottom edge stays above the keyboard.
 *
 * THE PROBLEM. Claude Code is a full-screen TUI. It redraws in place with
 * cursor-up plus erase, sized by the rows it was last told about. Shrinking the
 * terminal when the keyboard opens SIGWINCHes it, and if the repaint that
 * follows is taller than the new viewport, the previous frame scrolls into
 * xterm's scrollback - where those cursor-up sequences can no longer reach it.
 * Reopening the keyboard draws a fresh copy underneath and the stranded one
 * stays forever. Observed in production: one 58s generation with the keyboard
 * toggled mid-stream (rows 32 -> 10 -> 32, cols constant at 43) left the same
 * response on screen twice, and the two copies wrapped differently - the proof
 * that they were two different frames rather than duplicated bytes.
 *
 * WHY DEBOUNCING CANNOT FIX IT. resizeNotifier already collapses an open/close
 * round trip to zero frames, because the size it settles on equals the last one
 * sent. That is not the failing case. The failing case is the keyboard staying
 * open while output streams: 43x10 settles, is delivered legitimately, and the
 * repaint happens. No interval helps. Only not resizing helps.
 *
 * SO: hold rows at the keyboard-closed value and move the view instead. The
 * grid keeps its size, every repaint overwrites exactly the region it wrote
 * before, and nothing can scroll into scrollback. The user still sees recent
 * output and the CLI's input box above the keyboard, because the grid is lifted
 * until its bottom edge meets the shrunken container's.
 *
 * This module is the pure half of that: no DOM, no React, no imports. The glue
 * in TerminalView is deliberately thin, because the app's test suite runs in
 * the node environment with no jsdom and no React plugin - so logic that lives
 * here is covered and logic that lives in the component is not.
 */

/**
 * Below this fraction of the last full height, a shrink is a keyboard.
 *
 * This is the web path, where Capacitor's keyboardWillShow never fires and a
 * ratio is the only tool available. Mobile browser chrome (a URL bar appearing)
 * is 56-110px, comfortably under 25% of any phone viewport; a keyboard is
 * 35-55%. 0.75 sits in the gap with room on both sides.
 */
export const KEYBOARD_SHRINK_RATIO = 0.75;

/**
 * How much width movement still counts as "the width did not change".
 *
 * Width is the one platform-independent way to tell a keyboard (never changes
 * width) from a rotation (always does), so it is the first rule. But an Android
 * WebView that reports a single pixel of width jitter during the keyboard
 * animation would trip that rule on every keyboard event and the freeze would
 * never engage - the bug would persist silently, which is the worst failure
 * mode available here. Two pixels of slack costs nothing: no real orientation
 * change is that small.
 */
export const WIDTH_TOLERANCE_PX = 2;

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * How far to lift the grid so its bottom edge sits on the container's bottom
 * edge. This is the MAXIMUM shift; how much of it is currently spent is decided
 * by distributeTopScroll.
 *
 * Integer pixels: a fractional translate blurs text on a composited layer.
 *
 * Returns 0 rather than something plausible-looking whenever the inputs are not
 * usable. offsetHeight is 0 on a detached or hidden node, and a shift equal to
 * the whole grid height would push the grid outside its clipping box - at which
 * point xterm's RenderService IntersectionObserver sets _isPaused and stops
 * rendering entirely. That clamp is load-bearing, not defensive noise.
 *
 * @param {{gridHeight: number, containerHeight: number}} dims
 * @returns {number} >= 0
 */
export function computeKeyboardShift({ gridHeight, containerHeight } = {}) {
  if (!isFiniteNumber(gridHeight) || !isFiniteNumber(containerHeight)) return 0;
  if (containerHeight <= 0) return 0;
  const overflow = gridHeight - containerHeight;
  if (!(overflow > 0)) return 0;
  return Math.floor(overflow);
}

/**
 * Splits scroll travel between the lifted grid and the buffer.
 *
 * Without this the lifted rows would be dead space: the grid paints buffer
 * lines [viewportY, viewportY + rows), only the bottom slice is visible, and
 * viewportY bottoms out at 0 - so the oldest rows in the buffer could never be
 * brought into view while the keyboard was open. Invisible deep in a session;
 * very visible right after a Refresh, when those rows are the top of recent
 * history.
 *
 * The shift is spent only once the buffer itself is exhausted, so the common
 * case - scrolling anywhere other than the very top - is byte-for-byte what it
 * was before, and the shift is always at maximum whenever the user is at the
 * bottom. That last property is what lets isAtBottom, the write() auto-scroll
 * and the scroll-to-bottom button stay untouched.
 *
 * @param {Object} args
 * @param {number} args.deltaPx  travel in px; positive reveals OLDER content
 * @param {number} args.shift    px currently lifted
 * @param {number} args.maxShift px available to lift (0 when not frozen)
 * @param {boolean} args.atTop   the buffer can scroll no further back
 * @returns {{shift: number, deltaPx: number}} new shift, and the travel left
 *   over for the caller to hand to scrollLines
 */
export function distributeTopScroll({ deltaPx, shift, maxShift, atTop } = {}) {
  const safeShift = isFiniteNumber(shift) ? shift : 0;
  const safeMax = isFiniteNumber(maxShift) && maxShift > 0 ? maxShift : 0;
  const safeDelta = isFiniteNumber(deltaPx) ? deltaPx : 0;

  // Not frozen: nothing to spend, and the caller's path is unchanged.
  if (safeMax === 0) return { shift: 0, deltaPx: safeDelta };

  const clamped = Math.min(Math.max(safeShift, 0), safeMax);

  // Revealing older content, and the buffer has nothing left to give.
  if (safeDelta > 0 && atTop && clamped > 0) {
    const spend = Math.min(safeDelta, clamped);
    return { shift: clamped - spend, deltaPx: safeDelta - spend };
  }

  // Coming back toward newer content: put the lift back before the buffer
  // moves, so the two undo in the reverse order they were spent.
  if (safeDelta < 0 && clamped < safeMax) {
    const restore = Math.min(-safeDelta, safeMax - clamped);
    return { shift: clamped + restore, deltaPx: safeDelta + restore };
  }

  return { shift: clamped, deltaPx: safeDelta };
}

/**
 * Classifies viewport changes and tracks whether the geometry is frozen.
 *
 * The rules are ordered, and the order matters:
 *
 *   1. Width moved  -> a real layout change (rotation). Unfreeze and re-seed.
 *      This is what keeps a genuine change resizing the PTY, including a
 *      rotation that happens while the keyboard is open.
 *   2. keyboardExpected and shorter -> keyboard. No ratio: on native we have
 *      ground truth from Capacitor, and a landscape tablet's keyboard can be
 *      shallow enough to miss a ratio test.
 *   3. Shrunk past the ratio -> keyboard. The web path, where rule 2 can never
 *      fire because keyboardExpected is never set.
 *   4. Back to full height -> keyboard closed. Re-seed.
 *   5. Anything else -> browser chrome. Re-seed.
 *
 * THE BASELINE IS NEVER UPDATED WHILE FROZEN. Adopting a mid-animation height
 * as the new "full" height would make the next full-height reading look like a
 * change instead of a close, and the whole thing unwinds.
 *
 * epoch increments ONLY when frozen flips, so the ~15-20 samples a keyboard
 * animation produces collapse to exactly one transition for consumers.
 *
 * @param {{shrinkRatio?: number, widthTolerance?: number}} [options]
 */
export function createKeyboardFreeze({
  shrinkRatio = KEYBOARD_SHRINK_RATIO,
  widthTolerance = WIDTH_TOLERANCE_PX,
} = {}) {
  let frozen = false;
  let epoch = 0;
  let baselineHeight = null;
  let baselineWidth = null;

  const snapshot = (kind, changed) => ({
    kind,
    frozen,
    changed,
    epoch,
    baselineHeight,
    baselineWidth,
  });

  const settle = (kind, nextFrozen, height, width) => {
    const changed = nextFrozen !== frozen;
    if (changed) {
      frozen = nextFrozen;
      epoch += 1;
    }
    // Re-seed only while unfrozen; see the note above.
    if (!frozen) {
      baselineHeight = height;
      baselineWidth = width;
    }
    return snapshot(kind, changed);
  };

  return {
    observe({ height, width, keyboardExpected = false } = {}) {
      if (!isFiniteNumber(height) || height <= 0) return snapshot('ignored', false);
      const w = isFiniteNumber(width) ? width : baselineWidth;

      if (baselineHeight === null) {
        baselineHeight = height;
        baselineWidth = w;
        return snapshot('seed', false);
      }

      if (isFiniteNumber(w) && isFiniteNumber(baselineWidth)
        && Math.abs(w - baselineWidth) > widthTolerance) {
        return settle('layout-change', false, height, w);
      }

      if (keyboardExpected && height < baselineHeight) {
        return settle('keyboard-open', true, height, w);
      }

      if (height <= baselineHeight * shrinkRatio) {
        return settle('keyboard-open', true, height, w);
      }

      if (height >= baselineHeight) {
        return settle('keyboard-closed', false, height, w);
      }

      return settle('layout-change', false, height, w);
    },

    // Idempotent on purpose: both the Capacitor keyboardDidHide listener and
    // the visualViewport resize that follows it will call this.
    forceUnfreeze() {
      return settle('keyboard-closed', false, baselineHeight, baselineWidth);
    },

    get state() {
      return { frozen, epoch, baselineHeight, baselineWidth };
    },
  };
}
