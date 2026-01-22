import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

const RelayContext = createContext(null);

const DEFAULT_RELAY_URL = 'ws://localhost:4501/ws';
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
const MAX_RECONNECT_ATTEMPTS = 5; // Stop trying after 5 failed attempts
const CONNECTION_TIMEOUT = 10000; // 10s timeout for initial connection
const HEARTBEAT_INTERVAL = 25000; // 25s ping interval
const HEARTBEAT_TIMEOUT = 5000; // 5s pong timeout

export function RelayProvider({ children }) {
  const [connectionState, setConnectionState] = useState('disconnected'); // disconnected | connecting | connected | reconnecting
  const [ptyStatus, setPtyStatus] = useState(null);
  const [error, setError] = useState(null);
  const [detectedOptions, setDetectedOptions] = useState([]);

  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const listenersRef = useRef(new Set());
  const cleanDisconnectTimeRef = useRef(0);
  const connectRef = useRef(null); // Ref to store connect function for self-referencing
  const connectionTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const pongTimeoutRef = useRef(null);

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

  // Clean up all connection-related timers
  const cleanupTimers = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }
  }, []);

  // Start heartbeat ping/pong cycle
  const startHeartbeat = useCallback((ws) => {
    // Clear any existing heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
        // Set timeout for pong response
        pongTimeoutRef.current = setTimeout(() => {
          console.warn('[Relay] Heartbeat timeout - closing connection');
          ws.close(4000, 'Heartbeat timeout');
        }, HEARTBEAT_TIMEOUT);
      }
    }, HEARTBEAT_INTERVAL);
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

      // Set connection timeout - fail fast if server unreachable
      connectionTimeoutRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.warn('[Relay] Connection timeout');
          ws.close(4001, 'Connection timeout');
        }
      }, CONNECTION_TIMEOUT);

      ws.onopen = () => {
        // Clear connection timeout
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }

        setConnectionState('connected');
        setError(null);
        reconnectAttemptRef.current = 0;

        // Start heartbeat
        startHeartbeat(ws);
      };

      ws.onclose = (event) => {
        wsRef.current = null;

        // Clean up all timers
        cleanupTimers();

        // Check if this close was from a manual disconnect (StrictMode cleanup)
        // If so, don't attempt to reconnect - the guard in connect() will handle it
        const wasManualDisconnect = Date.now() - cleanDisconnectTimeRef.current < 2000;

        if (!event.wasClean && !wasManualDisconnect) {
          // Attempt reconnection only for unexpected disconnects
          const attempt = reconnectAttemptRef.current;

          if (attempt >= MAX_RECONNECT_ATTEMPTS) {
            console.warn(`[Relay] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`);
            setConnectionState('disconnected');
            setError('Connection failed after multiple attempts');
            return;
          }

          const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
          console.log(`[Relay] Connection closed (code: ${event.code}), reconnecting in ${delay}ms (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          setConnectionState('reconnecting');
          reconnectAttemptRef.current = attempt + 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current?.();
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

          // Handle pong response - clear the heartbeat timeout
          if (message.type === 'pong') {
            if (pongTimeoutRef.current) {
              clearTimeout(pongTimeoutRef.current);
              pongTimeoutRef.current = null;
            }
            return; // Don't notify listeners for internal messages
          }

          // Handle status messages
          if (message.type === 'status') {
            if (message.connected !== undefined) {
              setConnectionState(message.connected ? 'connected' : 'disconnected');
            }
          } else if (message.type === 'pty-status') {
            setPtyStatus(message);
          } else if (message.type === 'pty-crash') {
            // Log crash details for debugging
            console.error('[Claude Crash]', {
              exitCode: message.exitCode,
              signal: message.signal,
              uptime: message.uptime,
              lastOutput: message.lastOutput,
            });
          } else if (message.type === 'options-detected') {
            // Update detected options from PTY output
            setDetectedOptions(message.options || []);
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
  }, [getRelayUrl, notifyListeners, cleanupTimers, startHeartbeat]);

  // Keep ref updated for self-referencing in reconnect timeout
  connectRef.current = connect;

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clean up heartbeat and connection timers
    cleanupTimers();

    if (wsRef.current) {
      cleanDisconnectTimeRef.current = Date.now();
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setConnectionState('disconnected');
    reconnectAttemptRef.current = 0;
  }, [cleanupTimers]);

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

  const clearDetectedOptions = useCallback(() => {
    setDetectedOptions([]);
  }, []);

  const setRelayUrl = useCallback((url) => {
    localStorage.setItem('relayUrl', url);
    disconnect();
    // Small delay to ensure disconnect completes
    setTimeout(() => connect(), 100);
  }, [disconnect, connect]);

  // Auto-connect on mount
  useEffect(() => {
    // Delay connection to handle React StrictMode mount-unmount-remount cycle
    // Without this delay, the StrictMode guard in connect() blocks the second mount
    const timer = setTimeout(() => connect(), 150);
    return () => {
      clearTimeout(timer);
      disconnect();
    };
  }, [connect, disconnect]);

  // Reconnect when app returns from background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) return;

      // Check if reconnection needed
      const ws = wsRef.current;
      const needsReconnect = !ws ||
        ws.readyState === WebSocket.CLOSED ||
        ws.readyState === WebSocket.CLOSING;

      if (needsReconnect) {
        reconnectAttemptRef.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Capacitor native app state listener
    let appStateListener = null;
    if (Capacitor.isNativePlatform()) {
      appStateListener = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) handleVisibilityChange();
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      appStateListener?.remove();
    };
  }, [connect]);

  // Reconnect when network status changes (WiFi/cellular transitions)
  useEffect(() => {
    let networkListener = null;

    const setupNetworkListener = async () => {
      // Only set up network listener on native platforms
      if (!Capacitor.isNativePlatform()) {
        return;
      }

      try {
        // Dynamic import to avoid issues in web browser
        const { Network } = await import('@capacitor/network');
        networkListener = await Network.addListener('networkStatusChange', (status) => {
          console.log('[Relay] Network status changed:', status);

          if (status.connected) {
            // Network restored - check if we need to reconnect
            const ws = wsRef.current;
            const needsReconnect = !ws ||
              ws.readyState === WebSocket.CLOSED ||
              ws.readyState === WebSocket.CLOSING;

            if (needsReconnect) {
              console.log('[Relay] Network restored, reconnecting...');
              reconnectAttemptRef.current = 0;
              if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
              }
              connect();
            }
          }
        });
      } catch (err) {
        // Network plugin may not be available
        console.debug('[Relay] Network listener not available:', err.message);
      }
    };

    setupNetworkListener();

    return () => {
      networkListener?.remove();
    };
  }, [connect]);

  const value = {
    connectionState,
    ptyStatus,
    error,
    detectedOptions,
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
    clearDetectedOptions,
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
