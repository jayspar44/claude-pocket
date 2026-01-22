import { useRef, useCallback, useState, useEffect } from 'react';
import { TerminalView } from '../components/terminal';
import { useTerminalRelay, useRelay } from '../hooks/useRelay';
import { useViewportHeight } from '../hooks/useViewportHeight';
import InputBar from '../components/input/InputBar';
import QuickActions from '../components/input/QuickActions';
import StatusBar from '../components/StatusBar';
import { CommandPalette } from '../components/command';
import { MobileFilePicker, ImagePicker } from '../components/files';

function Terminal() {
  const terminalRef = useRef(null);
  const containerRef = useRef(null);
  const inputBarRef = useRef(null);
  const prevViewportHeightRef = useRef(null);
  const wasAtBottomRef = useRef(true);
  const { connectionState, ptyStatus, sendInput, sendResize, sendInterrupt, submitInput, clearAndReplay } = useTerminalRelay(terminalRef);
  const { connect, detectedOptions } = useRelay();
  const viewportHeight = useViewportHeight();
  const [fontSize] = useState(() => {
    const stored = localStorage.getItem('terminalFontSize');
    return stored ? parseInt(stored, 10) : 14;
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

  // Ctrl modifier state
  const [ctrlActive, setCtrlActive] = useState(false);

  const handleResize = useCallback((cols, rows) => {
    sendResize(cols, rows);
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
          sendInput(`${num}\r`);
        } else {
          console.warn('Unknown quick action:', action);
        }
    }
  }, [sendInput, sendInterrupt, clearAndReplay]);

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

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-gray-900"
      style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}
    >
      {/* Status Bar */}
      <StatusBar connectionState={connectionState} ptyStatus={ptyStatus} onReconnect={connect} />

      {/* Terminal - flex-1 with min-h-0 allows it to shrink/grow */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <TerminalView
          ref={terminalRef}
          onResize={handleResize}
          fontSize={fontSize}
        />
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
      />

      <MobileFilePicker
        isOpen={showFiles}
        onClose={() => setShowFiles(false)}
        onSelect={handleFileSelect}
      />

      <ImagePicker
        isOpen={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onUpload={handleImageUpload}
      />
    </div>
  );
}

export default Terminal;
