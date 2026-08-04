/**
 * Debounces the path from "the terminal container changed size" to "tell the
 * PTY", so a burst of intermediate sizes never reaches the CLI.
 *
 * ResizeObserver -> requestAnimationFrame -> fit() -> onResize() coalesces
 * within a single frame (~16ms); it is not a debounce. On mobile, opening or
 * closing the keyboard animates the viewport for a few hundred milliseconds and
 * fires a resize callback per frame, so every intermediate geometry is shipped
 * to the PTY. This deployment's relay logs show it: PTY spawns at 57x12 and
 * 57x10 alongside the normal 57x44, caught because the animation happened to
 * land on a spawn. The same intermediate sizes are sent as ordinary resizes
 * constantly, and each one is a SIGWINCH that makes a full-screen TUI repaint
 * at geometry xterm has already moved on from - the "resize roundtrip" race
 * (xterm.js#1914), whose visible symptom is duplicated blocks of output.
 *
 * This is a mitigation, not a cure. The race is inherent to resizing
 * asynchronously: output already in flight was generated under the previous
 * dimensions no matter how few resizes we send. What this removes is the
 * self-inflicted part - the dozens of resizes per keyboard animation that had
 * no chance of being correct because the viewport was still moving.
 *
 * Three rules, and the reasoning for each:
 *
 * FIRST SIZE GOES STRAIGHT THROUGH. The relay defers starting the PTY until a
 * resize frame arrives with real xterm dimensions, with a 3s fallback that
 * spawns at whatever set-instance carried. Delaying the first notification
 * pushes sessions toward that fallback - the exact regression this branch
 * already fixed once. So the first size of a terminal's life is delivered
 * synchronously; only later ones, which are changes to an already-running PTY,
 * can afford to wait. Note this is deliberately NOT a leading-edge debounce:
 * a leading edge fires on the first event of every burst, which is precisely
 * the mid-animation size we are trying to suppress.
 *
 * A SIZE EQUAL TO THE LAST ONE SENT SENDS NOTHING - and cancels whatever was
 * pending. A keyboard open/close cycle ends where it started, so the whole
 * cycle collapses to zero frames. The cancel is the load-bearing half: drop
 * the settled 57x44 as a duplicate but leave the pending 57x12 armed and the
 * timer delivers the intermediate size as if it were the final one, which is
 * worse than not deduplicating at all.
 *
 * ONLY NON-POSITIVE OR NON-FINITE SIZES ARE REJECTED. There is deliberately no
 * plausibility floor ("reject rows < 20"). A small phone in landscape with the
 * keyboard up legitimately has very few rows, and rejecting a real size would
 * strand the PTY at a geometry the user is no longer looking at - worse than
 * the problem being solved. The transient small sizes are already handled by
 * being transient. An invalid reading does not disturb a pending real one
 * either: a container measured at zero while hidden should not discard the
 * last real geometry we were about to send.
 *
 * @param {Object} deps
 * @param {Function} deps.notify - called with (cols, rows) when a size settles
 * @param {number} [deps.delay] - debounce interval in ms
 * @param {Function} [deps.setTimer] - injected for tests
 * @param {Function} [deps.clearTimer] - injected for tests
 */

/**
 * 200ms, the interval practitioners report fixes the duplicate-line symptom on
 * this stack (wezterm#3363). It has to comfortably exceed the gap between
 * resize callbacks during an animation - those arrive per frame (~16ms), so
 * 200ms absorbs a lot of jank before it would fire mid-animation and ship an
 * intermediate size. The cost of the other direction is only latency on the
 * settled size, paid at the end of an animation the user just performed, and
 * it never applies to the first size, which is the only one anything is
 * waiting on.
 */
export const RESIZE_DEBOUNCE_MS = 200;

export function createResizeNotifier({
  notify,
  delay = RESIZE_DEBOUNCE_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let timer = null;
  let pending = null;
  // Doubles as "nothing has been sent yet", which is what makes the first size
  // synchronous. One piece of state, both jobs.
  let lastSent = null;
  let cancelled = false;

  const deliver = (cols, rows) => {
    lastSent = { cols, rows };
    notify(cols, rows);
  };

  const clearPending = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    pending = null;
  };

  return {
    resize(cols, rows) {
      if (cancelled) return;
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
      if (cols <= 0 || rows <= 0) return;

      if (lastSent === null) {
        deliver(cols, rows);
        return;
      }

      if (lastSent.cols === cols && lastSent.rows === rows) {
        clearPending();
        return;
      }

      pending = { cols, rows };
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        const settled = pending;
        pending = null;
        if (settled) deliver(settled.cols, settled.rows);
      }, delay);
    },

    /**
     * Called when the terminal is disposed or the component unmounts. A pending
     * timer must not fire into a torn-down terminal, and - because the effect
     * that owns this is re-run whenever the onResize prop identity changes -
     * a later call must not reach a superseded parent callback either. So
     * cancel is final: it drops the pending size rather than flushing it. The
     * relay keeps the last dimensions it was told, and a reconnect re-syncs
     * geometry through set-instance's handshake payload, so nothing is lost by
     * dropping a size we can no longer vouch for.
     */
    cancel() {
      cancelled = true;
      clearPending();
    },
  };
}
