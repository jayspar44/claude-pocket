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

  // Track subscription state
  const subscribedInstanceRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const replayTimerRef = useRef(null);

  // Single effect to handle subscription and replay
  // Only re-runs when activeInstanceId or isConnected changes
  useEffect(() => {
    // Clear any pending replay timer
    if (replayTimerRef.current) {
      clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    // Nothing to do if no instance or not connected
    if (!activeInstanceId || !isConnected) {
      return;
    }

    // Check if we need to switch instances
    const needsSwitch = subscribedInstanceRef.current !== activeInstanceId;

    if (needsSwitch) {
      // Unsubscribe from previous instance first
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Clear terminal when switching (not on initial load)
      if (subscribedInstanceRef.current && terminalRef.current) {
        terminalRef.current.clear();
      }

      // Update tracked instance
      subscribedInstanceRef.current = activeInstanceId;

      // Subscribe to new instance
      const currentInstanceId = activeInstanceId; // Capture for closure
      unsubscribeRef.current = addInstanceMessageListener(currentInstanceId, (message) => {
        const terminal = terminalRef.current;
        if (!terminal) return;

        switch (message.type) {
          case 'output':
            terminal.write(message.data);
            break;

          case 'replay':
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

      // Request replay after subscription is set up
      replayTimerRef.current = setTimeout(() => {
        sendToInstance(currentInstanceId, { type: 'replay' });
        replayTimerRef.current = null;
      }, 50);
    }

    // Cleanup function
    return () => {
      if (replayTimerRef.current) {
        clearTimeout(replayTimerRef.current);
        replayTimerRef.current = null;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      subscribedInstanceRef.current = null;
    };
  }, [activeInstanceId, isConnected, addInstanceMessageListener, sendToInstance, terminalRef]);

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
