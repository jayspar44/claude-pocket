import { Wifi, WifiOff, RefreshCw, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

const statusConfig = {
  connected: {
    color: 'bg-green-500',
    icon: Wifi,
    label: 'Connected',
  },
  connecting: {
    color: 'bg-yellow-500',
    icon: RefreshCw,
    label: 'Connecting',
    animate: true,
  },
  reconnecting: {
    color: 'bg-yellow-500',
    icon: RefreshCw,
    label: 'Reconnecting',
    animate: true,
  },
  disconnected: {
    color: 'bg-red-500',
    icon: WifiOff,
    label: 'Disconnected',
  },
};

function StatusBar({ connectionState, workingDir }) {
  const status = statusConfig[connectionState] || statusConfig.disconnected;
  const StatusIcon = status.icon;

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 safe-area-top">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${status.color}`} />
        <StatusIcon
          className={`w-4 h-4 text-gray-400 ${status.animate ? 'animate-spin' : ''}`}
        />
        <span className="text-xs text-gray-400">{status.label}</span>
      </div>

      {/* Working directory (if provided) */}
      {workingDir && (
        <div className="flex-1 mx-4 overflow-hidden">
          <p className="text-xs text-gray-500 truncate text-center">
            {workingDir}
          </p>
        </div>
      )}

      {/* Settings link */}
      <Link
        to="/settings"
        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
        aria-label="Settings"
      >
        <Settings className="w-4 h-4" />
      </Link>
    </div>
  );
}

export default StatusBar;
