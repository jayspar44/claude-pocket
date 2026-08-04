import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { notificationService } from '../services/NotificationService';
import { InstanceConnection, CONNECTION_STATES, shouldConnect } from '../services/InstanceConnection';
import { ConnectionManager, IDLE_DISCONNECT_MS } from '../services/ConnectionManager';
import { canAddInstance, createInstanceLimitSource } from '../services/instanceLimit';
import { createForegroundService } from '../services/foregroundService';
import { healthApi } from '../api/relay-api';
import { storage } from '../utils/storage';

// Register the foreground service plugin (Android only)
const WebSocketService = Capacitor.isNativePlatform()
  ? registerPlugin('WebSocketService')
  : null;

// One service for the app, guarded by one flag that records intent - see
// createForegroundService for why that matters.
const foregroundService = createForegroundService(WebSocketService);
const startForegroundService = () => foregroundService.start();
const stopForegroundService = () => foregroundService.stop();

const InstanceContext = createContext(null);

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

// Backward-compat migration: rename Gemini -> Antigravity (added 2026-05-23)
export const normalizeCliType = (cliType) => cliType === 'gemini' ? 'antigravity' : cliType;

// Create a new instance object
const createInstance = (name, relayUrl, workingDir, color, useDefaultId = false, customId = null, cliType = null) => ({
  id: customId || (useDefaultId ? DEFAULT_INSTANCE_ID : generateId()),
  name,
  relayUrl,
  workingDir: workingDir || '',
  color: color || INSTANCE_COLORS[0],
  cliType: cliType || storage.get('default-cli') || 'claude',
  createdAt: Date.now(),
  lastViewedAt: Date.now(),
});

// Initial state for instance connection
const createInstanceState = () => ({
  connectionState: 'disconnected',
  ptyStatus: null,
  hasUnread: false,
  processingStartTime: null,
  error: null,
  ptyError: null,
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
          return parsed.map(inst => ({ ...inst, cliType: normalizeCliType(inst.cliType) }));
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

  // The relay's instance cap, read from /api/health. null until it arrives, in
  // which case canAddInstance defers to the relay rather than guessing a cap of
  // its own - which is only safe because the source below keeps trying until it
  // has one. A single mount fetch that failed left the app with no cap at all
  // for the whole session.
  const [relayMaxInstances, setRelayMaxInstances] = useState(null);
  const [limitSource] = useState(() => createInstanceLimitSource({
    fetchHealth: () => healthApi.check(),
    onLimit: (max) => setRelayMaxInstances(max),
  }));

  // Read through a ref by the connection layer below, like every other callback
  // it reaches for, so the manager effect stays mount-only. The source itself
  // never changes identity, so the ref needs no refresh effect.
  const limitSourceRef = useRef(limitSource);

  // At mount, and again from onStateChange whenever a connection reaches
  // CONNECTED - the strongest evidence the app has that the relay is reachable,
  // and an event that already happens, so no polling loop is added. A no-op
  // once the limit is known.
  useEffect(() => { limitSource.refresh(); }, [limitSource]);

  // Track app visibility for notifications (Capacitor's visibilityState is unreliable)
  const isAppVisibleRef = useRef(true);
  const listenersRef = useRef({}); // Map<instanceId, Set<callback>>

  // Ref to track activeInstanceId for connection handlers (avoids stale closure)
  const activeInstanceIdRef = useRef(activeInstanceId);

  // Refs the manager reads through, so the manager never becomes a React
  // dependency - see the callback-stability rule.
  const instancesRef = useRef(instances);
  useEffect(() => { instancesRef.current = instances; }, [instances]);

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

  // Refs the connection layer reads through, so a connection is never a React
  // dependency - see the callback-stability rule. Seeded with the first render's
  // value and refreshed in an effect, so they are never null and never stale.
  const updateInstanceStateRef = useRef(updateInstanceState);
  useEffect(() => { updateInstanceStateRef.current = updateInstanceState; }, [updateInstanceState]);

  // Every inbound message side-effect lives here, behind a ref, so the
  // connection objects never capture React state.
  const handleInstanceMessage = useCallback((instanceId, message) => {
    if (message.type === 'pty-status') {
      updateInstanceState(instanceId, {
        ptyStatus: message,
        processingStartTime: message.processingStartTime || null,
        ptyError: null, // Clear error on successful status
      });
    } else if (message.type === 'pty-error') {
      updateInstanceState(instanceId, { ptyError: message.message || 'CLI failed to start' });
    } else if (message.type === 'pty-crash') {
      updateInstanceState(instanceId, {
        ptyError: message.exitCode ? `CLI crashed (exit ${message.exitCode})` : 'CLI crashed unexpectedly',
      });
    } else if (message.type === 'task-complete') {
      updateInstanceState(instanceId, { taskComplete: true });

      // Log and notify on long task completion (only when app is backgrounded)
      const isVisible = isAppVisibleRef.current;
      notificationService.log('task-complete', {
        duration: message.duration,
        isVisible,
        willNotify: !isVisible,
      });
      if (!isVisible) {
        notificationService.notifyTaskComplete({ instanceId, duration: message.duration });
      }
    } else if (message.type === 'output' || message.type === 'replay') {
      // Mark as unread if not active instance (use ref to avoid stale closure)
      if (instanceId !== activeInstanceIdRef.current) {
        updateInstanceState(instanceId, { hasUnread: true });
      }
    }

    // Notify all listeners
    notifyListeners(instanceId, message);
  }, [updateInstanceState, notifyListeners]);

  const handleInstanceMessageRef = useRef(handleInstanceMessage);
  useEffect(() => { handleInstanceMessageRef.current = handleInstanceMessage; }, [handleInstanceMessage]);

  // One owner for every socket and every timer belonging to one, plus one shared
  // heartbeat. Built on mount and read only through managerRef, so it is never a
  // React dependency; every callback below reaches it through that ref.
  const managerRef = useRef(null);
  useEffect(() => {
    const mgr = new ConnectionManager({
      connectionFactory: ({ instanceId, url }) => new InstanceConnection({
        instanceId,
        url,
        getHandshakePayload: () => {
          const inst = instancesRef.current.find((i) => i.id === instanceId);
          const dims = storage.getJSON('terminal-dims', { cols: 50, rows: 24 });
          return {
            workingDir: inst?.workingDir || null,
            cliType: inst?.cliType || 'claude',
            cols: dims.cols,
            rows: dims.rows,
          };
        },
        onStateChange: (id, { state, error }) => {
          const updates = {
            connectionState: state === CONNECTION_STATES.DESTROYED
              ? CONNECTION_STATES.DISCONNECTED
              : state,
          };
          // Keep the last error visible while reconnecting, but never past a
          // successful connect.
          if (error !== null) updates.error = error;
          else if (state === CONNECTION_STATES.CONNECTED) updates.error = null;
          updateInstanceStateRef.current(id, updates);

          // Keep the connection alive while backgrounded (Android only). The
          // release gate spans every instance, not just this one, and counts
          // CONNECTING/RECONNECTING as live: an idle sweep of the last CONNECTED
          // instance while another sits in backoff would otherwise release the
          // service and let Android kill the process before that retry fires.
          if (state === CONNECTION_STATES.CONNECTED) {
            startForegroundService();
            // A reachable relay is the one thing the cap fetch was missing.
            // No-op once it is known; read through the ref so this effect stays
            // mount-only.
            limitSourceRef.current?.refresh();
          } else if (state === CONNECTION_STATES.DISCONNECTED
            && !mgr.hasLiveConnections()) {
            stopForegroundService();
          }
        },
        onMessage: (id, message) => handleInstanceMessageRef.current(id, message),
      }),
      isViewIdle: (instanceId) => {
        if (instanceId === activeInstanceIdRef.current) return false;
        const inst = instancesRef.current.find((i) => i.id === instanceId);
        const lastViewed = inst?.lastViewedAt || inst?.lastUsedAt || 0;
        return Date.now() - lastViewed >= IDLE_DISCONNECT_MS;
      },
    });
    managerRef.current = mgr;
    // The heartbeat arms itself on the first live connection - see _syncHeartbeat.
    return () => {
      mgr.destroyAll();
      managerRef.current = null;
      // destroy() sets DESTROYED without going through _setState, so no
      // onStateChange fires and the release below is the only one that runs. A
      // WebView reload resets the foreground-service flag to false while the native
      // notification survives, so skipping this leaves an orphaned service that
      // the next start() would double up on.
      stopForegroundService();
    };
  }, []);

  // No connection state in the dependency array. This is the callback-stability
  // rule: a dependency on instanceStates re-creates this callback on every state
  // write, which re-fires the auto-connect effect and reconnects instances the
  // user just disconnected.
  const connectInstance = useCallback((instanceId) => {
    const instance = instancesRef.current.find((i) => i.id === instanceId);
    if (!instance) return;
    managerRef.current?.connect(instanceId, instance.relayUrl);
  }, []);

  const disconnectInstance = useCallback((instanceId) => {
    managerRef.current?.disconnect(instanceId, 'user');
  }, []);

  const disconnectAllInstances = useCallback((reason = 'user') => {
    managerRef.current?.disconnectAll(reason);
  }, []);

  const sendToInstance = useCallback((instanceId, message) => (
    managerRef.current?.send(instanceId, message) ?? false
  ), []);

  // Instance management functions
  const addInstance = useCallback((name, relayUrl, workingDir, color, customId = null, cliType = null) => {
    // Check for duplicate ID first
    if (customId) {
      const existing = instances.find(i => i.id === customId);
      if (existing) {
        return existing;
      }
    }

    const allowed = canAddInstance(instances.length, relayMaxInstances);
    if (!allowed.ok) {
      return { error: allowed.reason, limit: allowed.limit };
    }

    const colorIndex = instances.length % INSTANCE_COLORS.length;
    const newInstance = createInstance(
      name,
      relayUrl,
      workingDir,
      color || INSTANCE_COLORS[colorIndex],
      false,
      customId,
      cliType
    );
    setInstances(prev => [...prev, newInstance]);
    setInstanceStates(prev => ({
      ...prev,
      [newInstance.id]: createInstanceState(),
    }));
    return newInstance;
  }, [instances, relayMaxInstances]);

  const updateInstance = useCallback((instanceId, updates) => {
    setInstances(prev => prev.map(inst =>
      inst.id === instanceId ? { ...inst, ...updates } : inst
    ));

    // Reconnect if relay URL changed. The connection is bound to the URL it was
    // built with, so it has to be discarded rather than reconnected.
    if (updates.relayUrl) {
      disconnectInstance(instanceId);
      managerRef.current?.remove(instanceId);
      if (instanceId === activeInstanceId) {
        // The new URL is passed straight through rather than read back out of
        // instancesRef after a delay: a timer racing the React commit reads the
        // old record on a slow render, and ensure() then pins the connection to
        // the old URL for the rest of the session.
        managerRef.current?.connect(instanceId, updates.relayUrl);
      }
    }
  }, [activeInstanceId, disconnectInstance]);

  const removeInstance = useCallback((instanceId) => {
    if (instances.length <= 1) return; // Keep at least one instance

    disconnectInstance(instanceId);
    managerRef.current?.remove(instanceId);
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
    // Always set active instance, even if not yet in instances state.
    // This handles the race where addInstance + switchInstance are called
    // in the same event handler — React batches state updates, so instances
    // may not include the new instance yet. The auto-connect effect below
    // will connect once the instance appears in state after the re-render.
    setActiveInstanceId(instanceId);

    const instance = instancesRef.current.find(i => i.id === instanceId);
    if (!instance) return;

    // Clear notification indicators when switching to a tab
    updateInstanceState(instanceId, {
      hasUnread: false,
      taskComplete: false,
    });

    // Record the view for the idle sweep
    setInstances(prev => prev.map(inst =>
      inst.id === instanceId ? { ...inst, lastViewedAt: Date.now() } : inst
    ));

    // Selecting a tab is consent to connect it, including one the user
    // previously disconnected - the documented recovery path from a stop.
    if (shouldConnect(managerRef.current?.get(instanceId), { userIntent: true })) {
      connectInstance(instanceId);
    }
  }, [updateInstanceState, connectInstance]);

  // Listen for Service Worker notification click events to switch instances
  useEffect(() => {
    const handleSwSwitchInstance = (event) => {
      const { instanceId: targetInstanceId } = event.detail || {};
      if (targetInstanceId && instancesRef.current.find(i => i.id === targetInstanceId)) {
        console.log('[InstanceContext] SW notification click, switching to instance:', targetInstanceId);
        switchInstance(targetInstanceId);
      }
    };

    window.addEventListener('sw-switch-instance', handleSwSwitchInstance);
    return () => window.removeEventListener('sw-switch-instance', handleSwSwitchInstance);
  }, [switchInstance]);

  // Reconnect when app returns from background + track visibility for notifications
  useEffect(() => {
    // A foreground is the app noticing, not the user asking, so it carries no
    // intent: it revives a connection lost to the network (including one still
    // mid-backoff, which comes back at once instead of waiting out its rung) but
    // leaves a session the user stopped alone.
    //
    // Every connection is swept, not just the active one: a background tab that
    // drained its ladder during the outage stays dark otherwise - no output and
    // no task-complete notification - until the user happens to tap it.
    const reconnectIfNeeded = () => {
      managerRef.current?.resumeAll();
      // The active tab may have no connection object at all yet, which the
      // manager's map cannot know about.
      const instanceId = activeInstanceIdRef.current;
      if (!instanceId) return;
      if (!shouldConnect(managerRef.current?.get(instanceId))) return;
      connectInstance(instanceId);
    };

    const handleVisibilityChange = () => {
      // Update visibility ref for web platform
      if (!Capacitor.isNativePlatform()) {
        isAppVisibleRef.current = document.visibilityState === 'visible';
      }

      if (document.hidden) return;

      reconnectIfNeeded();
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
  }, [connectInstance]);

  // Handle full app exit (disconnect all and close app)
  const handleAppExit = useCallback(async () => {
    // Disconnect all instances
    managerRef.current?.disconnectAll('user');

    // Exit the app (Android only)
    if (WebSocketService) {
      try {
        await WebSocketService.exit();
      } catch (err) {
        console.warn('[InstanceContext] Failed to exit app:', err);
      }
    }
  }, []);

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

  // Keep activeInstanceIdRef in sync for connection handlers and stable callbacks
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

  // Connects the active instance on mount, and covers the one case switchInstance
  // cannot: addInstance + switchInstance in the same handler, where the new
  // instance is not in instancesRef yet and switchInstance bails out.
  //
  // This effect carries NO user intent, even though a tab switch is one of its
  // triggers. Selecting a tab connects through switchInstance, which asks with
  // intent; the same activeInstanceId write also reaches here, but so do a
  // provider remount and removeInstance promoting a survivor to active - and
  // neither is consent. Gating here is what stops a re-render from resurrecting a
  // stopped session, and it costs nothing for a brand-new instance, which has no
  // connection object and so no reason to respect.
  //
  // `instances` is deliberately not a dependency - it is read through
  // instancesRef, because listing it re-fires this effect on every lastViewedAt
  // write.
  useEffect(() => {
    if (!activeInstanceId) return;
    const instance = instancesRef.current.find((i) => i.id === activeInstanceId);
    if (!instance) return;
    if (shouldConnect(managerRef.current?.get(activeInstanceId))) {
      connectInstance(activeInstanceId);
    }
  }, [activeInstanceId, connectInstance]);

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
    addMessageListener: addActiveMessageListener,

    // Multi-instance actions
    connectInstance,
    disconnectInstance,
    disconnectAllInstances,
    sendToInstance,
    addInstanceMessageListener: addMessageListener,
    handleAppExit,

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
    addActiveMessageListener,
    connectInstance,
    disconnectInstance,
    disconnectAllInstances,
    sendToInstance,
    addMessageListener,
    handleAppExit,
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
