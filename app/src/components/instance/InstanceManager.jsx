import { useState, useCallback, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Check, Server, FolderOpen, Play, Square, RotateCw, Clock } from 'lucide-react';
import { useInstance } from '../../contexts/InstanceContext';
import { healthApi } from '../../api/relay-api';
import { storage } from '../../utils/storage';

// Default working directory prefix for convenience
const DEFAULT_WORKING_DIR_PREFIX = '/Users/jayspar/Documents/projects/';

// Build default relay URL matching current app environment
const getDefaultRelayUrl = () => {
  const host = import.meta.env.VITE_RELAY_HOST || window.location.hostname;
  const appPort = window.location.port;
  const devAppPort = import.meta.env.VITE_DEV_APP_PORT || '4502';
  const devRelayPort = import.meta.env.VITE_DEV_RELAY_PORT || '4503';
  const prodRelayPort = import.meta.env.VITE_PROD_RELAY_PORT || '4501';

  // Match relay port to app port (DEV app port → DEV relay, else PROD relay)
  const relayPort = appPort === devAppPort ? devRelayPort : prodRelayPort;
  return `ws://${host}:${relayPort}/ws`;
};

function InstanceManager({ isOpen, onClose, editInstanceId, startInAddMode }) {
  const {
    instances,
    activeInstanceId,
    addInstance,
    updateInstance,
    removeInstance,
    switchInstance,
    instanceColors,
    getInstanceState,
  } = useInstance();

  const [ptyLoading, setPtyLoading] = useState(false);
  const [recentDirs, setRecentDirs] = useState(() => storage.getJSON('recent-dirs', []));

  const [mode, setMode] = useState('list'); // 'list' | 'add' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    workingDir: '',
    color: instanceColors[0],
  });

  // Handle editInstanceId and startInAddMode props
  useEffect(() => {
    if (editInstanceId && isOpen) {
      const instance = instances.find(i => i.id === editInstanceId);
      if (instance) {
        setEditingId(editInstanceId);
        setFormData({
          name: instance.name,
          workingDir: instance.workingDir || '',
          color: instance.color,
        });
        setMode('edit');
      }
    } else if (isOpen && startInAddMode) {
      // Open directly in add mode
      setFormData({
        name: `Instance ${instances.length + 1}`,
        workingDir: DEFAULT_WORKING_DIR_PREFIX,
        color: instanceColors[instances.length % instanceColors.length],
      });
      setMode('add');
    } else if (isOpen && !editInstanceId) {
      setMode('list');
    }
  }, [editInstanceId, isOpen, instances, startInAddMode, instanceColors]);

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      workingDir: '',
      color: instanceColors[instances.length % instanceColors.length],
    });
    setEditingId(null);
    setMode('list');
  }, [instanceColors, instances.length]);

  const handleAddClick = useCallback(() => {
    setFormData({
      name: `Instance ${instances.length + 1}`,
      workingDir: DEFAULT_WORKING_DIR_PREFIX,
      color: instanceColors[instances.length % instanceColors.length],
    });
    setMode('add');
  }, [instances.length, instanceColors]);

  const handleEditClick = useCallback((instance) => {
    setEditingId(instance.id);
    setFormData({
      name: instance.name,
      workingDir: instance.workingDir || '',
      color: instance.color,
    });
    setMode('edit');
  }, []);

  const addToRecentDirs = useCallback((dir) => {
    if (!dir || dir === DEFAULT_WORKING_DIR_PREFIX) return;
    const updated = [dir, ...recentDirs.filter(d => d !== dir)].slice(0, 5);
    setRecentDirs(updated);
    storage.setJSON('recent-dirs', updated);
  }, [recentDirs]);

  const handleSelectRecentDir = useCallback((dir) => {
    setFormData(prev => ({ ...prev, workingDir: dir }));
  }, []);

  const handleSave = useCallback(() => {
    if (!formData.name.trim()) return;

    const workingDir = formData.workingDir.trim();

    if (mode === 'add') {
      // New instances use the default relay URL matching current environment
      const newInstance = addInstance(
        formData.name.trim(),
        getDefaultRelayUrl(),
        workingDir,
        formData.color
      );
      switchInstance(newInstance.id);
    } else if (mode === 'edit' && editingId) {
      updateInstance(editingId, {
        name: formData.name.trim(),
        workingDir,
        color: formData.color,
      });
    }

    // Save to recent directories
    if (workingDir) {
      addToRecentDirs(workingDir);
    }

    resetForm();
    onClose();
  }, [mode, formData, editingId, addInstance, updateInstance, switchInstance, resetForm, onClose, addToRecentDirs]);

  const handleDelete = useCallback((instanceId) => {
    if (instances.length <= 1) {
      alert('Cannot delete the last instance');
      return;
    }
    if (confirm('Delete this instance?')) {
      removeInstance(instanceId);
    }
  }, [instances.length, removeInstance]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // PTY control handlers
  const handleStartPty = useCallback(async (instance) => {
    if (!instance.workingDir) {
      alert('Please set a working directory for this instance');
      return;
    }
    setPtyLoading(true);
    try {
      await healthApi.startPty(instance.workingDir, instance.id);
    } catch (error) {
      console.error('Failed to start PTY:', error);
      alert(error.response?.data?.error || 'Failed to start Claude Code');
    }
    setPtyLoading(false);
  }, []);

  const handleStopPty = useCallback(async (instanceId) => {
    setPtyLoading(true);
    try {
      await healthApi.stopPty(instanceId);
    } catch (error) {
      console.error('Failed to stop PTY:', error);
    }
    setPtyLoading(false);
  }, []);

  const handleRestartPty = useCallback(async (instanceId) => {
    setPtyLoading(true);
    try {
      await healthApi.restartPty(undefined, instanceId);
    } catch (error) {
      console.error('Failed to restart PTY:', error);
    }
    setPtyLoading(false);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg bg-gray-800 rounded-t-2xl max-h-[80vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">
              {mode === 'list' ? 'Instances' : mode === 'add' ? 'Add Instance' : 'Edit Instance'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 safe-area-bottom">
          {mode === 'list' ? (
            <div className="space-y-2">
              {instances.map((instance) => {
                const state = getInstanceState(instance.id);
                const isActive = instance.id === activeInstanceId;
                const isConnected = state.connectionState === 'connected';
                // Use per-instance PTY status, not just active instance
                const instancePtyStatus = state.ptyStatus;
                const isPtyRunning = instancePtyStatus?.running;

                return (
                  <div
                    key={instance.id}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      isActive ? 'bg-gray-700' : 'bg-gray-700/50 hover:bg-gray-700'
                    }`}
                  >
                    {/* Color dot */}
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: instance.color }}
                    />

                    {/* Instance info */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => {
                        switchInstance(instance.id);
                        onClose();
                      }}
                    >
                      <p className="text-white font-medium truncate">{instance.name}</p>
                      {instance.workingDir && (
                        <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                          <FolderOpen className="w-3 h-3" />
                          {instance.workingDir.split('/').pop() || instance.workingDir}
                        </p>
                      )}
                    </div>

                    {/* Connection status */}
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        state.connectionState === 'connected'
                          ? 'bg-green-500'
                          : state.connectionState === 'connecting' || state.connectionState === 'reconnecting'
                          ? 'bg-yellow-500 animate-pulse'
                          : 'bg-gray-500'
                      }`}
                    />

                    {/* PTY controls for connected instances */}
                    {isConnected && (
                      <div className="flex items-center gap-1">
                        {isPtyRunning ? (
                          <>
                            <button
                              onClick={() => handleStopPty(instance.id)}
                              disabled={ptyLoading}
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
                              title="Stop"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRestartPty(instance.id)}
                              disabled={ptyLoading}
                              className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
                              title="Restart"
                            >
                              <RotateCw className={`w-3.5 h-3.5 ${ptyLoading ? 'animate-spin' : ''}`} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleStartPty(instance)}
                            disabled={ptyLoading || !instance.workingDir}
                            className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
                            title="Start"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Edit button */}
                    <button
                      onClick={() => handleEditClick(instance)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Delete button */}
                    {instances.length > 1 && (
                      <button
                        onClick={() => handleDelete(instance.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Add instance button */}
              <button
                onClick={handleAddClick}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Add Instance</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm text-gray-400">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My Project"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus={mode === 'add'}
                />
              </div>

              {/* Working Directory */}
              <div className="space-y-2">
                <label className="text-sm text-gray-400">Working Directory</label>
                <input
                  type="text"
                  value={formData.workingDir}
                  onChange={(e) => setFormData(prev => ({ ...prev, workingDir: e.target.value }))}
                  placeholder="/path/to/project"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500">
                  Path to your project folder where Claude will run
                </p>

                {/* Recent Directories */}
                {recentDirs.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>Recent</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recentDirs.map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => handleSelectRecentDir(dir)}
                          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 truncate max-w-[140px]"
                        >
                          {dir.split('/').pop() || dir}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Color picker */}
              <div className="space-y-3">
                <label className="text-sm text-gray-400">Color</label>
                <div className="flex gap-3">
                  {instanceColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        formData.color === color ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-gray-800' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 mt-2">
                <button
                  onClick={resetForm}
                  className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formData.name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 rounded-lg text-white transition-colors"
                >
                  <Check className="w-5 h-5" />
                  <span>{mode === 'add' ? 'Add' : 'Save'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InstanceManager;
