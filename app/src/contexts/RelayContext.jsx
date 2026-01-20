import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const RelayContext = createContext(null);

const DEFAULT_RELAY_URL = 'ws://localhost:4501/ws';
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff

export function RelayProvider({ children }) {
  const [connectionState, setConnectionState] = useState('disconnected'); // disconnected | connecting | connected | reconnecting
  const [ptyStatus, setPtyStatus] = useState(null);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const listenersRef = useRef(new Set());
  const cleanDisconnectTimeRef = useRef(0);

  const getRelayUrl = useCallback(() => {
    const stored = localStorage.getItem('relayUrl');
    return stored || import.meta.env.VITE_RELAY_URL || DEFAULT_RELAY_URL;
  }, []);

  const addMessageListener = useCallback((listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const notifyListeners = useCallback((message) => {
    listenersRef.current.forEach((listener) => {
      try {
        listener(message);
      } catch (err) {
        console.error('Error in message listener:', err);
      }
    });
  }, []);

  const connect = useCallback(() => {
    // Skip reconnect during React StrictMode cleanup/remount cycle
    // Don't reset the timestamp - onclose handler needs it to detect manual disconnect
    if (Date.now() - cleanDisconnectTimeRef.current < 100) {
      return;
    }
    // Reset timestamp after the guard window (for future manual reconnects)
    cleanDisconnectTimeRef.current = 0;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const url = getRelayUrl();
    setConnectionState('connecting');
    setError(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        setError(null);
        reconnectAttemptRef.current = 0;
      };

      ws.onclose = (event) => {
        wsRef.current = null;

        // Check if this close was from a manual disconnect (StrictMode cleanup)
        // If so, don't attempt to reconnect - the guard in connect() will handle it
        const wasManualDisconnect = Date.now() - cleanDisconnectTimeRef.current < 2000;

        if (!event.wasClean && !wasManualDisconnect) {
          // Attempt reconnection only for unexpected disconnects
          const attempt = reconnectAttemptRef.current;
          const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];

          setConnectionState('reconnecting');
          reconnectAttemptRef.current = attempt + 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setConnectionState('disconnected');
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle status messages
          if (message.type === 'status') {
            if (message.connected !== undefined) {
              setConnectionState(message.connected ? 'connected' : 'disconnected');
            }
          } else if (message.type === 'pty-status') {
            setPtyStatus(message);
          }

          // Notify all listeners
          notifyListeners(message);
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };
    } catch (err) {
      setError(err.message);
      setConnectionState('disconnected');
    }
  }, [getRelayUrl, notifyListeners]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      cleanDisconnectTimeRef.current = Date.now();
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setConnectionState('disconnected');
    reconnectAttemptRef.current = 0;
  }, []);

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const sendInput = useCallback((data) => {
    return send({ type: 'input', data });
  }, [send]);

  const sendResize = useCallback((cols, rows) => {
    return send({ type: 'resize', cols, rows });
  }, [send]);

  const sendInterrupt = useCallback(() => {
    return send({ type: 'interrupt' });
  }, [send]);

  const restartPty = useCallback(() => {
    return send({ type: 'restart' });
  }, [send]);

  const requestReplay = useCallback(() => {
    return send({ type: 'replay' });
  }, [send]);

  const submitInput = useCallback((data) => {
    return send({ type: 'submit', data });
  }, [send]);

  const setRelayUrl = useCallback((url) => {
    localStorage.setItem('relayUrl', url);
    disconnect();
    // Small delay to ensure disconnect completes
    setTimeout(() => connect(), 100);
  }, [disconnect, connect]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const value = {
    connectionState,
    ptyStatus,
    error,
    isConnected: connectionState === 'connected',
    isReconnecting: connectionState === 'reconnecting',
    connect,
    disconnect,
    send,
    sendInput,
    sendResize,
    sendInterrupt,
    restartPty,
    requestReplay,
    submitInput,
    addMessageListener,
    getRelayUrl,
    setRelayUrl,
  };

  return (
    <RelayContext.Provider value={value}>
      {children}
    </RelayContext.Provider>
  );
}

export function useRelay() {
  const context = useContext(RelayContext);
  if (!context) {
    throw new Error('useRelay must be used within a RelayProvider');
  }
  return context;
}

export default RelayContext;
