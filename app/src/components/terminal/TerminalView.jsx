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

// =============================================================================
// Scroll System: VelocityTracker, MomentumScroller, TerminalScrollHandler
// =============================================================================

// Physics parameters (tunable)
const SCROLL_CONFIG = {
  // Velocity tracking
  MAX_SAMPLES: 8,
  MAX_SAMPLE_AGE: 150, // ms - discard samples older than this
  VELOCITY_DECAY: 50, // ms - exponential weight decay

  // Momentum physics
  TIME_CONSTANT_NORMAL: 325, // ms - iOS-like decay
  TIME_CONSTANT_FAST: 200, // ms - snappier for fast flicks
  AMPLITUDE_MULTIPLIER: 800, // distance multiplier
  MIN_VELOCITY: 0.1, // px/ms threshold to trigger momentum
  FAST_VELOCITY: 2.0, // px/ms threshold for fast time constant

  // Boundaries
  OVERSCROLL_RESISTANCE: 0.4,

  // Gesture detection
  TAP_THRESHOLD: 10, // px - max movement to consider a tap
  TAP_TIME_THRESHOLD: 200, // ms - max time to consider a tap

  // Long-press for text selection
  LONG_PRESS_DURATION: 500, // ms - hold time to trigger selection mode
  LONG_PRESS_MOVE_THRESHOLD: 10, // px - max movement during long press
};

/**
 * Time-weighted velocity tracker with outlier filtering
 */
class VelocityTracker {
  constructor() {
    this.samples = []; // { time, velocity }
  }

  addSample(velocity) {
    const now = performance.now();
    this.samples.push({ time: now, velocity });

    // Keep max samples
    if (this.samples.length > SCROLL_CONFIG.MAX_SAMPLES) {
      this.samples.shift();
    }

    // Remove old samples
    const cutoff = now - SCROLL_CONFIG.MAX_SAMPLE_AGE;
    this.samples = this.samples.filter(s => s.time >= cutoff);
  }

  getVelocity() {
    if (this.samples.length === 0) return 0;

    const now = performance.now();
    const cutoff = now - SCROLL_CONFIG.MAX_SAMPLE_AGE;
    const recentSamples = this.samples.filter(s => s.time >= cutoff);

    if (recentSamples.length === 0) return 0;

    // IQR outlier filtering for 4+ samples
    let filteredSamples = recentSamples;
    if (recentSamples.length >= 4) {
      const velocities = recentSamples.map(s => s.velocity).sort((a, b) => a - b);
      const q1 = velocities[Math.floor(velocities.length * 0.25)];
      const q3 = velocities[Math.floor(velocities.length * 0.75)];
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;
      filteredSamples = recentSamples.filter(s => s.velocity >= lower && s.velocity <= upper);
      if (filteredSamples.length === 0) filteredSamples = recentSamples;
    }

    // Exponential time-weighted average (recent samples weighted more)
    let weightedSum = 0;
    let totalWeight = 0;

    for (const sample of filteredSamples) {
      const age = now - sample.time;
      const weight = Math.exp(-age / SCROLL_CONFIG.VELOCITY_DECAY);
      weightedSum += sample.velocity * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  reset() {
    this.samples = [];
  }
}

/**
 * Physics-based momentum scroller with iOS-like feel
 */
class MomentumScroller {
  constructor(onScroll, getBounds) {
    this.onScroll = onScroll; // (deltaLines: number) => void
    this.getBounds = getBounds; // () => { atTop, atBottom }
    this.animationId = null;
    this.amplitude = 0;
    this.startTime = 0;
    this.timeConstant = SCROLL_CONFIG.TIME_CONSTANT_NORMAL;
    this.lastDelta = 0;
    this.accumulatedScroll = 0;
    this.cellHeight = 14 * 1.2; // default, updated by handler
  }

  setCellHeight(height) {
    this.cellHeight = height;
  }

  start(velocityPxMs) {
    this.stop();

    if (Math.abs(velocityPxMs) < SCROLL_CONFIG.MIN_VELOCITY) {
      return;
    }

    // Negate: positive velocity (finger down) = scroll content up (negative lines)
    this.amplitude = -velocityPxMs * SCROLL_CONFIG.AMPLITUDE_MULTIPLIER;
    this.startTime = performance.now();
    this.lastDelta = this.amplitude;
    this.accumulatedScroll = 0;

    // Use faster decay for fast flicks
    this.timeConstant = Math.abs(velocityPxMs) > SCROLL_CONFIG.FAST_VELOCITY
      ? SCROLL_CONFIG.TIME_CONSTANT_FAST
      : SCROLL_CONFIG.TIME_CONSTANT_NORMAL;

    this.tick();
  }

  tick = () => {
    const elapsed = performance.now() - this.startTime;
    const delta = this.amplitude * Math.exp(-elapsed / this.timeConstant);

    // Stop when movement is negligible
    if (Math.abs(delta) < 0.5) {
      this.animationId = null;
      return;
    }

    // Calculate frame delta
    let frameDelta = this.lastDelta - delta;
    this.lastDelta = delta;

    // Apply boundary resistance
    const bounds = this.getBounds();
    if ((bounds.atTop && frameDelta < 0) || (bounds.atBottom && frameDelta > 0)) {
      frameDelta *= SCROLL_CONFIG.OVERSCROLL_RESISTANCE;
    }

    // Accumulate and convert to lines
    this.accumulatedScroll += frameDelta;
    const linesToScroll = Math.trunc(this.accumulatedScroll / this.cellHeight);

    if (linesToScroll !== 0) {
      this.onScroll(linesToScroll);
      this.accumulatedScroll -= linesToScroll * this.cellHeight;
    }

    this.animationId = requestAnimationFrame(this.tick);
  };

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.accumulatedScroll = 0;
  }

  isActive() {
    return this.animationId !== null;
  }
}

/**
 * Get actual cell height from xterm.js internal dimensions
 */
const getCellHeight = (terminal, fontSize) => {
  try {
    const renderService = terminal._core?._renderService;
    return renderService?.dimensions?.css?.cell?.height
      || renderService?.dimensions?.actualCellHeight
      || fontSize * (terminal.options.lineHeight || 1.0);
  } catch {
    return fontSize * 1.2;
  }
};

/**
 * Unified touch/pen scroll handler using Pointer Events API
 */
class TerminalScrollHandler {
  constructor(container, terminal, fontSize) {
    this.container = container;
    this.terminal = terminal;
    this.fontSize = fontSize;

    this.velocityTracker = new VelocityTracker();
    this.momentumScroller = new MomentumScroller(
      (lines) => this.terminal.scrollLines(lines),
      () => this.getBounds()
    );

    this.pointerId = null;
    this.startY = 0;
    this.lastY = 0;
    this.lastTime = 0;
    this.totalMovement = 0;
    this.accumulatedScroll = 0;

    // Long-press detection for text selection
    this.longPressTimer = null;
    this.isLongPress = false;
    this.startX = 0;

    // Selection mode state (xterm.js-based selection)
    this.selectionMode = false;
    this.selectionStartCell = null;

    this.updateCellHeight();
    this.bindEvents();
  }

  updateCellHeight() {
    const height = getCellHeight(this.terminal, this.fontSize);
    this.cellHeight = height;
    this.momentumScroller.setCellHeight(height);
  }

  getBounds() {
    const buffer = this.terminal.buffer.active;
    return {
      atTop: buffer.viewportY <= 0,
      atBottom: buffer.viewportY >= buffer.baseY,
    };
  }

  getCellFromEvent(e) {
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellWidth = rect.width / this.terminal.cols;
    const cellHeight = rect.height / this.terminal.rows;
    return {
      col: Math.floor(x / cellWidth),
      row: Math.floor(y / cellHeight) + this.terminal.buffer.active.viewportY,
    };
  }

  bindEvents() {
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onPointerCancel = this.handlePointerCancel.bind(this);

    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('pointercancel', this.onPointerCancel);
  }

  handlePointerDown(e) {
    // Only handle touch/pen, let mouse use native
    if (e.pointerType === 'mouse') return;

    // Stop any ongoing momentum
    this.momentumScroller.stop();

    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.lastY = e.clientY;
    this.lastTime = performance.now();
    this.totalMovement = 0;
    this.accumulatedScroll = 0;
    this.velocityTracker.reset();
    this.isLongPress = false;

    // Start long-press detection timer
    this.longPressTimer = setTimeout(() => {
      // Long press detected - enter xterm.js selection mode
      this.isLongPress = true;
      this.longPressTimer = null;
      this.selectionMode = true;
      this.selectionStartCell = this.getCellFromEvent(e);

      // Trigger haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, SCROLL_CONFIG.LONG_PRESS_DURATION);

    // Capture pointer for reliable tracking (will be released if long-press detected)
    this.container.setPointerCapture(e.pointerId);

    // Don't preventDefault yet - wait to see if it's a long press or scroll
  }

  handlePointerMove(e) {
    if (e.pointerId !== this.pointerId) return;

    // If in selection mode, update xterm.js selection
    if (this.selectionMode && this.selectionStartCell) {
      const endCell = this.getCellFromEvent(e);
      if (endCell) {
        // Calculate selection parameters
        const startRow = this.selectionStartCell.row;
        const startCol = this.selectionStartCell.col;
        const endRow = endCell.row;
        const endCol = endCell.col;

        // For multi-line selection, select from start to end
        if (startRow === endRow) {
          // Same line: select from min col to max col
          const minCol = Math.min(startCol, endCol);
          const length = Math.abs(endCol - startCol) + 1;
          this.terminal.select(minCol, startRow, length);
        } else {
          // Multi-line: use selectLines for full line selection
          const minRow = Math.min(startRow, endRow);
          const maxRow = Math.max(startRow, endRow);
          this.terminal.selectLines(minRow, maxRow);
        }
      }
      e.preventDefault();
      return;
    }

    // If long-press mode is active but not in selection mode, let native selection handle it
    if (this.isLongPress) return;

    const now = performance.now();
    const deltaY = e.clientY - this.lastY;
    const deltaTime = now - this.lastTime;
    const totalDeltaX = Math.abs(e.clientX - this.startX);
    const totalDeltaY = Math.abs(e.clientY - this.startY);

    this.totalMovement += Math.abs(deltaY);

    // Cancel long-press timer if user moved too much (it's a scroll gesture)
    if (this.longPressTimer && (totalDeltaX > SCROLL_CONFIG.LONG_PRESS_MOVE_THRESHOLD ||
        totalDeltaY > SCROLL_CONFIG.LONG_PRESS_MOVE_THRESHOLD)) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    if (deltaTime > 0 && deltaY !== 0) {
      const velocity = deltaY / deltaTime; // px/ms
      this.velocityTracker.addSample(velocity);

      // Direct scroll: finger down (positive deltaY) = scroll content up (negative lines)
      this.accumulatedScroll -= deltaY;
      const linesToScroll = Math.trunc(this.accumulatedScroll / this.cellHeight);

      if (linesToScroll !== 0) {
        this.terminal.scrollLines(linesToScroll);
        this.accumulatedScroll -= linesToScroll * this.cellHeight;
      }
    }

    this.lastY = e.clientY;
    this.lastTime = now;

    e.preventDefault();
  }

  handlePointerUp(e) {
    if (e.pointerId !== this.pointerId) return;

    // Clear long-press timer
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    // If in selection mode, copy selected text and clear selection
    if (this.selectionMode) {
      this.selectionMode = false;
      this.selectionStartCell = null;
      const selectedText = this.terminal.getSelection();
      if (selectedText) {
        navigator.clipboard.writeText(selectedText).catch(() => {
          // Clipboard write may fail silently on some devices
        });
        // Brief haptic feedback to confirm copy
        if (navigator.vibrate) {
          navigator.vibrate(30);
        }
      }
      this.terminal.clearSelection();
      this.pointerId = null;
      this.isLongPress = false;
      e.preventDefault();
      return;
    }

    // If long-press mode but not selection mode, just reset state
    if (this.isLongPress) {
      this.pointerId = null;
      this.isLongPress = false;
      return;
    }

    try {
      this.container.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore - pointer may already be released
    }

    const isTap = this.totalMovement < SCROLL_CONFIG.TAP_THRESHOLD &&
                  (performance.now() - this.lastTime + (this.lastTime - (this.startY !== this.lastY ? 0 : this.lastTime))) < SCROLL_CONFIG.TAP_TIME_THRESHOLD;

    // Start momentum if not a tap and we have velocity
    if (!isTap && this.totalMovement >= SCROLL_CONFIG.TAP_THRESHOLD) {
      const velocity = this.velocityTracker.getVelocity();
      this.momentumScroller.start(velocity);
    }

    this.pointerId = null;
    e.preventDefault();
  }

  handlePointerCancel(e) {
    if (e.pointerId !== this.pointerId) return;

    // Clear long-press timer
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    // Clear selection mode state
    if (this.selectionMode) {
      this.selectionMode = false;
      this.selectionStartCell = null;
      this.terminal.clearSelection();
    }

    try {
      this.container.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore - pointer may already be released
    }

    this.pointerId = null;
    this.isLongPress = false;
  }

  setFontSize(fontSize) {
    this.fontSize = fontSize;
    this.updateCellHeight();
  }

  destroy() {
    this.momentumScroller.stop();
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointercancel', this.onPointerCancel);
  }
}

const TerminalView = forwardRef(function TerminalView(
  { onResize, fontSize = 14, className = '' },
  ref
) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollToBottom();
      setShowScrollButton(false);
    }
  }, []);

  // Expose terminal methods to parent
  useImperativeHandle(ref, () => ({
    write: (data) => {
      if (terminalRef.current) {
        const wasAtBottom = isAtBottomRef.current;
        terminalRef.current.write(data);
        if (wasAtBottom) {
          terminalRef.current.scrollToBottom();
        }
      }
    },
    clear: () => terminalRef.current?.clear(),
    focus: () => terminalRef.current?.focus(),
    fit: () => fitAddonRef.current?.fit(),
    getTerminal: () => terminalRef.current,
    scrollToBottom: () => {
      terminalRef.current?.scrollToBottom();
      setShowScrollButton(false);
    },
    isAtBottom: () => {
      if (!terminalRef.current) return true;
      const buffer = terminalRef.current.buffer.active;
      return buffer.viewportY >= buffer.baseY;
    },
  }));

  // Store scroll handler ref for cleanup and font size updates
  const scrollHandlerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      theme: defaultTheme,
      scrollback: 5000,
      convertEol: true,
      disableStdin: true,
      allowProposedApi: true,
      scrollSensitivity: 0, // Disable xterm's scroll handling - we manage it
      smoothScrollDuration: 0,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    try {
      terminal.open(containerRef.current);
      fitAddon.fit();
    } catch (error) {
      console.warn('Terminal open warning (usually safe to ignore):', error);
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Initialize custom scroll handler
    const scrollHandler = new TerminalScrollHandler(
      containerRef.current,
      terminal,
      fontSize
    );
    scrollHandlerRef.current = scrollHandler;

    // Track scroll position to show/hide scroll button and for auto-scroll
    terminal.onScroll(() => {
      const buffer = terminal.buffer.active;
      const isAtBottom = buffer.viewportY >= buffer.baseY;
      isAtBottomRef.current = isAtBottom;
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
          // Update cell height after resize
          scrollHandlerRef.current?.updateCellHeight();
          if (onResize && terminalRef.current) {
            onResize(terminalRef.current.cols, terminalRef.current.rows);
          }
        }
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      scrollHandlerRef.current?.destroy();
      scrollHandlerRef.current = null;
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
      scrollHandlerRef.current?.setFontSize(fontSize);
    }
  }, [fontSize]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden"
        style={{ backgroundColor: defaultTheme.background, touchAction: 'none' }}
      />

      {/* Floating scroll-to-bottom button */}
      {showScrollButton && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
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
