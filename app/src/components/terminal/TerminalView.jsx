import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ChevronDown } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

const defaultTheme = {
  background: '#1a1a2e',
  foreground: '#e0e0e0',
  cursor: '#f0f0f0',
  cursorAccent: '#1a1a2e',
  selectionBackground: '#4a4a6a',
  black: '#1a1a2e',
  red: '#ff6b6b',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e0e0e0',
  brightBlack: '#6b7280',
  brightRed: '#f87171',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff',
};

const TerminalView = forwardRef(function TerminalView(
  { onResize, fontSize = 14, className = '' },
  ref
) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollToBottom();
      setShowScrollButton(false);
    }
  }, []);

  // Expose terminal methods to parent
  useImperativeHandle(ref, () => ({
    write: (data) => terminalRef.current?.write(data),
    clear: () => terminalRef.current?.clear(),
    focus: () => terminalRef.current?.focus(),
    fit: () => fitAddonRef.current?.fit(),
    getTerminal: () => terminalRef.current,
  }));

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      theme: defaultTheme,
      scrollback: 5000, // Reduced for better mobile performance
      convertEol: true,
      disableStdin: true, // We handle input separately
      allowProposedApi: true,
      scrollSensitivity: 1, // Finer control for touch scrolling
      smoothScrollDuration: 150, // Slightly longer for smoother mobile feel
      // Canvas renderer for 5-45x better performance (VS Code approach)
      // Note: 'canvas' was renamed to 'webgl' in newer xterm.js
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal synchronously but catch any initialization errors
    try {
      terminal.open(containerRef.current);
      fitAddon.fit();
    } catch (error) {
      console.warn('Terminal open warning (usually safe to ignore):', error);
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Track scroll position to show/hide scroll button
    terminal.onScroll(() => {
      const buffer = terminal.buffer.active;
      const isAtBottom = buffer.viewportY >= buffer.baseY;
      setShowScrollButton(!isAtBottom);
    });

    // Notify parent of initial size
    if (onResize) {
      onResize(terminal.cols, terminal.rows);
    }

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current && containerRef.current) {
          fitAddonRef.current.fit();
          if (onResize && terminalRef.current) {
            onResize(terminalRef.current.cols, terminalRef.current.rows);
          }
        }
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [fontSize, onResize]);

  // Update font size if it changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden"
        style={{ backgroundColor: defaultTheme.background }}
      />

      {/* Floating scroll-to-bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition-all z-10"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}
    </div>
  );
});

export default TerminalView;
