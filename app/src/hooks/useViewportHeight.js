import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';

/**
 * Hook to track visual viewport height for mobile keyboard awareness.
 * Uses the Visual Viewport API to detect when the keyboard is shown/hidden.
 * Falls back to window.innerHeight on unsupported browsers.
 * Also updates when app returns from background (keyboard may have closed).
 */
export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.visualViewport?.height || window.innerHeight;
    }
    return 0;
  });

  useEffect(() => {
    const updateHeight = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(height);

      // Set keyboard-visible class when viewport shrinks significantly
      const fullHeight = window.screen.height;
      const keyboardVisible = height < fullHeight * 0.75;
      document.body.classList.toggle('keyboard-visible', keyboardVisible);
    };

    // On app resume, detect and correct ghost keyboard viewport state.
    // This happens when switching from another app that had the keyboard open -
    // Android WebView retains stale IME insets, reporting a reduced viewport height.
    // Uses screen.availHeight as a sanity reference since it's unaffected by keyboard state.
    const updateHeightOnResume = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      const maxHeight = window.screen.availHeight;

      // If viewport is much smaller than screen available height,
      // the keyboard isn't actually open - it's ghost state
      if (height < maxHeight * 0.85) {
        // Dismiss any ghost IME state
        if (Capacitor.isNativePlatform()) {
          Keyboard.hide().catch(() => {});
        }

        // Use screen.availHeight as the correct height
        setViewportHeight(maxHeight);
        document.body.classList.remove('keyboard-visible');

        // Also schedule a normal update for when the WebView catches up
        setTimeout(updateHeight, 500);
      } else {
        setViewportHeight(height);
      }
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
        setTimeout(updateHeightOnResume, 100);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // For native apps, also listen to Capacitor app state changes
    let appStateListener = null;
    let resumeTimer = null;
    if (Capacitor.isNativePlatform()) {
      appStateListener = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          if (resumeTimer) clearTimeout(resumeTimer);
          resumeTimer = setTimeout(updateHeightOnResume, 150);
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
      if (resumeTimer) clearTimeout(resumeTimer);
      appStateListener?.remove();
    };
  }, []);

  return viewportHeight;
}

export default useViewportHeight;
