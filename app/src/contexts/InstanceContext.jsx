import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { notificationService } from '../services/NotificationService';
import { storage } from '../utils/storage';

// Register the foreground service plugin (Android only)
const WebSocketService = Capacitor.isNativePlatform()
  ? registerPlugin('WebSocketService')
  : null;

const InstanceContext = createContext(null);

// Connection constants
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_RECONNECT_ATTEMPTS = 5;
const CONNECTION_TIMEOUT = 10000;
const HEARTBEAT_INTERVAL = 25000;
const HEARTBEAT_TIMEOUT = 5000;
const MAX_CONCURRENT_CONNECTIONS = 3;

// Storage keys (will be prefixed with port by storage utility)
const INSTANCES_KEY = 'instances';
const ACTIVE_INSTANCE_KEY = 'active-instance';

// Default colors for instances
const INSTANCE_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];

// Auto-detect relay URL based on build environment and app port
const getDefaultRelayUrl = () => {
  const host = import.meta.env.VITE_RELAY_HOST || 'minibox.rattlesnake-mimosa.ts.net';
  const devRelayPort = import.meta.env.VITE_DEV_RELAY_PORT || '4503';
  const prodRelayPort = import.meta.env.VITE_PROD_RELAY_PORT || '4501';

  // For native apps (Capacitor), use VITE_APP_ENV set at build time
  const appEnv = import.meta.env.VITE_APP_ENV;
  if (appEnv === 'dev') return `ws://${host}:${devRelayPort}/ws`;
  if (appEnv === 'prod') return `ws://${host}:${prodRelayPort}/ws`;

  // For web, detect from port
  if (typeof window !== 'undefined' && window.location.port) {
    const appPort = window.location.port;
    const webHost = window.location.hostname;
    const devAppPort = import.meta.env.VITE_DEV_APP_PORT || '4502';
    if (appPort === devAppPort) return `ws://${webHost}:${devRelayPort}/ws`;
    return `ws://${webHost}:${prodRelayPort}/ws`;
  }

  return import.meta.env.VITE_RELAY_URL || `ws://${host}:${prodRelayPort}/ws`;
};

// Default instance ID must match relay's DEFAULT_INSTANCE_ID
const DEFAULT_INSTANCE_ID = 'default';

// Generate unique ID
const generateId = () => `inst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Create a new instance object
const createInstance = (name, relayUrl, workingDir, color, useDefaultId = false) => ({
  id: useDefaultId ? DEFAULT_INSTANCE_ID : generateId(),
  name,
  relayUrl,
  workingDir: workingDir || '',
  color: color || INSTANCE_COLORS[0],
  createdAt: Date.now(),
  lastUsedAt: Date.now(),
});

// Initial state for instance connection
const createInstanceState = () => ({
  connectionState: 'disconnected',
  ptyStatus: null,
  detectedOptions: [],
  hasUnread: false,
  processingStartTime: null,
  error: null,
  ptyError: null,
  needsInput: false,    // True when options-detected received
  taskComplete: false,  // True when task-complete received
});

export function InstanceProvider({ children }) {
  // Load persisted instances
  const [instances, setInstances] = useState(() => {
    try {
      const stored = storage.get(INSTANCES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('[InstanceContext] Failed to load instances:', e);
    }

    // Migration: Create default instance from old settings (via migrated storage)
    const oldRelayUrl = storage.get('relayUrl');
    const oldWorkingDir = storage.get('working-dir');
    if (oldRelayUrl || oldWorkingDir) {
      const defaultInstance = createInstance(
        'Default',
        oldRelayUrl || getDefaultRelayUrl(),
        oldWorkingDir || '',
        INSTANCE_COLORS[0],
        true  // Use 'default' ID to match relay's default instance
      );
      return [defaultInstance];
    }

    // Create a fresh default instance with auto-detected relay URL
    // Use 'default' ID to match relay's DEFAULT_INSTANCE_ID - this allows
    // the relay to use its saved workingDir from previous sessions
    return [createInstance(
      'Default',
      getDefaultRelayUrl(),
      '',
      INSTANCE_COLORS[0],
      true  // Use 'default' ID
    )];
  });

  // Load active instance ID
  const [activeInstanceId, setActiveInstanceId] = useState(() => {
    const stored = storage.get(ACTIVE_INSTANCE_KEY);
    if (stored && instances.find(i => i.id === stored)) {
      return stored;
    }
    return instances[0]?.id || null;
  });

  // Instance connection states (Map<instanceId, InstanceState>)
  const [instanceStates, setInstanceStates] = useState(() => {
    const states = {};
    instances.forEach(inst => {
      states[inst.id] = createInstanceState();
    });
    return states;
  });

  // WebSocket refs (Map<instanceId, WebSocket>)
  const wsRefs = useRef({});
  const reconnectAttemptsRef = useRef({});
  const reconnectTimeoutsRef = useRef({});
  const connectionTimeoutsRef = useRef({});
  const heartbeatIntervalsRef = useRef({});

  // Track app visibility for notifications (Capacitor's visibilityState is unreliable)
  const isAppVisibleRef = useRef(true);
  const pongTimeoutsRef = useRef({});
  const listenersRef = useRef({}); // Map<instanceId, Set<callback>>
  const connectInstanceRef = useRef(null); // Ref for self-referencing in reconnect

  // Persist instances to storage
  useEffect(() => {
    storage.setJSON(INSTANCES_KEY, instances);
  }, [instances]);

  // Persist active instance
  useEffect(() => {
    if (activeInstanceId) {
      storage.set(ACTIVE_INSTANCE_KEY, activeInstanceId);
    }
  }, [activeInstanceId]);

  // Get current active instance
  const activeInstance = useMemo(() => {
    return instances.find(i => i.id === activeInstanceId) || instances[0];
  }, [instances, activeInstanceId]);

  // Get state for active instance
  const activeInstanceState = useMemo(() => {
    return instanceStates[activeInstanceId] || createInstanceState();
  }, [instanceStates, activeInstanceId]);

  // Update instance state helper
  const updateInstanceState = useCallback((instanceId, updates) => {
    setInstanceStates(prev => ({
      ...prev,
      [instanceId]: { ...prev[instanceId], ...updates },
    }));
  }, []);

  // Add message listener for instance
  const addMessageListener = useCallback((instanceId, listener) => {
    if (!listenersRef.current[instanceId]) {
      listenersRef.current[instanceId] = new Set();
    }
    listenersRef.current[instanceId].add(listener);
    return () => listenersRef.current[instanceId]?.delete(listener);
  }, []);

  // Notify listeners for instance
  const notifyListeners = useCallback((instanceId, message) => {
    listenersRef.current[instanceId]?.forEach(listener => {
      try {
        listener(message);
      } catch (err) {
        console.error('[InstanceContext] Error in message listener:', err);
      }
    });
  }, []);

  // Clean up timers for instance
  const cleanupTimers = useCallback((instanceId) => {
    if (connectionTimeoutsRef.current[instanceId]) {
      clearTimeout(connectionTimeoutsRef.current[instanceId]);
      delete connectionTimeoutsRef.current[instanceId];
    }
    if (heartbeatIntervalsRef.current[instanceId]) {
      clearInterval(heartbeatIntervalsRef.current[instanceId]);
      delete heartbeatIntervalsRef.current[instanceId];
    }
    if (pongTimeoutsRef.current[instanceId]) {
      clearTimeout(pongTimeoutsRef.current[instanceId]);
      delete pongTimeoutsRef.current[instanceId];
    }
  }, []);

  // Start heartbeat for instance
  const startHeartbeat = useCallback((instanceId, ws) => {
    if (heartbeatIntervalsRef.current[instanceId]) {
      clearInterval(heartbeatIntervalsRef.current[instanceId]);
    }
    if (pongTimeoutsRef.current[instanceId]) {
      clearTimeout(pongTimeoutsRef.current[instanceId]);
    }

    heartbeatIntervalsRef.current[instanceId] = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
        pongTimeoutsRef.current[instanceId] = setTimeout(() => {
          console.warn(`[Instance ${instanceId}] Heartbeat timeout`);
          ws.close(4000, 'Heartbeat timeout');
        }, HEARTBEAT_TIMEOUT);
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  // Connect to instance
  const connectInstance = useCallback((instanceId) => {
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return;

    // Prevent duplicate connections - check both OPEN and CONNECTING states
    const existingWs = wsRefs.current[instanceId];
    if (existingWs?.readyState === WebSocket.OPEN ||
        existingWs?.readyState === WebSocket.CONNECTING) {
      return;
    }

    updateInstanceState(instanceId, { connectionState: 'connecting', error: null });

    try {
      const ws = new WebSocket(instance.relayUrl);
      wsRefs.current[instanceId] = ws;

      // Connection timeout
      connectionTimeoutsRef.current[instanceId] = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close(4001, 'Connection timeout');
        }
      }, CONNECTION_TIMEOUT);

      ws.onopen = () => {
        if (connectionTimeoutsRef.current[instanceId]) {
          clearTimeout(connectionTimeoutsRef.current[instanceId]);
          delete connectionTimeoutsRef.current[instanceId];
        }

        updateInstanceState(instanceId, { connectionState: 'connected', error: null });
        reconnectAttemptsRef.current[instanceId] = 0;
        startHeartbeat(instanceId, ws);

        // Start foreground service to keep connection alive when backgrounded (Android only)
        if (WebSocketService) {
          WebSocketService.start().catch(err => {
            console.warn('[InstanceContext] Failed to start foreground service:', err);
          });
        }

        // Send set-instance message to relay to register this client's instance
        // This tells the relay which PTY instance to route messages to/from
        ws.send(JSON.stringify({
          type: 'set-instance',
          instanceId: instance.id,
          workingDir: instance.workingDir || null,
        }));
      };

      ws.onclose = (event) => {
        delete wsRefs.current[instanceId];
        cleanupTimers(instanceId);

        if (!event.wasClean) {
          const attempt = reconnectAttemptsRef.current[instanceId] || 0;
          if (attempt >= MAX_RECONNECT_ATTEMPTS) {
            updateInstanceState(instanceId, {
              connectionState: 'disconnected',
              error: 'Connection failed after multiple attempts',
            });
            return;
          }

          const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
          updateInstanceState(instanceId, { connectionState: 'reconnecting' });
          reconnectAttemptsRef.current[instanceId] = attempt + 1;

          reconnectTimeoutsRef.current[instanceId] = setTimeout(() => {
            connectInstanceRef.current?.(instanceId);
          }, delay);
        } else {
          updateInstanceState(instanceId, { connectionState: 'disconnected' });
        }
      };

      ws.onerror = () => {
        updateInstanceState(instanceId, { error: 'WebSocket connection error' });
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle pong
          if (message.type === 'pong') {
            if (pongTimeoutsRef.current[instanceId]) {
              clearTimeout(pongTimeoutsRef.current[instanceId]);
              delete pongTimeoutsRef.current[instanceId];
            }
            return;
          }

          // Handle status messages
          if (message.type === 'ready') {
            // Relay is ready, set-instance was already sent in onopen
            console.log('[InstanceContext] Relay ready for instance:', instanceId);
          } else if (message.type === 'status') {
            if (message.connected !== undefined) {
              updateInstanceState(instanceId, {
                connectionState: message.connected ? 'connected' : 'disconnected',
              });
            }
          } else if (message.type === 'pty-status') {
            updateInstanceState(instanceId, {
              ptyStatus: message,
              processingStartTime: message.processingStartTime || null,
              ptyError: null, // Clear error on successful status
            });
          } else if (message.type === 'pty-error') {
            // PTY failed to start or crashed repeatedly
            updateInstanceState(instanceId, {
              ptyError: message.message || 'Claude Code failed to start',
            });
          } else if (message.type === 'pty-crash') {
            // PTY crashed - show exit code and hint
            const errorMsg = message.exitCode
              ? `Claude Code crashed (exit ${message.exitCode})`
              : 'Claude Code crashed unexpectedly';
            updateInstanceState(instanceId, {
              ptyError: errorMsg,
            });
          } else if (message.type === 'options-detected') {
            const optionCount = message.options?.length || 0;
            const hasOptions = optionCount > 0;

            // Set needsInput state and clear taskComplete (input takes precedence)
            updateInstanceState(instanceId, {
              detectedOptions: message.options || [],
              needsInput: hasOptions,
              taskComplete: hasOptions ? false : undefined, // Clear taskComplete if input needed
            });

            // Log and notify if options detected and app is backgrounded
            const isVisible = isAppVisibleRef.current;
            const willNotify = hasOptions && !isVisible;
            notificationService.log('options-detected', {
              optionCount,
              isVisible,
              willNotify,
            });
            if (willNotify) {
              notificationService.log('Triggering notifyInputNeeded');
              notificationService.notifyInputNeeded({
                instanceId,
                optionCount: message.options.length,
              });
            }
          } else if (message.type === 'task-complete') {
            // Set taskComplete state (only if not currently needing input)
            const currentState = instanceStates[instanceId];
            const shouldSetComplete = !currentState?.needsInput;

            if (shouldSetComplete) {
              updateInstanceState(instanceId, { taskComplete: true });
            }

            // Log and notify on long task completion (only when app is backgrounded)
            const isVisible = isAppVisibleRef.current;
            // Only notify if not currently needing input (input takes precedence)
            const willNotify = !isVisible && shouldSetComplete;
            notificationService.log('task-complete', {
              duration: message.duration,
              isVisible,
              willNotify,
              needsInputActive: currentState?.needsInput,
            });
            if (willNotify) {
              notificationService.log('Triggering notifyTaskComplete');
              notificationService.notifyTaskComplete({
                instanceId,
                duration: message.duration,
              });
            }
          } else if (message.type === 'output' || message.type === 'replay') {
            // Mark as unread if not active instance
            if (instanceId !== activeInstanceId) {
              updateInstanceState(instanceId, { hasUnread: true });
            }
          }

          // Notify all listeners
          notifyListeners(instanceId, message);
        } catch (err) {
          console.error('[InstanceContext] Error parsing message:', err);
        }
      };
    } catch (err) {
      updateInstanceState(instanceId, {
        error: err.message,
        connectionState: 'disconnected',
      });
    }
  }, [instances, activeInstanceId, instanceStates, updateInstanceState, notifyListeners, cleanupTimers, startHeartbeat]);

  // Keep ref updated for self-referencing in reconnect timeout
  useEffect(() => {
    connectInstanceRef.current = connectInstance;
  }, [connectInstance]);

  // Disconnect from instance
  const disconnectInstance = useCallback((instanceId) => {
    if (reconnectTimeoutsRef.current[instanceId]) {
      clearTimeout(reconnectTimeoutsRef.current[instanceId]);
      delete reconnectTimeoutsRef.current[instanceId];
    }

    cleanupTimers(instanceId);

    if (wsRefs.current[instanceId]) {
      wsRefs.current[instanceId].close(1000, 'Manual disconnect');
      delete wsRefs.current[instanceId];
    }

    // Stop foreground service if no other connections are active (Android only)
    if (WebSocketService) {
      const hasOtherConnections = Object.keys(wsRefs.current).some(
        id => id !== instanceId && wsRefs.current[id]?.readyState === WebSocket.OPEN
      );
      if (!hasOtherConnections) {
        WebSocketService.stop().catch(err => {
          console.warn('[InstanceContext] Failed to stop foreground service:', err);
        });
      }
    }

    updateInstanceState(instanceId, { connectionState: 'disconnected' });
    reconnectAttemptsRef.current[instanceId] = 0;
  }, [cleanupTimers, updateInstanceState]);

  // Send message to instance
  const sendToInstance = useCallback((instanceId, message) => {
    const ws = wsRefs.current[instanceId];
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Instance management functions
  const addInstance = useCallback((name, relayUrl, workingDir, color) => {
    const colorIndex = instances.length % INSTANCE_COLORS.length;
    const newInstance = createInstance(
      name,
      relayUrl,
      workingDir,
      color || INSTANCE_COLORS[colorIndex]
    );
    setInstances(prev => [...prev, newInstance]);
    setInstanceStates(prev => ({
      ...prev,
      [newInstance.id]: createInstanceState(),
    }));
    return newInstance;
  }, [instances.length]);

  const updateInstance = useCallback((instanceId, updates) => {
    setInstances(prev => prev.map(inst =>
      inst.id === instanceId ? { ...inst, ...updates, lastUsedAt: Date.now() } : inst
    ));

    // Reconnect if relay URL changed
    if (updates.relayUrl) {
      disconnectInstance(instanceId);
      if (instanceId === activeInstanceId) {
        setTimeout(() => connectInstance(instanceId), 100);
      }
    }
  }, [activeInstanceId, disconnectInstance, connectInstance]);

  const removeInstance = useCallback((instanceId) => {
    if (instances.length <= 1) return; // Keep at least one instance

    disconnectInstance(instanceId);
    setInstances(prev => prev.filter(inst => inst.id !== instanceId));
    setInstanceStates(prev => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });

    // Switch to another instance if removing active
    if (instanceId === activeInstanceId) {
      const remaining = instances.filter(i => i.id !== instanceId);
      if (remaining.length > 0) {
        setActiveInstanceId(remaining[0].id);
      }
    }
  }, [instances, activeInstanceId, disconnectInstance]);

  const switchInstance = useCallback((instanceId) => {
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return;

    setActiveInstanceId(instanceId);
    updateInstanceState(instanceId, { hasUnread: false });

    // Update lastUsedAt
    setInstances(prev => prev.map(inst =>
      inst.id === instanceId ? { ...inst, lastUsedAt: Date.now() } : inst
    ));

    // Connect if not connected
    if (!wsRefs.current[instanceId] || wsRefs.current[instanceId].readyState !== WebSocket.OPEN) {
      connectInstance(instanceId);
    }

    // Manage concurrent connections (keep max 3)
    const connectedIds = Object.keys(wsRefs.current).filter(
      id => wsRefs.current[id]?.readyState === WebSocket.OPEN
    );
    if (connectedIds.length > MAX_CONCURRENT_CONNECTIONS) {
      // Disconnect oldest inactive connection
      const sorted = connectedIds
        .filter(id => id !== instanceId)
        .sort((a, b) => {
          const instA = instances.find(i => i.id === a);
          const instB = instances.find(i => i.id === b);
          return (instA?.lastUsedAt || 0) - (instB?.lastUsedAt || 0);
        });
      if (sorted.length > 0) {
        disconnectInstance(sorted[0]);
      }
    }
  }, [instances, updateInstanceState, connectInstance, disconnectInstance]);

  // Connect active instance on mount
  useEffect(() => {
    if (activeInstanceId) {
      const timer = setTimeout(() => connectInstance(activeInstanceId), 150);
      return () => clearTimeout(timer);
    }
  }, []); // Only on mount

  // Listen for Service Worker notification click events to switch instances
  useEffect(() => {
    const handleSwSwitchInstance = (event) => {
      const { instanceId: targetInstanceId } = event.detail || {};
      if (targetInstanceId && instances.find(i => i.id === targetInstanceId)) {
        console.log('[InstanceContext] SW notification click, switching to instance:', targetInstanceId);
        switchInstance(targetInstanceId);
      }
    };

    window.addEventListener('sw-switch-instance', handleSwSwitchInstance);
    return () => window.removeEventListener('sw-switch-instance', handleSwSwitchInstance);
  }, [instances, switchInstance]);

  // Reconnect when app returns from background + track visibility for notifications
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Update visibility ref for web platform
      if (!Capacitor.isNativePlatform()) {
        isAppVisibleRef.current = document.visibilityState === 'visible';
      }

      if (document.hidden) return;

      const ws = wsRefs.current[activeInstanceId];
      const needsReconnect = !ws ||
        ws.readyState === WebSocket.CLOSED ||
        ws.readyState === WebSocket.CLOSING;

      if (needsReconnect && activeInstanceId) {
        reconnectAttemptsRef.current[activeInstanceId] = 0;
        connectInstance(activeInstanceId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    let appStateListener = null;
    if (Capacitor.isNativePlatform()) {
      appStateListener = App.addListener('appStateChange', ({ isActive }) => {
        notificationService.log('appStateChange', { isActive, wasVisible: isAppVisibleRef.current });
        isAppVisibleRef.current = isActive; // Track visibility for native
        if (isActive) handleVisibilityChange();
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      appStateListener?.remove();
    };
  }, [activeInstanceId, connectInstance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.keys(wsRefs.current).forEach(id => {
        disconnectInstance(id);
      });
    };
  }, [disconnectInstance]);

  // Create convenience methods for active instance
  const connect = useCallback(() => connectInstance(activeInstanceId), [activeInstanceId, connectInstance]);
  const disconnect = useCallback(() => disconnectInstance(activeInstanceId), [activeInstanceId, disconnectInstance]);
  const send = useCallback((message) => sendToInstance(activeInstanceId, message), [activeInstanceId, sendToInstance]);
  const sendInput = useCallback((data) => send({ type: 'input', data }), [send]);
  const sendResize = useCallback((cols, rows) => send({ type: 'resize', cols, rows }), [send]);
  const sendInterrupt = useCallback(() => send({ type: 'interrupt' }), [send]);
  const restartPty = useCallback(() => send({ type: 'restart' }), [send]);
  const requestReplay = useCallback(() => send({ type: 'replay' }), [send]);
  const submitInput = useCallback((data) => send({ type: 'submit', data }), [send]);

  const clearDetectedOptions = useCallback(() => {
    updateInstanceState(activeInstanceId, {
      detectedOptions: [],
      needsInput: false,
      taskComplete: false, // Also clear task complete on interaction
    });
  }, [activeInstanceId, updateInstanceState]);

  // Ref to track activeInstanceId for stable callback
  const activeInstanceIdRef = useRef(activeInstanceId);
  useEffect(() => {
    activeInstanceIdRef.current = activeInstanceId;
  }, [activeInstanceId]);

  // Stable addActiveMessageListener that doesn't change when activeInstanceId changes
  const addActiveMessageListener = useCallback((listener) => {
    return addMessageListener(activeInstanceIdRef.current, listener);
  }, [addMessageListener]);

  // Compatibility methods for old RelayContext API
  const getRelayUrl = useCallback(() => {
    return activeInstance?.relayUrl || getDefaultRelayUrl();
  }, [activeInstance]);

  const setRelayUrl = useCallback((url) => {
    if (activeInstance) {
      updateInstance(activeInstanceId, { relayUrl: url });
    }
  }, [activeInstance, activeInstanceId, updateInstance]);

  // Stable getInstanceState function
  const getInstanceState = useCallback((id) => {
    return instanceStates[id] || createInstanceState();
  }, [instanceStates]);

  const value = useMemo(() => ({
    // Instance management
    instances,
    activeInstance,
    activeInstanceId,
    addInstance,
    updateInstance,
    removeInstance,
    switchInstance,
    instanceColors: INSTANCE_COLORS,

    // Active instance state
    connectionState: activeInstanceState.connectionState,
    ptyStatus: activeInstanceState.ptyStatus,
    error: activeInstanceState.error,
    ptyError: activeInstanceState.ptyError,
    detectedOptions: activeInstanceState.detectedOptions,
    needsInput: activeInstanceState.needsInput,
    taskComplete: activeInstanceState.taskComplete,
    isConnected: activeInstanceState.connectionState === 'connected',
    isReconnecting: activeInstanceState.connectionState === 'reconnecting',

    // Get state for any instance
    getInstanceState,

    // Active instance actions
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
    addMessageListener: addActiveMessageListener,

    // Multi-instance actions
    connectInstance,
    disconnectInstance,
    sendToInstance,
    addInstanceMessageListener: addMessageListener,

    // Compatibility with old API
    getRelayUrl,
    setRelayUrl,
  }), [
    instances,
    activeInstance,
    activeInstanceId,
    addInstance,
    updateInstance,
    removeInstance,
    switchInstance,
    activeInstanceState,
    getInstanceState,
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
    addActiveMessageListener,
    connectInstance,
    disconnectInstance,
    sendToInstance,
    addMessageListener,
    getRelayUrl,
    setRelayUrl,
  ]);

  return (
    <InstanceContext.Provider value={value}>
      {children}
    </InstanceContext.Provider>
  );
}

export function useInstance() {
  const context = useContext(InstanceContext);
  if (!context) {
    throw new Error('useInstance must be used within an InstanceProvider');
  }
  return context;
}

export default InstanceContext;
