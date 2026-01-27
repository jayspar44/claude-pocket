import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Server, Type, Trash2, Info, Check, FileX, Bell, RotateCcw, Square, Download, ScrollText, Ghost, X } from 'lucide-react';
import { useRelay } from '../hooks/useRelay';
import { healthApi, filesApi, instancesApi } from '../api/relay-api';
import { version } from '../../../version.json';
import { versionCode } from '../../android-version.json';
import { notificationService } from '../services/NotificationService';
import { storage } from '../utils/storage';

// Environment detection based on relay URL port
function getEnvironment(url) {
  if (!url) return null;
  if (url.includes(':4503')) return 'DEV';
  if (url.includes(':4501')) return 'PROD';
  return 'CUSTOM';
}

const envConfig = {
  DEV: { color: 'bg-blue-600', text: 'DEV' },
  PROD: { color: 'bg-orange-600', text: 'PROD' },
  CUSTOM: { color: 'bg-purple-600', text: 'CUSTOM' },
};

export default function Settings() {
  const navigate = useNavigate();
  const { getRelayUrl, setRelayUrl, connectionState } = useRelay();

  const [relayUrlInput, setRelayUrlInput] = useState(getRelayUrl());
  const [fontSizeInput, setFontSizeInput] = useState(() => {
    return storage.get('fontSize') || '14';
  });
  const [healthInfo, setHealthInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [stoppingAll, setStoppingAll] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState(() => notificationService.getSettings());
  const [testNotificationStatus, setTestNotificationStatus] = useState(null); // null | { success, message }
  const [notifDiagnostics, setNotifDiagnostics] = useState(null);
  const [notifLog, setNotifLog] = useState(() => notificationService.getDebugLog());
  const [serverInstances, setServerInstances] = useState(null);
  const [stoppingInstance, setStoppingInstance] = useState(null);

  // Fetch health info periodically
  const fetchHealth = useCallback(() => {
    healthApi.check()
      .then((response) => setHealthInfo(response.data))
      .catch(() => setHealthInfo(null));
  }, []);

  // Fetch server instances to find orphans
  const fetchServerInstances = useCallback(() => {
    if (connectionState !== 'connected') {
      setServerInstances(null);
      return;
    }
    instancesApi.list()
      .then((response) => setServerInstances(response.data))
      .catch(() => setServerInstances(null));
  }, [connectionState]);

  useEffect(() => {
    fetchHealth();
    fetchServerInstances();
    const interval = setInterval(() => {
      fetchHealth();
      fetchServerInstances();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchHealth, fetchServerInstances]);

  // Refresh notification log periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setNotifLog(notificationService.getDebugLog());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveRelayUrl = useCallback(() => {
    if (!relayUrlInput.trim()) return;
    setSaving(true);
    setRelayUrl(relayUrlInput.trim());
    setTimeout(() => setSaving(false), 500);
  }, [relayUrlInput, setRelayUrl]);

  const handleSaveFontSize = useCallback(() => {
    const size = parseInt(fontSizeInput, 10);
    if (size >= 8 && size <= 24) {
      storage.set('fontSize', fontSizeInput);
    }
  }, [fontSizeInput]);

  const handleClearHistory = useCallback(() => {
    if (confirm('Clear command history?')) {
      storage.remove('history');
    }
  }, []);

  const handleResetAppData = useCallback(() => {
    if (confirm('Reset all app data? This will clear all settings, instances, and reload the app.')) {
      localStorage.clear();
      window.location.reload();
    }
  }, []);

  const handleCleanupFiles = useCallback(async () => {
    if (!confirm('Delete all uploaded files in .claude-pocket? This cannot be undone.')) {
      return;
    }
    setCleaning(true);
    try {
      const response = await filesApi.cleanup();
      alert(response.data.message || 'Cleanup complete');
    } catch (error) {
      console.error('Failed to cleanup files:', error);
      alert(error.response?.data?.error || 'Failed to cleanup files');
    }
    setCleaning(false);
  }, []);

  const handleStopAllInstances = useCallback(async () => {
    if (!confirm('Stop all Claude Code instances on the relay? This will terminate all running sessions.')) {
      return;
    }
    setStoppingAll(true);
    try {
      const response = await instancesApi.deleteAll();
      alert(`Stopped ${response.data.count} instance(s)`);
      fetchServerInstances();
    } catch (error) {
      console.error('Failed to stop instances:', error);
      alert(error.response?.data?.error || 'Failed to stop instances');
    }
    setStoppingAll(false);
  }, [fetchServerInstances]);

  const handleStopInstance = useCallback(async (instanceId) => {
    setStoppingInstance(instanceId);
    try {
      await instancesApi.delete(instanceId);
      fetchServerInstances();
    } catch (error) {
      console.error('Failed to stop instance:', error);
      alert(error.response?.data?.error || 'Failed to stop instance');
    }
    setStoppingInstance(null);
  }, [fetchServerInstances]);

  // Calculate orphaned instances (running on server but no connected client)
  const orphanedInstances = useMemo(() => {
    if (!serverInstances?.instances) return [];
    const connectedIds = new Set(serverInstances.clients?.map(c => c.instanceId) || []);
    return serverInstances.instances.filter(inst => !connectedIds.has(inst.instanceId));
  }, [serverInstances]);

  const handleNotificationSettingChange = useCallback((key, value) => {
    const newSettings = { ...notificationSettings, [key]: value };
    setNotificationSettings(newSettings);
    notificationService.saveSettings(newSettings);
  }, [notificationSettings]);

  const fetchNotifDiagnostics = useCallback(async () => {
    const swReg = await navigator.serviceWorker?.getRegistration();
    const diag = {
      permission: 'Notification' in window ? Notification.permission : 'N/A',
      swSupported: 'serviceWorker' in navigator,
      swRegistered: !!swReg,
      swActive: !!swReg?.active,
      swScope: swReg?.scope || 'none',
    };
    setNotifDiagnostics(diag);
    return diag;
  }, []);

  const handleRequestPermission = useCallback(async () => {
    if ('Notification' in window) {
      const result = await Notification.requestPermission();
      fetchNotifDiagnostics();
      setTestNotificationStatus({ success: result === 'granted', message: `Permission: ${result}` });
      setTimeout(() => setTestNotificationStatus(null), 5000);
    }
  }, [fetchNotifDiagnostics]);

  const handleTestNotification = useCallback(async () => {
    setTestNotificationStatus(null);
    await fetchNotifDiagnostics();
    try {
      const result = await notificationService.notify({
        title: 'Test Notification',
        body: 'Notifications are working!',
        type: 'input-needed',
      });
      if (result?.sent) {
        setTestNotificationStatus({ success: true, message: `Sent via ${result.method}` });
      } else {
        setTestNotificationStatus({ success: false, message: result?.reason || 'Unknown error' });
      }
    } catch (err) {
      setTestNotificationStatus({ success: false, message: err.message });
    }
    // Auto-clear after 5 seconds
    setTimeout(() => setTestNotificationStatus(null), 5000);
  }, [fetchNotifDiagnostics]);

  const connectionStatusColor = {
    connected: 'text-green-400',
    connecting: 'text-yellow-400',
    reconnecting: 'text-yellow-400',
    disconnected: 'text-red-400',
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-700 safe-area-top safe-area-left safe-area-right">
        <button
          onClick={() => navigate('/')}
          className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-white">Settings</h1>
        {(() => {
          const env = getEnvironment(getRelayUrl());
          const envStyle = env ? envConfig[env] : null;
          return envStyle ? (
            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${envStyle.color} text-white`}>
              {envStyle.text}
            </span>
          ) : null;
        })()}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 safe-area-left safe-area-right">
        {/* Connection */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" />
            <h2 className="text-white font-medium">Connection</h2>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-400">Status</span>
            <span className={connectionStatusColor[connectionState] || 'text-gray-400'}>
              {connectionState.charAt(0).toUpperCase() + connectionState.slice(1)}
            </span>
          </div>

          {/* Relay URL */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Relay URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={relayUrlInput}
                onChange={(e) => setRelayUrlInput(e.target.value)}
                placeholder="ws://192.168.1.x:4501/ws"
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSaveRelayUrl}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 rounded-lg text-white transition-colors"
              >
                {saving ? <Check className="w-5 h-5" /> : 'Save'}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Auto-configured based on app port. Override for custom setups.
            </p>
          </div>
        </div>

        {/* Terminal */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Type className="w-5 h-5 text-purple-400" />
            <h2 className="text-white font-medium">Terminal</h2>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Font Size</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="8"
                max="24"
                value={fontSizeInput}
                onChange={(e) => setFontSizeInput(e.target.value)}
                onMouseUp={handleSaveFontSize}
                onTouchEnd={handleSaveFontSize}
                className="flex-1 accent-purple-500"
              />
              <span className="w-8 text-center text-white">{fontSizeInput}</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-yellow-400" />
            <h2 className="text-white font-medium">Notifications</h2>
          </div>

          {/* Enable notifications toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-white">Enable Notifications</span>
              <p className="text-xs text-gray-400">Get alerts when app is in background</p>
            </div>
            <button
              onClick={() => handleNotificationSettingChange('enabled', !notificationSettings.enabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                notificationSettings.enabled ? 'bg-yellow-500' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  notificationSettings.enabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Input needed toggle */}
          <div className={`flex items-center justify-between py-2 ${!notificationSettings.enabled ? 'opacity-50' : ''}`}>
            <div>
              <span className="text-white">Input Needed Alerts</span>
              <p className="text-xs text-gray-400">Notify when Claude is waiting for input</p>
            </div>
            <button
              onClick={() => handleNotificationSettingChange('inputNeeded', !notificationSettings.inputNeeded)}
              disabled={!notificationSettings.enabled}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                notificationSettings.inputNeeded && notificationSettings.enabled ? 'bg-yellow-500' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  notificationSettings.inputNeeded ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Task complete toggle */}
          <div className={`flex items-center justify-between py-2 ${!notificationSettings.enabled ? 'opacity-50' : ''}`}>
            <div>
              <span className="text-white">Long Task Completion</span>
              <p className="text-xs text-gray-400">Notify when tasks over 60s complete</p>
            </div>
            <button
              onClick={() => handleNotificationSettingChange('taskComplete', !notificationSettings.taskComplete)}
              disabled={!notificationSettings.enabled}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                notificationSettings.taskComplete && notificationSettings.enabled ? 'bg-yellow-500' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  notificationSettings.taskComplete ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Test notification buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleRequestPermission}
              className="flex-1 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg text-blue-400 text-sm transition-colors"
            >
              Request Permission
            </button>
            <button
              onClick={handleTestNotification}
              className="flex-1 px-4 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 rounded-lg text-yellow-400 text-sm transition-colors"
            >
              Send Test
            </button>
          </div>
          {testNotificationStatus && (
            <p className={`text-xs mt-1 ${testNotificationStatus.success ? 'text-green-400' : 'text-red-400'}`}>
              {testNotificationStatus.success ? '✓' : '✗'} {testNotificationStatus.message}
            </p>
          )}
          {/* Diagnostics */}
          {notifDiagnostics && (
            <div className="text-xs text-gray-400 space-y-1 mt-2 p-2 bg-gray-900 rounded">
              <p>Permission: <span className={notifDiagnostics.permission === 'granted' ? 'text-green-400' : 'text-red-400'}>{notifDiagnostics.permission}</span></p>
              <p>SW Registered: <span className={notifDiagnostics.swRegistered ? 'text-green-400' : 'text-red-400'}>{notifDiagnostics.swRegistered ? 'yes' : 'no'}</span></p>
              <p>SW Active: <span className={notifDiagnostics.swActive ? 'text-green-400' : 'text-red-400'}>{notifDiagnostics.swActive ? 'yes' : 'no'}</span></p>
            </div>
          )}

          {/* Debug Log */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">Debug Log</span>
              </div>
              <button
                onClick={() => {
                  notificationService.clearDebugLog();
                  setNotifLog([]);
                }}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Clear
              </button>
            </div>
            <div className="bg-gray-900 rounded p-2 max-h-48 overflow-y-auto font-mono text-xs">
              {notifLog.length === 0 ? (
                <p className="text-gray-500 italic">No events yet. Waiting for options-detected or task-complete...</p>
              ) : (
                notifLog.map((entry, i) => (
                  <div key={i} className="py-1 border-b border-gray-800 last:border-0">
                    <span className="text-gray-500">{entry.time}</span>{' '}
                    <span className="text-blue-400">{entry.message}</span>
                    {entry.optionCount !== undefined && (
                      <span className="text-gray-400"> opts={entry.optionCount}</span>
                    )}
                    {entry.visibility && (
                      <span className={entry.visibility === 'visible' ? 'text-yellow-400' : 'text-green-400'}>
                        {' '}vis={entry.visibility}
                      </span>
                    )}
                    {entry.willNotify !== undefined && (
                      <span className={entry.willNotify ? 'text-green-400' : 'text-red-400'}>
                        {' '}notify={entry.willNotify ? 'YES' : 'NO'}
                      </span>
                    )}
                    {entry.duration && (
                      <span className="text-gray-400"> dur={Math.round(entry.duration / 1000)}s</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Orphaned Instances */}
        {orphanedInstances.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Ghost className="w-5 h-5 text-purple-400" />
              <h2 className="text-white font-medium">Orphaned Instances</h2>
              <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-purple-600 text-white">
                {orphanedInstances.length}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              These instances are running on the server but have no connected clients.
            </p>

            <div className="space-y-2">
              {orphanedInstances.map((inst) => (
                <div
                  key={inst.instanceId}
                  className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">
                      {inst.instanceId === 'default' ? 'Default' : inst.instanceId}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {inst.workingDir || 'No working directory'}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs ${inst.running ? 'text-green-400' : 'text-gray-500'}`}>
                        {inst.running ? 'Running' : 'Stopped'}
                      </span>
                      {inst.running && inst.processingStartTime && (
                        <span className="text-xs text-yellow-400">Processing...</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleStopInstance(inst.instanceId)}
                    disabled={stoppingInstance === inst.instanceId}
                    className="ml-2 p-2 text-red-400 hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {stoppingInstance === inst.instanceId ? (
                      <Square className="w-4 h-4 animate-pulse" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-400" />
            <h2 className="text-white font-medium">Data</h2>
          </div>

          <button
            onClick={handleStopAllInstances}
            disabled={stoppingAll || connectionState !== 'connected'}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 rounded-lg text-red-400 transition-colors"
          >
            <Square className={`w-5 h-5 ${stoppingAll ? 'animate-pulse' : ''}`} />
            <span>{stoppingAll ? 'Stopping...' : 'Stop All Server Instances'}</span>
          </button>
          <p className="text-xs text-gray-500">
            Stops all Claude Code PTY processes on the relay server
          </p>

          <button
            onClick={handleClearHistory}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600/20 hover:bg-orange-600/30 rounded-lg text-orange-400 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
            <span>Clear Command History</span>
          </button>

          <button
            onClick={handleCleanupFiles}
            disabled={cleaning || connectionState !== 'connected'}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600/20 hover:bg-orange-600/30 disabled:opacity-50 rounded-lg text-orange-400 transition-colors"
          >
            <FileX className={`w-5 h-5 ${cleaning ? 'animate-pulse' : ''}`} />
            <span>{cleaning ? 'Cleaning...' : 'Clean Uploaded Files'}</span>
          </button>
          <p className="text-xs text-gray-500">
            Deletes uploaded images and temp files in .claude-pocket/
          </p>

          <button
            onClick={handleResetAppData}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            <span>Reset App Data & Reload</span>
          </button>
          <p className="text-xs text-gray-500">
            Clears all localStorage and reloads app with fresh defaults
          </p>
        </div>

        {/* About */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-cyan-400" />
            <h2 className="text-white font-medium">About</h2>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">App Version</span>
              <span className="text-gray-300">v{version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Android Build</span>
              <span className="text-gray-300">{versionCode}</span>
            </div>
            {healthInfo && (
              <div className="flex justify-between">
                <span className="text-gray-400">Relay Version</span>
                <span className="text-gray-300">{healthInfo.version}</span>
              </div>
            )}
          </div>

          {/* Builds download link */}
          <a
            href={getRelayUrl().replace(/^ws/, 'http').replace(/\/ws$/, '') + '/builds'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-cyan-600/20 hover:bg-cyan-600/30 rounded-lg text-cyan-400 transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>Download Builds</span>
          </a>
        </div>

        {/* Safe area spacer for Android navigation bar */}
        <div className="safe-area-bottom" />
      </div>
    </div>
  );
}
