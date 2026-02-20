import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';

/**
 * Hook to track visual viewport height for mobile keyboard awareness.
 * Uses the Visual Viewport API to detect when the keyboard is shown/hidden.
 * Falls back to window.innerHeight on unsupported browsers.
 *
 * Ghost keyboard guard (native only): Android WebView can retain stale IME
 * insets when switching from another app with keyboard open. This reports a
 * reduced viewport height even though the keyboard isn't visible. We guard
 * against this by tracking Capacitor keyboardWillShow/keyboardDidHide events:
 * if the viewport shrinks significantly but no keyboardWillShow was received,
 * the shrink is treated as a ghost and the full height is used instead.
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
    // On native: viewport shrink without this flag = ghost keyboard → ignored.
    let keyboardExpected = false;

    const getFullHeight = () => window.screen.availHeight;

    const updateHeight = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      const full = getFullHeight();

      // Ghost keyboard guard: viewport reports reduced height but no
      // keyboardWillShow event was received → stale IME insets from
      // another app. Use full height instead.
      if (Capacitor.isNativePlatform() && !keyboardExpected && height < full * 0.85) {
        setViewportHeight(full);
        document.body.classList.remove('keyboard-visible');
        return;
      }

      setViewportHeight(height);
      const keyboardVisible = height < full * 0.75;
      document.body.classList.toggle('keyboard-visible', keyboardVisible);
    };

    // On resume: reset keyboard state and force full height.
    // The ghost keyboard guard in updateHeight will reject any subsequent
    // stale resize events since keyboardExpected is false.
    const handleResume = () => {
      keyboardExpected = false;
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      document.body.classList.remove('keyboard-visible');
      document.activeElement?.blur();
      if (Capacitor.isNativePlatform()) {
        Keyboard.hide().catch(() => {});
      }
      window.scrollTo(0, 0);
      setViewportHeight(getFullHeight());
    };

    // Use Visual Viewport API if available (better keyboard detection)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateHeight);
      window.visualViewport.addEventListener('scroll', updateHeight);
    } else {
      window.addEventListener('resize', updateHeight);
    }

    // Update when page becomes visible (keyboard may have closed while backgrounded)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        handleResume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Native keyboard and app state listeners
    let appStateListener = null;
    let keyboardShowListener = null;
    let keyboardHideListener = null;

    if (Capacitor.isNativePlatform()) {
      // Mark keyboard as expected so updateHeight trusts the viewport shrink
      keyboardShowListener = Keyboard.addListener('keyboardWillShow', () => {
        keyboardExpected = true;
      });

      // Keyboard dismissed: clear expected flag and force correct height
      keyboardHideListener = Keyboard.addListener('keyboardDidHide', () => {
        keyboardExpected = false;
        document.documentElement.style.setProperty('--keyboard-height', '0px');
        document.body.classList.remove('keyboard-visible');
        // Delay to let WebView finish resize animation
        setTimeout(() => {
          const height = window.visualViewport?.height || window.innerHeight;
          const full = getFullHeight();
          setViewportHeight(height < full * 0.85 ? full : height);
          document.body.classList.remove('keyboard-visible');
        }, 100);
      });

      appStateListener = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          handleResume();
        }
      });
    }

    // Initial update
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
