import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

let keyboardListeners = [];

export const setupKeyboardListeners = () => {
  // Only run on native platforms
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // Set resize mode to native
  Keyboard.setResizeMode({ mode: 'native' }).catch(err => {
    console.warn('Could not set keyboard resize mode:', err);
  });

  // Keyboard will show listener
  const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
    // Set keyboard height as CSS variable
    const keyboardHeight = info.keyboardHeight || 0;
    document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
    document.body.classList.add('keyboard-visible');
  });

  // Keyboard will hide listener
  const hideListener = Keyboard.addListener('keyboardWillHide', () => {
    // Reset keyboard height
    document.documentElement.style.setProperty('--keyboard-height', '0px');
    document.body.classList.remove('keyboard-visible');
  });

  keyboardListeners.push(showListener, hideListener);

  return () => {
    keyboardListeners.forEach(listener => listener.remove());
    keyboardListeners = [];
  };
};
