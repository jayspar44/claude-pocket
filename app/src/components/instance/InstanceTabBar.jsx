import { useCallback } from 'react';
import { Plus, Bell } from 'lucide-react';
import { useInstance } from '../../contexts/InstanceContext';

export default function InstanceTabBar({ onManageClick }) {
  const {
    instances,
    activeInstanceId,
    switchInstance,
    getInstanceState,
  } = useInstance();

  const handleTabClick = useCallback((instanceId) => {
    switchInstance(instanceId);
  }, [switchInstance]);

  const handleTabLongPress = useCallback((instanceId, e) => {
    e.preventDefault();
    onManageClick?.(instanceId);
  }, [onManageClick]);

  // Only show tab bar when there's more than one instance
  if (instances.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-800 border-b border-gray-700 overflow-x-auto scrollbar-hide">
      {instances.map((instance) => {
        const isActive = instance.id === activeInstanceId;
        const state = getInstanceState(instance.id);
        const hasUnread = state.hasUnread && !isActive;
        const needsInput = state.detectedOptions?.length > 0;

        return (
          <button
            key={instance.id}
            onClick={() => handleTabClick(instance.id)}
            onContextMenu={(e) => handleTabLongPress(instance.id, e)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
              whitespace-nowrap transition-colors min-w-fit
              ${isActive
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
              }
            `}
          >
            {/* Color dot */}
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: instance.color }}
            />

            {/* Instance name */}
            <span className="truncate max-w-[100px]">{instance.name}</span>

            {/* Unread indicator */}
            {hasUnread && (
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            )}

            {/* Needs input indicator */}
            {needsInput && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 animate-pulse flex-shrink-0">
                <Bell className="w-2.5 h-2.5 text-white" />
              </span>
            )}

            {/* Connection status indicator */}
            {state.connectionState !== 'connected' && (
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  state.connectionState === 'connecting' || state.connectionState === 'reconnecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-red-500'
                }`}
              />
            )}
          </button>
        );
      })}

      {/* Add instance button */}
      <button
        onClick={() => onManageClick?.()}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors flex-shrink-0"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
