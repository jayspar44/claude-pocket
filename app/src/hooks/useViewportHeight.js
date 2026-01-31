import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

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
        // Small delay to let the viewport settle after becoming visible
        setTimeout(updateHeight, 100);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // For native apps, also listen to Capacitor app state changes
    let appStateListener = null;
    if (Capacitor.isNativePlatform()) {
      appStateListener = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          // Small delay to let the viewport settle
          setTimeout(updateHeight, 100);
        }
      });
    }

    // Initial update - use innerHeight first, then update after delay
    // This fixes stale visualViewport when switching from another app with keyboard open
    if (Capacitor.isNativePlatform()) {
      // On native, use innerHeight initially (more reliable on app launch)
      setViewportHeight(window.innerHeight);
      // Then update with visualViewport after keyboard state settles
      setTimeout(updateHeight, 150);
    } else {
      updateHeight();
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateHeight);
        window.visualViewport.removeEventListener('scroll', updateHeight);
      } else {
        window.removeEventListener('resize', updateHeight);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      appStateListener?.remove();
    };
  }, []);

  return viewportHeight;
}

export default useViewportHeight;
