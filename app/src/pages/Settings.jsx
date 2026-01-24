import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Server, Type, RefreshCw, Trash2, Info, Check, Play, Square, FolderOpen, FileX, Bell, RotateCcw } from 'lucide-react';
import { useRelay } from '../hooks/useRelay';
import { healthApi, filesApi } from '../api/relay-api';
import { version } from '../../../version.json';
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
  const [workingDirInput, setWorkingDirInput] = useState(() => {
    const saved = storage.get('working-dir');
    if (saved) return saved;
    // Auto-populate with base path for easier entry
    return '/Users/jayspar/Documents/projects/';
  });
  const [fontSizeInput, setFontSizeInput] = useState(() => {
    return storage.get('fontSize') || '14';
  });
  const [healthInfo, setHealthInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [recentDirs, setRecentDirs] = useState(() => {
    return storage.getJSON('recent-dirs', []);
  });
  const [notificationSettings, setNotificationSettings] = useState(() => notificationService.getSettings());

  // Fetch health info periodically
  const fetchHealth = useCallback(() => {
    healthApi.check()
      .then((response) => setHealthInfo(response.data))
      .catch(() => setHealthInfo(null));
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 3000);
    return () => clearInterval(interval);
  }, [fetchHealth, connectionState]);

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

  const addToRecentDirs = useCallback((dir) => {
    const updated = [dir, ...recentDirs.filter(d => d !== dir)].slice(0, 5);
    setRecentDirs(updated);
    storage.setJSON('recent-dirs', updated);
  }, [recentDirs]);

  const handleStartPty = useCallback(async () => {
    if (!workingDirInput.trim()) {
      alert('Please enter a working directory');
      return;
    }
    setStarting(true);
    try {
      console.log('Starting PTY with workingDir:', workingDirInput.trim());
      const response = await healthApi.startPty(workingDirInput.trim());
      console.log('Start PTY response:', response.data);
      storage.set('working-dir', workingDirInput.trim());
      addToRecentDirs(workingDirInput.trim());
      fetchHealth();
    } catch (error) {
      console.error('Failed to start PTY:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: error.config,
      });
      alert(error.response?.data?.error || error.message || 'Failed to start Claude Code');
    }
    setStarting(false);
  }, [workingDirInput, addToRecentDirs, fetchHealth]);

  const handleStopPty = useCallback(async () => {
    setStopping(true);
    try {
      await healthApi.stopPty();
      fetchHealth();
    } catch (error) {
      console.error('Failed to stop PTY:', error);
    }
    setStopping(false);
  }, [fetchHealth]);

  const handleRestartPty = useCallback(async () => {
    setStarting(true);
    try {
      await healthApi.restartPty();
      fetchHealth();
    } catch (error) {
      console.error('Failed to restart PTY:', error);
    }
    setStarting(false);
  }, [fetchHealth]);

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

  const handleSelectRecentDir = useCallback((dir) => {
    setWorkingDirInput(dir);
  }, []);

  const handleNotificationSettingChange = useCallback((key, value) => {
    const newSettings = { ...notificationSettings, [key]: value };
    setNotificationSettings(newSettings);
    notificationService.saveSettings(newSettings);
  }, [notificationSettings]);

  const connectionStatusColor = {
    connected: 'text-green-400',
    connecting: 'text-yellow-400',
    reconnecting: 'text-yellow-400',
    disconnected: 'text-red-400',
  };

  const ptyRunning = healthInfo?.pty?.running;

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-700 safe-area-top">
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
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Claude Code Control */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-orange-400" />
              <h2 className="text-white font-medium">Claude Code</h2>
            </div>
            <span className={ptyRunning ? 'text-green-400 text-sm' : 'text-gray-500 text-sm'}>
              {ptyRunning ? 'Running' : 'Stopped'}
            </span>
          </div>

          {/* Current working dir if running */}
          {ptyRunning && healthInfo?.pty?.workingDir && (
            <div className="px-3 py-2 bg-gray-700/50 rounded-lg">
              <p className="text-xs text-gray-400">Current Project</p>
              <p className="text-sm text-white truncate">{healthInfo.pty.workingDir}</p>
            </div>
          )}

          {/* Working Directory Input */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Project Directory</label>
            <input
              type="text"
              value={workingDirInput}
              onChange={(e) => setWorkingDirInput(e.target.value)}
              placeholder="Add project folder name (e.g., claude-pocket)"
              disabled={ptyRunning}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          {/* Recent Directories */}
          {recentDirs.length > 0 && !ptyRunning && (
            <div className="space-y-2">
              <label className="text-xs text-gray-500">Recent</label>
              <div className="flex flex-wrap gap-2">
                {recentDirs.map((dir) => (
                  <button
                    key={dir}
                    onClick={() => handleSelectRecentDir(dir)}
                    className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 truncate max-w-[150px]"
                  >
                    {dir.split('/').pop() || dir}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Start/Stop/Restart Buttons */}
          <div className="flex gap-2">
            {!ptyRunning ? (
              <button
                onClick={handleStartPty}
                disabled={starting || connectionState !== 'connected'}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 disabled:text-gray-300 rounded-lg text-white transition-colors"
              >
                <Play className="w-5 h-5" />
                <span>{starting ? 'Starting...' : 'Start Claude Code'}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handleStopPty}
                  disabled={stopping || connectionState !== 'connected'}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 rounded-lg text-white transition-colors"
                >
                  <Square className="w-4 h-4" />
                  <span>{stopping ? 'Stopping...' : 'Stop'}</span>
                </button>
                <button
                  onClick={handleRestartPty}
                  disabled={starting || connectionState !== 'connected'}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 rounded-lg text-white transition-colors"
                >
                  <RefreshCw className={`w-5 h-5 ${starting ? 'animate-spin' : ''}`} />
                  <span>Restart</span>
                </button>
              </>
            )}
          </div>
        </div>

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
        </div>

        {/* Data */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-400" />
            <h2 className="text-white font-medium">Data</h2>
          </div>

          <button
            onClick={handleClearHistory}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600/20 hover:bg-red-600/30 rounded-lg text-red-400 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
            <span>Clear Command History</span>
          </button>

          <button
            onClick={handleCleanupFiles}
            disabled={cleaning || connectionState !== 'connected' || !ptyRunning}
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
            {healthInfo && (
              <div className="flex justify-between">
                <span className="text-gray-400">Relay Version</span>
                <span className="text-gray-300">{healthInfo.version}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
