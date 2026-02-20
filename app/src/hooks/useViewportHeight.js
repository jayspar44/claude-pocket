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
    // Flag to suppress viewport resize events during resume recovery.
    // Without this, the resume handler sets the correct full height but then
    // a visualViewport resize event fires with the stale ghost keyboard height,
    // overwriting the correct value and leaving gray space below the input.
    let suppressResizeUpdates = false;

    const updateHeight = () => {
      if (suppressResizeUpdates) return;

      const height = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(height);

      // Set keyboard-visible class when viewport shrinks significantly
      const fullHeight = window.screen.height;
      const keyboardVisible = height < fullHeight * 0.75;
      document.body.classList.toggle('keyboard-visible', keyboardVisible);
    };

    // On app resume, detect and correct ghost keyboard viewport state.
    // Android WebView retains stale IME insets when returning from background,
    // reporting a reduced viewport height even though the keyboard isn't visible.
    const updateHeightOnResume = () => {
      // Suppress resize listener to prevent it from overwriting our corrections
      suppressResizeUpdates = true;

      // 1. Immediately reset all keyboard state
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      document.body.classList.remove('keyboard-visible');

      // 2. Force dismiss keyboard: blur active element (tells IME to dismiss)
      //    + explicit Keyboard.hide() + reset scroll position
      document.activeElement?.blur();
      if (Capacitor.isNativePlatform()) {
        Keyboard.hide().catch(() => {});
      }
      window.scrollTo(0, 0);

      // 3. Set height to expected full height immediately
      const maxHeight = window.screen.availHeight;
      setViewportHeight(maxHeight);

      // 4. Poll with rAF until viewport stabilizes to correct height.
      //    This adapts to actual WebView speed instead of guessing with timeouts.
      let stableFrames = 0;
      let frameCount = 0;
      const MAX_FRAMES = 60; // ~1 second at 60fps
      const STABLE_THRESHOLD = 3; // 3 consecutive good frames = stable

      const checkViewport = () => {
        const height = window.visualViewport?.height || window.innerHeight;
        const full = window.screen.availHeight;

        if (height >= full * 0.85) {
          // Viewport looks correct
          stableFrames++;
          if (stableFrames >= STABLE_THRESHOLD) {
            // Stable — do final update with real value and re-enable resize listener
            suppressResizeUpdates = false;
            updateHeight();
            return;
          }
        } else {
          stableFrames = 0;
        }

        frameCount++;
        if (frameCount < MAX_FRAMES) {
          resumeRafId = requestAnimationFrame(checkViewport);
        } else {
          // Max frames reached — force full height and re-enable resize listener
          setViewportHeight(full);
          document.body.classList.remove('keyboard-visible');
          suppressResizeUpdates = false;
        }
      };

      resumeRafId = requestAnimationFrame(checkViewport);
    };

    // Resume state tracking (used by both visibility change and Capacitor handlers)
    let resumeRafId = null;
    let resumeDelayTimer = null;

    const cancelResumePolling = () => {
      if (resumeRafId) { cancelAnimationFrame(resumeRafId); resumeRafId = null; }
      if (resumeDelayTimer) { clearTimeout(resumeDelayTimer); resumeDelayTimer = null; }
      suppressResizeUpdates = false;
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
        cancelResumePolling();
        resumeDelayTimer = setTimeout(updateHeightOnResume, 100);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // For native apps, listen to Capacitor keyboard and app state changes
    let appStateListener = null;
    let keyboardHideListener = null;
    if (Capacitor.isNativePlatform()) {
      // Force viewport update when keyboard hides — Android WebView sometimes
      // doesn't fire visualViewport resize after keyboard dismiss, leaving
      // the container at the keyboard-reduced height (gray space below input).
      keyboardHideListener = Keyboard.addListener('keyboardDidHide', () => {
        document.documentElement.style.setProperty('--keyboard-height', '0px');
        document.body.classList.remove('keyboard-visible');
        // Delay to let WebView finish resize animation
        setTimeout(() => {
          if (suppressResizeUpdates) return;
          const height = window.visualViewport?.height || window.innerHeight;
          const full = window.screen.availHeight;
          if (height < full * 0.85) {
            setViewportHeight(full);
          } else {
            setViewportHeight(height);
          }
          document.body.classList.remove('keyboard-visible');
        }, 100);
      });

      appStateListener = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          cancelResumePolling();
          // Short delay before resume handler to let OS settle
          resumeDelayTimer = setTimeout(updateHeightOnResume, 150);
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
      cancelResumePolling();
      keyboardHideListener?.remove();
      appStateListener?.remove();
    };
  }, []);

  return viewportHeight;
}

export default useViewportHeight;
