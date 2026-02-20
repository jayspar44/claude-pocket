import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';

/**
 * Hook to track visual viewport height for mobile keyboard awareness.
 *
 * Ghost keyboard handling (native only): Android WebView can retain stale
 * IME insets when switching from another app with keyboard open. Instead of
 * fighting the ghost viewport (which the WebView stubbornly maintains), we
 * make the ghost real by focusing the input — the keyboard fills the gap,
 * and when the user dismisses it normally the viewport recovers properly.
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
    let keyboardExpected = false;

    // Last known viewport height when keyboard was NOT showing.
    let lastFullHeight = window.visualViewport?.height || window.innerHeight;

    const updateHeight = () => {
      const height = window.visualViewport?.height || window.innerHeight;

      // Ghost keyboard detection (native only): viewport shrunk but no
      // keyboardWillShow received → stale IME insets from another app.
      // Instead of fighting it, make the ghost real by showing the keyboard.
      if (Capacitor.isNativePlatform() && !keyboardExpected && height < lastFullHeight * 0.85) {
        window.dispatchEvent(new CustomEvent('ghost-keyboard'));
        // Still set the height to what the viewport reports — the keyboard
        // will fill the gap, so there's no gray space.
        setViewportHeight(height);
        document.body.classList.add('keyboard-visible');
        return;
      }

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
