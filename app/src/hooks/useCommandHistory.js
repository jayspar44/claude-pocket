import { useState, useCallback, useRef, useEffect } from 'react';
import { storage } from '../utils/storage';

const HISTORY_KEY = 'history';
const MAX_HISTORY = 100;

export function useCommandHistory() {
  const [history, setHistory] = useState(() => {
    return storage.getJSON(HISTORY_KEY, []);
  });

  const indexRef = useRef(-1);

  // Save history to storage whenever it changes
  useEffect(() => {
    try {
      storage.setJSON(HISTORY_KEY, history);
    } catch (e) {
      console.error('Failed to save command history:', e);
    }
  }, [history]);

  const addToHistory = useCallback((command) => {
    setHistory((prev) => {
      // Don't add empty commands or duplicates of the last command
      if (!command.trim() || prev[0] === command) {
        return prev;
      }

      // Remove any existing occurrence of this command
      const filtered = prev.filter((cmd) => cmd !== command);

      // Add to the beginning and limit size
      const newHistory = [command, ...filtered].slice(0, MAX_HISTORY);
      return newHistory;
    });

    // Reset navigation index
    indexRef.current = -1;
  }, []);

  const navigateHistory = useCallback((direction) => {
    if (history.length === 0) return null;

    if (direction === 'up') {
      const newIndex = Math.min(indexRef.current + 1, history.length - 1);
      indexRef.current = newIndex;
      return history[newIndex];
    }

    if (direction === 'down') {
      const newIndex = Math.max(indexRef.current - 1, -1);
      indexRef.current = newIndex;
      return newIndex === -1 ? '' : history[newIndex];
    }

    return null;
  }, [history]);

  const resetNavigation = useCallback(() => {
    indexRef.current = -1;
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    indexRef.current = -1;
    storage.remove(HISTORY_KEY);
  }, []);

  return {
    history,
    addToHistory,
    navigateHistory,
    resetNavigation,
    clearHistory,
  };
}

export default useCommandHistory;
