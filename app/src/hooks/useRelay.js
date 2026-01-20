import { useEffect, useRef, useCallback } from 'react';
import { useRelay as useRelayContext } from '../contexts/RelayContext';

export function useRelay() {
  return useRelayContext();
}

export function useTerminalRelay(terminalRef) {
  const {
    connectionState,
    sendInput,
    sendResize,
    sendInterrupt,
    requestReplay,
    submitInput,
    addMessageListener,
    isConnected,
  } = useRelayContext();

  const isSubscribedRef = useRef(false);

  // Handle incoming messages
  // xterm.js handles all terminal state internally - just write data as it arrives
  useEffect(() => {
    // Only subscribe once per mount
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;

    const unsubscribe = addMessageListener((message) => {
      const terminal = terminalRef.current;
      if (!terminal) return;

      switch (message.type) {
        case 'output':
          terminal.write(message.data);
          break;

        case 'replay':
          // Replay is the full buffer - clear and write
          terminal.clear();
          terminal.write(message.data);
          break;

        case 'status':
          if (message.connected === false) {
            terminal.write('\r\n\x1b[33m[Disconnected from relay]\x1b[0m\r\n');
          }
          break;

        case 'pty-status':
          if (!message.running) {
            terminal.write('\r\n\x1b[31m[Claude Code process not running]\x1b[0m\r\n');
          }
          break;
      }
    });

    return () => {
      unsubscribe();
      isSubscribedRef.current = false;
    };
  }, [addMessageListener, terminalRef]);

  const handleInput = useCallback((data) => {
    sendInput(data);
  }, [sendInput]);

  const handleResize = useCallback((cols, rows) => {
    sendResize(cols, rows);
  }, [sendResize]);

  const handleClearAndReplay = useCallback(() => {
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.clear();
    }
    requestReplay();
  }, [requestReplay, terminalRef]);

  const handleSubmitInput = useCallback((data) => {
    submitInput(data);
  }, [submitInput]);

  return {
    connectionState,
    isConnected,
    sendInput: handleInput,
    sendResize: handleResize,
    sendInterrupt,
    submitInput: handleSubmitInput,
    clearAndReplay: handleClearAndReplay,
  };
}

export default useRelay;
