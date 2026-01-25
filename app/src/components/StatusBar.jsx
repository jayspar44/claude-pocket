import { Wifi, WifiOff, RefreshCw, Settings, Terminal, TerminalSquare, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRelay } from '../contexts/RelayContext';

// Extract folder name from working directory path
// e.g., "/Users/foo/Documents/projects/my-app" -> "my-app"
function getFolderName(workingDir) {
  if (!workingDir) return null;
  // Find everything after "projects/" or just the last folder
  const projectsMatch = workingDir.match(/projects\/(.+)$/);
  if (projectsMatch) return projectsMatch[1];
  // Fallback: just the last path segment
  const parts = workingDir.split('/').filter(Boolean);
  return parts[parts.length - 1] || null;
}

// Determine environment from relay URL (by relay port number)
function getEnvironment(url) {
  if (!url) return null;
  if (url.includes(':4503')) return 'DEV';   // DEV relay port
  if (url.includes(':4501')) return 'PROD';  // PROD relay port
  return 'CUSTOM';
}

const envConfig = {
  DEV: { color: 'bg-blue-600', text: 'DEV' },
  PROD: { color: 'bg-orange-600', text: 'PROD' },
  CUSTOM: { color: 'bg-purple-600', text: 'CUSTOM' },
};

const connectionConfig = {
  connected: { color: 'bg-green-500', icon: Wifi, label: 'Relay' },
  connecting: { color: 'bg-yellow-500', icon: RefreshCw, label: 'Connecting', animate: true },
  reconnecting: { color: 'bg-yellow-500', icon: RefreshCw, label: 'Reconnecting', animate: true },
  disconnected: { color: 'bg-red-500', icon: WifiOff, label: 'Offline' },
};

const ptyConfig = {
  running: { color: 'bg-green-500', icon: Terminal, label: 'Claude' },
  stopped: { color: 'bg-gray-500', icon: TerminalSquare, label: 'Stopped' },
};

function StatusBar({ connectionState, ptyStatus, workingDir, ptyError, onReconnect }) {
  const { getRelayUrl } = useRelay();
  const connStatus = connectionConfig[connectionState] || connectionConfig.disconnected;
  const ConnIcon = connStatus.icon;
  const showReconnect = connectionState === 'disconnected' || connectionState === 'reconnecting';
  const isReconnecting = connectionState === 'reconnecting';

  // Environment indicator
  const env = getEnvironment(getRelayUrl());
  const envStyle = env ? envConfig[env] : null;

  // PTY status - only show when connected to relay
  const isConnected = connectionState === 'connected';
  const isPtyRunning = ptyStatus?.running === true;
  const ptyState = isPtyRunning ? ptyConfig.running : ptyConfig.stopped;
  const PtyIcon = ptyState.icon;

  // Folder name from working directory
  const folderName = getFolderName(workingDir);

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 safe-area-top min-h-[44px]">
      {/* Connection + PTY status */}
      <div className="flex items-center gap-3">
        {/* Environment badge */}
        {envStyle && (
          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${envStyle.color} text-white`}>
            {envStyle.text}
          </span>
        )}

        {/* Relay connection */}
        <div className="flex items-center gap-1.5 h-4">
          <div className={`w-2 h-2 rounded-full shrink-0 ${connStatus.color}`} />
          <ConnIcon
            className={`w-4 h-4 text-gray-400 shrink-0 ${connStatus.animate ? 'animate-spin' : ''}`}
          />
          <span className="text-xs text-gray-400 leading-4">{connStatus.label}</span>
        </div>

        {/* PTY status - show when connected */}
        {isConnected && (
          <>
            <span className="text-gray-600">|</span>
            <div className="flex items-center gap-1.5 h-4">
              <div className={`w-2 h-2 rounded-full shrink-0 ${ptyError ? 'bg-red-500' : ptyState.color}`} />
              <PtyIcon className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-xs text-gray-400 leading-4">{ptyState.label}</span>
            </div>
            {/* Folder name */}
            {folderName && (
              <>
                <span className="text-gray-600">|</span>
                <span className="text-xs text-gray-500 truncate max-w-[120px]">{folderName}</span>
              </>
            )}
          </>
        )}
      </div>

      {/* PTY Error message */}
      {ptyError && isConnected && (
        <div className="flex items-center gap-1.5 mx-2 px-2 py-0.5 bg-red-900/50 rounded">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-xs text-red-300 truncate">{ptyError}</span>
        </div>
      )}

      {/* Right side: Reconnect + Settings */}
      <div className="flex items-center gap-2">
        {showReconnect && onReconnect && (
          <button
            onClick={onReconnect}
            disabled={isReconnecting}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isReconnecting ? 'animate-spin' : ''}`} />
            <span>Reconnect</span>
          </button>
        )}
        <Link
          to="/settings"
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

export default StatusBar;
