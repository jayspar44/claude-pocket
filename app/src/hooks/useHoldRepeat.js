import { useCallback, useEffect, useRef } from 'react';

// Returns pointer-event props that, when spread onto a button, fire `fn`
// immediately on press, then after `delay` ms start firing every `interval` ms
// until release/leave/cancel. Cleans up on unmount.
//
// Mirrors OS-level key-repeat behavior:
//   t=0                  — fire (the initial action, same as a plain click)
//   t=delay              — fire (start of repeat)
//   t=delay+N*interval   — fire
export function useHoldRepeat(fn, { delay = 500, interval = 100 } = {}) {
  // Keep latest closure in a ref so handlers stay stable across renders.
  // Sync via effect (not during render) per react-hooks/refs.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const delayTimer = useRef(null);
  const repeatTimer = useRef(null);

  const stop = useCallback(() => {
    if (delayTimer.current) {
      clearTimeout(delayTimer.current);
      delayTimer.current = null;
    }
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop(); // defensive: cancel any leftover timers from a stuck pointer
    fnRef.current(); // immediate first fire (matches keyboard press)
    delayTimer.current = setTimeout(() => {
      repeatTimer.current = setInterval(() => fnRef.current(), interval);
    }, delay);
  }, [stop, delay, interval]);

  // Clean up timers when the consumer component unmounts
  useEffect(() => stop, [stop]);

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,    // finger drags off the button -> stop repeating
    onPointerCancel: stop,   // system gesture cancels -> stop repeating
  };
}
