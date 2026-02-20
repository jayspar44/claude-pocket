import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

let keyboardListeners = [];

export const setupKeyboardListeners = () => {
  // Only run on native platforms
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // Set resize mode to native (note: resize config is iOS-only,
  // Android uses windowSoftInputMode from AndroidManifest)
  Keyboard.setResizeMode({ mode: 'native' }).catch(err => {
    console.warn('Could not set keyboard resize mode:', err);
  });

  // Keyboard will show listener — only sets CSS variable (class managed by useViewportHeight)
  const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
    const keyboardHeight = info.keyboardHeight || 0;
    document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
  });

  // Keyboard will hide listener — only resets CSS variable (class managed by useViewportHeight)
  const hideListener = Keyboard.addListener('keyboardWillHide', () => {
    document.documentElement.style.setProperty('--keyboard-height', '0px');
  });

  keyboardListeners.push(showListener, hideListener);

  return () => {
    keyboardListeners.forEach(listener => listener.remove());
    keyboardListeners = [];
  };
};
