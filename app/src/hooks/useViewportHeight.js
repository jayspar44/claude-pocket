import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { createKeyboardFreeze } from '../components/terminal/keyboardGeometry';

/**
 * Hook to track visual viewport height for mobile keyboard awareness.
 *
 * Ghost keyboard handling (native only): Android WebView can retain stale
 * IME insets when switching from another app with keyboard open. Instead of
 * fighting the ghost viewport (which the WebView stubbornly maintains), we
 * make the ghost real by focusing the input — the keyboard fills the gap,
 * and when the user dismisses it normally the viewport recovers properly.
 *
 * Also classifies each change as keyboard vs. genuine layout change, because
 * the terminal must hold its geometry still for the former and must resize for
 * the latter. See components/terminal/keyboardGeometry.js for why.
 *
 * @returns {{height: number, keyboardRef: {current: {frozen: boolean, kind: string, epoch: number}}, keyboardEpoch: number}}
 */
export function useViewportMetrics() {
  const [viewportHeight, setViewportHeight] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.visualViewport?.height || window.innerHeight;
    }
    return 0;
  });
  const [keyboardEpoch, setKeyboardEpoch] = useState(0);

  // A ref, not state, and its identity never changes. Two reasons:
  //
  // The flag has to be armed BEFORE the ResizeObserver sees the container
  // shrink, and a visualViewport resize is a non-discrete event, so a state
  // update from it is default-priority and may commit in a later task.
  // Writing the ref inside the handler is ordering-proof: it is set before the
  // DOM has shrunk, let alone before layout, let alone before RO delivery.
  //
  // And a stable identity means passing it to TerminalView cannot retrigger
  // that component's mount effect, which would dispose and rebuild the whole
  // terminal on every keyboard event.
  const keyboardRef = useRef({ frozen: false, kind: 'seed', epoch: 0 });
  const freezeRef = useRef(null);
  if (freezeRef.current === null) freezeRef.current = createKeyboardFreeze();

  useEffect(() => {
    const freeze = freezeRef.current;

    // epoch changes only when frozen flips, so the ~15-20 samples a keyboard
    // animation produces collapse to one state update and one log line.
    const applyFreeze = (result) => {
      keyboardRef.current.frozen = result.frozen;
      keyboardRef.current.kind = result.kind;
      keyboardRef.current.epoch = result.epoch;
      if (result.changed) {
        // One line per transition, carrying everything needed to tell a
        // failed classification from a working one on a real device - the
        // width fields in particular, since WebView width jitter is the most
        // likely reason the freeze would never engage.
        console.log('[keyboard]', result.kind, {
          frozen: result.frozen,
          baselineHeight: result.baselineHeight,
          baselineWidth: result.baselineWidth,
        });
        setKeyboardEpoch(result.epoch);
      }
    };

    // Tracks whether the keyboard is expected to be showing.
    let keyboardExpected = false;

    // Last known viewport height when keyboard was NOT showing.
    let lastFullHeight = window.visualViewport?.height || window.innerHeight;

    const updateHeight = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      // Width is the one platform-independent way to tell a keyboard (never
      // changes width) from a rotation (always does).
      const width = window.visualViewport?.width || window.innerWidth;

      // Re-align layout viewport with visual viewport. On web mobile Chrome,
      // the URL bar appearing/disappearing leaves the layout scrolled, which
      // hides our top-pinned StatusBar under the URL-bar overlay. With html
      // and body set to overflow:hidden, the only thing that can be scrolled
      // is the layout viewport itself, and resetting it here is harmless.
      window.scrollTo(0, 0);

      // Ghost keyboard detection (native only): viewport shrunk but no
      // keyboardWillShow received → stale IME insets from another app.
      // Instead of fighting it, make the ghost real by showing the keyboard.
      if (Capacitor.isNativePlatform() && !keyboardExpected && height < lastFullHeight * 0.85) {
        // The premise of this branch is that a real IME inset is present, so
        // it counts as a keyboard however the ratio rules would have read it.
        applyFreeze(freeze.observe({ height, width, keyboardExpected: true }));
        window.dispatchEvent(new CustomEvent('ghost-keyboard'));
        // Still set the height to what the viewport reports — the keyboard
        // will fill the gap, so there's no gray space.
        setViewportHeight(height);
        document.body.classList.add('keyboard-visible');
        return;
      }

      applyFreeze(freeze.observe({ height, width, keyboardExpected }));
      setViewportHeight(height);

      if (!keyboardExpected) {
        lastFullHeight = height;
      }

      const keyboardVisible = keyboardExpected && height < lastFullHeight * 0.75;
      document.body.classList.toggle('keyboard-visible', keyboardVisible);
    };

    // On resume: check for ghost keyboard after a short delay to let
    // the WebView settle. If the viewport recovered, great. If not,
    // updateHeight will detect the ghost and trigger keyboard show.
    const handleResume = () => {
      keyboardExpected = false;
      // Synchronously, so a resumed app never restores a stale lift while the
      // deferred updateHeight below is still pending.
      applyFreeze(freeze.forceUnfreeze());
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      document.body.classList.remove('keyboard-visible');
      window.scrollTo(0, 0);

      // Give the native onResume() IME hide + requestApplyInsets time
      // to take effect before checking the viewport
      setTimeout(updateHeight, 300);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateHeight);
      window.visualViewport.addEventListener('scroll', updateHeight);
    } else {
      window.addEventListener('resize', updateHeight);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        handleResume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let appStateListener = null;
    let keyboardShowListener = null;
    let keyboardHideListener = null;

    if (Capacitor.isNativePlatform()) {
      keyboardShowListener = Keyboard.addListener('keyboardWillShow', () => {
        keyboardExpected = true;
      });

      keyboardHideListener = Keyboard.addListener('keyboardDidHide', () => {
        keyboardExpected = false;
        applyFreeze(freeze.forceUnfreeze());
        document.documentElement.style.setProperty('--keyboard-height', '0px');
        document.body.classList.remove('keyboard-visible');
        setTimeout(() => {
          const height = window.visualViewport?.height || window.innerHeight;
          if (height >= lastFullHeight * 0.85) {
            lastFullHeight = height;
          }
          setViewportHeight(lastFullHeight);
          document.body.classList.remove('keyboard-visible');
        }, 100);
      });

      appStateListener = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          handleResume();
        }
      });
    }

    updateHeight();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateHeight);
        window.visualViewport.removeEventListener('scroll', updateHeight);
      } else {
        window.removeEventListener('resize', updateHeight);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      keyboardShowListener?.remove();
      keyboardHideListener?.remove();
      appStateListener?.remove();
    };
  }, []);

  return { height: viewportHeight, keyboardRef, keyboardEpoch };
}

// The original contract, unchanged: callers that only want the number are
// unaffected by the classification added above.
export function useViewportHeight() {
  return useViewportMetrics().height;
}

export default useViewportHeight;
