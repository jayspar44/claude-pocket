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
    submitInput,
    isConnected,
    clearDetectedOptions,
    activeInstanceId,
    // Use instance-specific functions for proper routing
    addInstanceMessageListener,
    sendToInstance,
  } = useRelayContext();

  const hasRequestedReplayRef = useRef(false);
  const unsubscribeRef = useRef(null);
  const prevInstanceIdRef = useRef(null);

  // Handle incoming messages and instance switching
  // Re-subscribe when activeInstanceId changes to listen to the correct instance
  useEffect(() => {
    if (!activeInstanceId) return;

    const isInstanceSwitch = prevInstanceIdRef.current && prevInstanceIdRef.current !== activeInstanceId;
    prevInstanceIdRef.current = activeInstanceId;

    // Unsubscribe from previous instance
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Clear terminal on instance switch (before subscribing to new instance)
    if (isInstanceSwitch && terminalRef.current) {
      terminalRef.current.clear();
    }

    // Subscribe to current instance using instance-specific listener
    unsubscribeRef.current = addInstanceMessageListener(activeInstanceId, (message) => {
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

    // Request replay immediately for the new instance (after subscription is set up)
    if (isInstanceSwitch) {
      // Small delay to ensure subscription is fully registered
      const timer = setTimeout(() => {
        sendToInstance(activeInstanceId, { type: 'replay' });
        hasRequestedReplayRef.current = true;
      }, 50);
      return () => {
        clearTimeout(timer);
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      };
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      hasRequestedReplayRef.current = false;
    };
  }, [terminalRef, addInstanceMessageListener, activeInstanceId, sendToInstance]);

  // Request replay when first connected (not on instance switch - that's handled above)
  useEffect(() => {
    if (isConnected && !hasRequestedReplayRef.current && activeInstanceId) {
      hasRequestedReplayRef.current = true;
      // Small delay to ensure connection is fully established
      const timer = setTimeout(() => {
        sendToInstance(activeInstanceId, { type: 'replay' });
      }, 50);
      return () => clearTimeout(timer);
    }
    // Reset flag when disconnected so reconnection triggers replay
    if (!isConnected) {
      hasRequestedReplayRef.current = false;
    }
  }, [isConnected, activeInstanceId, sendToInstance]);

  const handleInput = useCallback((data) => {
    sendInput(data);
  }, [sendInput]);

  const handleResize = useCallback((cols, rows) => {
    sendResize(cols, rows);
  }, [sendResize]);

  // Clear terminal and request replay from current instance
  const handleClearAndReplay = useCallback(() => {
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.clear();
    }
    if (activeInstanceId) {
      sendToInstance(activeInstanceId, { type: 'replay' });
    }
  }, [activeInstanceId, sendToInstance, terminalRef]);

  const handleSubmitInput = useCallback((data) => {
    submitInput(data);
  }, [submitInput]);

  return {
    connectionState,
    ptyStatus,
    isConnected,
    activeInstanceId,
    sendInput: handleInput,
    sendResize: handleResize,
    sendInterrupt,
    submitInput: handleSubmitInput,
    clearAndReplay: handleClearAndReplay,
    clearDetectedOptions,
  };
}

export default useRelay;
