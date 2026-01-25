import { useState, useCallback, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Check, Server, FolderOpen } from 'lucide-react';
import { useInstance } from '../../contexts/InstanceContext';

// Build default relay URL from env vars (used for new instances)
const getDefaultRelayUrl = () => {
  const host = import.meta.env.VITE_RELAY_HOST || 'minibox.rattlesnake-mimosa.ts.net';
  const prodRelayPort = import.meta.env.VITE_PROD_RELAY_PORT || '4501';
  return `ws://${host}:${prodRelayPort}/ws`;
};

function InstanceManager({ isOpen, onClose, editInstanceId }) {
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

  const [mode, setMode] = useState('list'); // 'list' | 'add' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    workingDir: '',
    color: instanceColors[0],
  });

  // Handle editInstanceId prop
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
    } else if (isOpen && !editInstanceId) {
      setMode('list');
    }
  }, [editInstanceId, isOpen, instances]);

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
      workingDir: '',
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

  const handleSave = useCallback(() => {
    if (!formData.name.trim()) return;

    if (mode === 'add') {
      // New instances use the default relay URL (PROD)
      const newInstance = addInstance(
        formData.name.trim(),
        getDefaultRelayUrl(),
        formData.workingDir.trim(),
        formData.color
      );
      switchInstance(newInstance.id);
    } else if (mode === 'edit' && editingId) {
      updateInstance(editingId, {
        name: formData.name.trim(),
        workingDir: formData.workingDir.trim(),
        color: formData.color,
      });
    }

    resetForm();
    onClose();
  }, [mode, formData, editingId, addInstance, updateInstance, switchInstance, resetForm, onClose]);

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
        <div className="flex-1 overflow-y-auto p-4">
          {mode === 'list' ? (
            <div className="space-y-2">
              {instances.map((instance) => {
                const state = getInstanceState(instance.id);
                const isActive = instance.id === activeInstanceId;

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
                  autoFocus
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
              </div>

              {/* Color picker */}
              <div className="space-y-2">
                <label className="text-sm text-gray-400">Color</label>
                <div className="flex gap-2">
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
              <div className="flex gap-3 pt-2">
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
