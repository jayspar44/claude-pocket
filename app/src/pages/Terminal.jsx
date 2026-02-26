import { useRef, useCallback, useState, useEffect } from 'react';
import { TerminalView } from '../components/terminal';
import { useTerminalRelay, useRelay } from '../hooks/useRelay';
import { useViewportHeight } from '../hooks/useViewportHeight';
import InputBar from '../components/input/InputBar';
import QuickActions from '../components/input/QuickActions';
import StatusBar from '../components/StatusBar';
import { CommandPalette } from '../components/command';
import { MobileFilePicker, ImagePicker } from '../components/files';
import { InstanceTabBar, InstanceManager } from '../components/instance';
import { storage } from '../utils/storage';
import { Server } from 'lucide-react';

function Terminal() {
  const terminalRef = useRef(null);
  const containerRef = useRef(null);
  const inputBarRef = useRef(null);
  const prevViewportHeightRef = useRef(null);
  const wasAtBottomRef = useRef(true);
  const { connectionState, ptyStatus, sendInput, sendResize, sendInterrupt, submitInput, clearAndReplay } = useTerminalRelay(terminalRef);
  const { connect, detectedOptions, clearDetectedOptions, activeInstance, activeInstanceId, ptyError, instances, needsInput, taskComplete } = useRelay();
  const viewportHeight = useViewportHeight();
  const [fontSize] = useState(() => {
    const stored = storage.get('fontSize');
    return stored ? parseInt(stored, 10) : 12;
  });

  // Refit terminal when viewport changes (keyboard show/hide)
  useEffect(() => {
    if (terminalRef.current) {
      const prevHeight = prevViewportHeightRef.current;
      const keyboardOpened = prevHeight && viewportHeight < prevHeight;

      // Track if we were at bottom before viewport change
      if (!keyboardOpened) {
        wasAtBottomRef.current = terminalRef.current.isAtBottom?.() ?? true;
      }

      // Small delay to let layout settle
      requestAnimationFrame(() => {
        terminalRef.current.fit?.();

        // If keyboard opened and we were at bottom, scroll to bottom
        if (keyboardOpened && wasAtBottomRef.current) {
          terminalRef.current.scrollToBottom?.();
        }
      });

      prevViewportHeightRef.current = viewportHeight;
    }
  }, [viewportHeight]);

  // Bottom sheet states
  const [showCommands, setShowCommands] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showInstanceManager, setShowInstanceManager] = useState(false);
  const [editInstanceId, setEditInstanceId] = useState(null);
  const [startInAddMode, setStartInAddMode] = useState(false);

  // Ctrl modifier state
  const [ctrlActive, setCtrlActive] = useState(false);

  // Auto-open instance manager on first load if PTY not running
  const hasAutoOpenedRef = useRef(false);
  useEffect(() => {
    // Only check once after initial connection
    if (hasAutoOpenedRef.current) return;
    if (connectionState !== 'connected') return;
    // Wait until we receive PTY status from server (not just undefined)
    if (ptyStatus === undefined || ptyStatus === null) return;

    // If connected and PTY status received but not running, open instance manager
    if (!ptyStatus.running) {
      hasAutoOpenedRef.current = true;
      setShowInstanceManager(true);
    } else {
      hasAutoOpenedRef.current = true;
    }
  }, [connectionState, ptyStatus]);

  // Note: Instance switching and terminal clear/replay is now handled
  // directly in useTerminalRelay hook for proper instance routing

  const handleResize = useCallback((cols, rows) => {
    sendResize(cols, rows);
    storage.setJSON('terminal-dims', { cols, rows });
  }, [sendResize]);

  const handleSend = useCallback((text) => {
    if (ctrlActive && text.length > 0) {
      // Send as ctrl+key (convert first char to control character)
      const char = text[0].toUpperCase();
      const ctrlCode = char.charCodeAt(0) - 64;
      if (ctrlCode >= 1 && ctrlCode <= 26) {
        sendInput(String.fromCharCode(ctrlCode));
      }
      setCtrlActive(false);
    } else {
      // Two-phase submission: text first, then Enter after delay (handled by relay)
      submitInput(text);
    }
  }, [submitInput, sendInput, ctrlActive]);

  const handleQuickAction = useCallback((action) => {
    switch (action) {
      case 'interrupt':
        sendInterrupt();
        break;
      case 'tab':
        sendInput('\t');
        break;
      case 'shift-tab':
        sendInput('\x1b[Z');
        break;
      case 'escape':
        sendInput('\x1b');
        break;
      case 'enter':
        sendInput('\r');
        break;
      case 'arrow-up':
        sendInput('\x1b[A');
        break;
      case 'arrow-down':
        sendInput('\x1b[B');
        break;
      case 'arrow-left':
        sendInput('\x1b[D');
        break;
      case 'arrow-right':
        sendInput('\x1b[C');
        break;
      case 'refresh':
        // Clear xterm display and request buffered output replay
        clearAndReplay();
        break;
      default:
        // Handle option-{num} actions
        if (action.startsWith('option-')) {
          const num = action.split('-')[1];
          clearDetectedOptions();  // Clear immediately for responsive UI
          submitInput(num);        // Use submitInput (sends text + Enter properly)
        } else {
          console.warn('Unknown quick action:', action);
        }
    }
  }, [sendInput, sendInterrupt, clearAndReplay, clearDetectedOptions, submitInput]);

  const handleCommandSelect = useCallback((command) => {
    // Insert command with trailing space for arguments
    inputBarRef.current?.insertText(`/${command.name} `);
    inputBarRef.current?.focus();
    setShowCommands(false);
  }, []);

  const handleFileSelect = useCallback((filePath) => {
    // Insert file reference using @path syntax
    inputBarRef.current?.insertText(`@${filePath}`);
    inputBarRef.current?.focus();
    setShowFiles(false);
  }, []);

  const handleImageUpload = useCallback((imagePath) => {
    // Insert image reference using @path syntax
    inputBarRef.current?.insertText(`@${imagePath}`);
    inputBarRef.current?.focus();
    setShowImagePicker(false);
  }, []);

  const handleManageInstance = useCallback((instanceId) => {
    setEditInstanceId(instanceId || null);
    setStartInAddMode(false);
    setShowInstanceManager(true);
  }, []);

  const handleOpenInstanceManager = useCallback(() => {
    setEditInstanceId(null);
    setStartInAddMode(false);  // Open list view, not add form
    setShowInstanceManager(true);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-gray-900"
      style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}
    >
      {/* Status Bar */}
      <StatusBar connectionState={connectionState} ptyStatus={ptyStatus} onReconnect={connect} workingDir={ptyStatus?.workingDir || activeInstance?.workingDir} ptyError={ptyError} onAddInstance={handleOpenInstanceManager} needsInput={needsInput || detectedOptions?.length > 0} taskComplete={taskComplete} instanceCount={instances?.length || 1} />

      {/* Instance Tab Bar */}
      <InstanceTabBar onManageClick={handleManageInstance} />

      {/* Terminal - flex-1 with min-h-0 allows it to shrink/grow */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {connectionState === 'connected' && !ptyStatus?.running && ptyStatus?.updating ? (
          // Updating state - claude update running before start
          <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6">
            <div className="w-12 h-12 mb-4 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-center text-lg font-medium text-gray-300 mb-2">Checking for updates</p>
            <p className="text-center text-sm">
              Claude Code will start shortly
            </p>
          </div>
        ) : connectionState === 'connected' && !ptyStatus?.running ? (
          // Empty state when connected but no PTY running
          <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6">
            <Server className="w-12 h-12 mb-4 text-gray-600" />
            <p className="text-center text-lg font-medium text-gray-300 mb-2">No Active Session</p>
            <p className="text-center text-sm mb-4">
              Start Claude Code from the instance manager to begin
            </p>
            <button
              onClick={handleOpenInstanceManager}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-colors"
            >
              Open Instance Manager
            </button>
          </div>
        ) : (
          <TerminalView
            ref={terminalRef}
            onResize={handleResize}
            fontSize={fontSize}
          />
        )}
      </div>

      {/* Quick Actions */}
      <QuickActions
        onAction={handleQuickAction}
        onOpenCommands={() => setShowCommands(true)}
        onOpenFiles={() => setShowFiles(true)}
        onOpenCamera={() => setShowImagePicker(true)}
        ctrlActive={ctrlActive}
        onCtrlToggle={() => setCtrlActive(prev => !prev)}
        disabled={connectionState !== 'connected'}
        detectedOptions={detectedOptions}
        onDismissOptions={clearDetectedOptions}
      />

      {/* Input Bar */}
      <InputBar
        ref={inputBarRef}
        onSend={handleSend}
        disabled={connectionState !== 'connected'}
        placeholder={connectionState === 'connected' ? 'Type a message...' : 'Connecting...'}
      />

      {/* Bottom Sheets */}
      <CommandPalette
        isOpen={showCommands}
        onClose={() => setShowCommands(false)}
        onSelect={handleCommandSelect}
        activeInstanceId={activeInstanceId}
      />

      <MobileFilePicker
        isOpen={showFiles}
        onClose={() => setShowFiles(false)}
        onSelect={handleFileSelect}
        instanceId={activeInstanceId}
      />

      <ImagePicker
        isOpen={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onUpload={handleImageUpload}
        instanceId={activeInstanceId}
      />

      <InstanceManager
        isOpen={showInstanceManager}
        onClose={() => {
          setShowInstanceManager(false);
          setEditInstanceId(null);
          setStartInAddMode(false);
        }}
        editInstanceId={editInstanceId}
        startInAddMode={startInAddMode}
      />
    </div>
  );
}

export default Terminal;
