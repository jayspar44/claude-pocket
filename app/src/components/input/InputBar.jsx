import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Send } from 'lucide-react';
import { useCommandHistory } from '../../hooks/useCommandHistory';

const InputBar = forwardRef(function InputBar({ onSend, onSendRaw, onStateChange, disabled = false, placeholder = 'Type a message...' }, ref) {
  const [value, setValue] = useState('');
  // 'idle' = normal, 'holding' = mid-press before raw-send threshold,
  // 'fired' = brief flash right after raw send. Drives the Send button color.
  const [pressVisual, setPressVisual] = useState('idle');
  const textareaRef = useRef(null);
  const holdTimerRef = useRef(null);
  const flashTimerRef = useRef(null);
  // Suppresses the pointerUp handler from also firing normal submit when the
  // long-press already fired raw send. Also set on cancel/leave.
  const rawFiredRef = useRef(false);
  const { addToHistory, navigateHistory } = useCommandHistory();

  // When ghost keyboard is detected (stale IME insets from another app),
  // focus the textarea to make the keyboard real instead of showing gray space.
  useEffect(() => {
    const handleGhostKeyboard = () => {
      textareaRef.current?.focus();
    };
    window.addEventListener('ghost-keyboard', handleGhostKeyboard);
    return () => window.removeEventListener('ghost-keyboard', handleGhostKeyboard);
  }, []);

  // Expose insertion API to parent components
  useImperativeHandle(ref, () => ({
    insertText: (text) => {
      setValue(prev => {
        const needsSpace = prev.length > 0 && !prev.endsWith(' ') && !prev.endsWith('\n');
        return prev + (needsSpace ? ' ' : '') + text;
      });
    },
    focus: () => textareaRef.current?.focus(),
    clear: () => setValue(''),
    getValue: () => value,
    setValueAndCaret: ({ newValue, newCaret }) => {
      setValue(newValue);
      // Defer caret update until after React renders the new value
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCaret;
          textareaRef.current.selectionEnd = newCaret;
          textareaRef.current.focus();
        }
      });
    },
  }), [value]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    addToHistory(trimmed);
    setValue('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend, addToHistory]);

  // Send raw — no Ctrl-U prefix, no Enter suffix. For Claude / agy Ink prompts
  // that capture a single keystroke (e.g. y/n in surveys, model picker arrows).
  const handleSendRawNow = useCallback(() => {
    // Note: do NOT trim — single chars like " " or a newline may be valid here.
    if (!value || disabled || !onSendRaw) return;
    onSendRaw(value);
    addToHistory(value);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    // Best-effort haptic ack so the user knows the long-press fired.
    try { window.navigator?.vibrate?.(40); } catch { /* noop */ }
  }, [value, disabled, onSendRaw, addToHistory]);

  // Send-button hold detection: short tap = normal submit, hold ≥500ms = raw send.
  const handleSendPointerDown = useCallback(() => {
    if (disabled || !value.trim()) return;
    rawFiredRef.current = false;
    setPressVisual('holding');
    holdTimerRef.current = setTimeout(() => {
      if (onSendRaw) {
        rawFiredRef.current = true;
        handleSendRawNow();
        setPressVisual('fired');
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setPressVisual('idle'), 300);
      } else {
        // No raw-send wired up — revert visual so the tap-up handler still works.
        setPressVisual('idle');
      }
    }, 500);
  }, [disabled, value, onSendRaw, handleSendRawNow]);

  const handleSendPointerUp = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!rawFiredRef.current) {
      handleSubmit();
      setPressVisual('idle');
    }
  }, [handleSubmit]);

  const handleSendPointerCancel = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setPressVisual('idle');
    // Suppress the subsequent pointerUp from firing a stray submit.
    rawFiredRef.current = true;
  }, []);

  // Clear any pending timers on unmount
  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  const handleKeyDown = useCallback((e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Navigate history with arrow keys when at the start/end
    if (e.key === 'ArrowUp') {
      const textarea = textareaRef.current;
      const isAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
      if (isAtStart || value === '') {
        const historyValue = navigateHistory('up');
        if (historyValue !== null) {
          e.preventDefault();
          setValue(historyValue);
        }
      }
    }

    if (e.key === 'ArrowDown') {
      const textarea = textareaRef.current;
      const isAtEnd = textarea.selectionStart === value.length && textarea.selectionEnd === value.length;
      if (isAtEnd) {
        const historyValue = navigateHistory('down');
        if (historyValue !== null) {
          e.preventDefault();
          setValue(historyValue);
        }
      }
    }
  }, [handleSubmit, navigateHistory, value]);

  const handleInput = useCallback((e) => {
    const newValue = e.target.value;
    setValue(newValue);
    onStateChange?.({ value: newValue, caret: e.target.selectionStart });

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }, [onStateChange]);

  const reportCaret = useCallback(() => {
    if (textareaRef.current) {
      onStateChange?.({ value, caret: textareaRef.current.selectionStart });
    }
  }, [value, onStateChange]);

  return (
    <div className="flex items-end gap-2 px-3 pt-3 pb-3 bg-gray-800 border-t border-gray-700 safe-area-bottom">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onSelect={reportCaret}
        onClick={reportCaret}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="flex-1 px-3 py-2 text-sm text-white bg-gray-700 border border-gray-600 rounded-lg resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ minHeight: '40px', maxHeight: '120px' }}
        autoCapitalize="off"
        autoCorrect="on"
        spellCheck="true"
      />
      <button
        onPointerDown={handleSendPointerDown}
        onPointerUp={handleSendPointerUp}
        onPointerLeave={handleSendPointerCancel}
        onPointerCancel={handleSendPointerCancel}
        disabled={disabled || !value.trim()}
        className={
          'flex items-center justify-center w-10 h-10 text-white rounded-lg focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation select-none [-webkit-touch-callout:none] ' +
          (pressVisual === 'fired'
            ? 'bg-green-500 ring-2 ring-green-300'
            : pressVisual === 'holding'
              ? 'bg-purple-600 ring-2 ring-purple-300'
              : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500')
        }
        aria-label={onSendRaw ? 'Send (hold for raw, no Enter)' : 'Send message'}
      >
        <Send className="w-5 h-5" />
      </button>
    </div>
  );
});

export default InputBar;
