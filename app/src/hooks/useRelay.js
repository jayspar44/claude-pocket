import { useEffect, useRef, useCallback } from 'react';
import { useRelay as useRelayContext } from '../contexts/RelayContext';

export function useRelay() {
  return useRelayContext();
}

export function useTerminalRelay(terminalRef) {
  const {
    connectionState,
    ptyStatus,
    sendInput,
    sendResize,
    sendInterrupt,
    requestReplay,
    submitInput,
    addMessageListener,
    isConnected,
    clearDetectedOptions,
    activeInstanceId,
  } = useRelayContext();

  const hasRequestedReplayRef = useRef(false);
  const unsubscribeRef = useRef(null);

  // Handle incoming messages
  // Re-subscribe when activeInstanceId changes to listen to the correct instance
  useEffect(() => {
    // Unsubscribe from previous instance
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    // Subscribe to current instance
    unsubscribeRef.current = addMessageListener((message) => {
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
          if (!message.running && message.exitCode !== undefined) {
            terminal.write(`\r\n\x1b[33m[Claude Code exited with code ${message.exitCode}]\x1b[0m\r\n`);
          }
          break;

        case 'pty-restarting':
          terminal.write(`\r\n\x1b[36m[Auto-restarting Claude Code (attempt ${message.attempt})...]\x1b[0m\r\n`);
          break;

        case 'pty-error':
          terminal.write(`\r\n\x1b[31m[${message.message}]\x1b[0m\r\n`);
          break;
      }
    });

    // Reset replay flag when instance changes so new instance triggers replay
    hasRequestedReplayRef.current = false;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      hasRequestedReplayRef.current = false;
    };
  }, [terminalRef, addMessageListener, activeInstanceId]);

  // Request replay when connected
  // This fixes the race condition where replay is sent before listener is ready
  useEffect(() => {
    if (isConnected && !hasRequestedReplayRef.current) {
      hasRequestedReplayRef.current = true;
      // Small delay to ensure connection is fully established
      const timer = setTimeout(() => {
        requestReplay();
      }, 50);
      return () => clearTimeout(timer);
    }
    // Reset flag when disconnected so reconnection triggers replay
    if (!isConnected) {
      hasRequestedReplayRef.current = false;
    }
  }, [isConnected, requestReplay]);

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
    ptyStatus,
    isConnected,
    sendInput: handleInput,
    sendResize: handleResize,
    sendInterrupt,
    submitInput: handleSubmitInput,
    clearAndReplay: handleClearAndReplay,
    clearDetectedOptions,
  };
}

export default useRelay;
