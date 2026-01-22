import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { AnsiUp } from 'ansi_up';
import { ChevronDown } from 'lucide-react';

const TerminalOutput = forwardRef(function TerminalOutput(
  { onResize, fontSize = 14, className = '' },
  ref
) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const ansiUpRef = useRef(null);
  const linesRef = useRef([]);        // Completed lines
  const currentLineRef = useRef('');  // Current incomplete line
  const [renderedHtml, setRenderedHtml] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const shouldAutoScroll = useRef(true);

  // Initialize AnsiUp (using == null pattern for safe ref initialization)
  if (ansiUpRef.current == null) {
    ansiUpRef.current = new AnsiUp();
    ansiUpRef.current.use_classes = true;
  }

  // Line-aware append - handles \r for spinner overwriting
  const appendData = useCallback((data) => {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];

      if (char === '\r') {
        // Check if this is CRLF (\r\n) - if so, treat as newline
        if (data[i + 1] === '\n') {
          // CRLF: commit current line, skip the \r
          linesRef.current.push(currentLineRef.current);
          currentLineRef.current = '';
          i++; // Skip the \n
        } else {
          // Standalone \r: reset to start of line (for spinner overwriting)
          currentLineRef.current = '';
        }
      } else if (char === '\n') {
        // Newline: commit current line, start new one
        linesRef.current.push(currentLineRef.current);
        currentLineRef.current = '';
      } else {
        // Regular char: append to current line
        currentLineRef.current += char;
      }
    }

    // Render all lines + current line
    const fullText = [...linesRef.current, currentLineRef.current].join('\n');
    const html = ansiUpRef.current.ansi_to_html(fullText);
    setRenderedHtml(html);
  }, []);

  // Clear all content
  const clearContent = useCallback(() => {
    linesRef.current = [];
    currentLineRef.current = '';
    setRenderedHtml('');
    // Reset ansi_up to clear color state
    ansiUpRef.current = new AnsiUp();
    ansiUpRef.current.use_classes = true;
  }, []);

  useImperativeHandle(ref, () => ({
    write: (data) => {
      appendData(data);
    },
    clear: () => {
      clearContent();
    },
    focus: () => containerRef.current?.focus(),
    fit: () => {
      if (onResize && containerRef.current) {
        const charWidth = fontSize * 0.6;
        const lineHeight = fontSize * 1.2;
        const cols = Math.floor(containerRef.current.clientWidth / charWidth);
        const rows = Math.floor(containerRef.current.clientHeight / lineHeight);
        onResize(cols, rows);
      }
    },
    getTerminal: () => null,
    scrollToBottom: () => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    },
  }), [fontSize, onResize, appendData, clearContent]);

  // Auto-scroll when new content arrives
  useEffect(() => {
    if (shouldAutoScroll.current && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [renderedHtml]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      shouldAutoScroll.current = isAtBottom;
      setShowScrollButton(!isAtBottom);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
      shouldAutoScroll.current = true;
      setShowScrollButton(false);
    }
  }, []);

  // Report size on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (onResize) {
        const charWidth = fontSize * 0.6;
        const lineHeight = fontSize * 1.2;
        const cols = Math.floor(container.clientWidth / charWidth);
        const rows = Math.floor(container.clientHeight / lineHeight);
        onResize(cols, rows);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fontSize, onResize]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${className}`}
      style={{ backgroundColor: '#1a1a2e' }}
    >
      <div
        ref={contentRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-y-auto p-2"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          fontSize: `${fontSize}px`,
          lineHeight: '1.4',
          color: '#e0e0e0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />

      {/* Floating scroll-to-bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition-all"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}
    </div>
  );
});

export default TerminalOutput;
