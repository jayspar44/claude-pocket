import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';

/**
 * Hook to track visual viewport height for mobile keyboard awareness.
 *
 * Ghost keyboard guard (native only): Android WebView can retain stale IME
 * insets when switching from another app with keyboard open, reporting a
 * reduced viewport even though no keyboard is visible. We track Capacitor
 * keyboardWillShow/keyboardDidHide events: if the viewport shrinks but no
 * keyboardWillShow was received, the shrink is a ghost and ignored.
 *
 * We use `lastFullHeight` (the last visualViewport.height when the keyboard
 * was NOT showing) as the fallback instead of screen.availHeight, because
 * on edge-to-edge Android apps visualViewport.height can differ from
 * screen.availHeight, and using the wrong one creates a gap.
 */
export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.visualViewport?.height || window.innerHeight;
    }
    return 0;
  });

  useEffect(() => {
    // Tracks whether the keyboard is expected to be showing.
    // Set true by keyboardWillShow, false by keyboardDidHide and resume.
    let keyboardExpected = false;

    // Last known viewport height when keyboard was NOT showing.
    // Used as fallback when ghost keyboard is detected, instead of
    // screen.availHeight which can differ on edge-to-edge Android.
    let lastFullHeight = window.visualViewport?.height || window.innerHeight;

    const updateHeight = () => {
      const height = window.visualViewport?.height || window.innerHeight;

      // Ghost keyboard guard (native only): viewport shrunk but no
      // keyboardWillShow received → stale IME insets. Use last good height.
      if (Capacitor.isNativePlatform() && !keyboardExpected && height < lastFullHeight * 0.85) {
        setViewportHeight(lastFullHeight);
        document.body.classList.remove('keyboard-visible');
        return;
      }

      setViewportHeight(height);

      // Track the full height when keyboard is not showing
      if (!keyboardExpected) {
        lastFullHeight = height;
      }

      const keyboardVisible = keyboardExpected && height < lastFullHeight * 0.75;
      document.body.classList.toggle('keyboard-visible', keyboardVisible);
    };

    // On resume: reset keyboard state. The ghost keyboard guard in
    // updateHeight will reject any stale resize events automatically.
    const handleResume = () => {
      keyboardExpected = false;
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      document.body.classList.remove('keyboard-visible');
      document.activeElement?.blur();
      if (Capacitor.isNativePlatform()) {
        Keyboard.hide().catch(() => {});
      }
      window.scrollTo(0, 0);
      setViewportHeight(lastFullHeight);
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

  return viewportHeight;
}

export default useViewportHeight;
