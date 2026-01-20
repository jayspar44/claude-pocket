import { useState, useRef, useCallback } from 'react';
import { Send } from 'lucide-react';
import { useCommandHistory } from '../../hooks/useCommandHistory';

function InputBar({ onSend, disabled = false, placeholder = 'Type a message...' }) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);
  const { addToHistory, navigateHistory } = useCommandHistory();

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
    setValue(e.target.value);

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }, []);

  return (
    <div className="flex items-end gap-2 p-3 bg-gray-800 border-t border-gray-700 safe-area-bottom">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
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
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="flex items-center justify-center w-10 h-10 text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Send message"
      >
        <Send className="w-5 h-5" />
      </button>
    </div>
  );
}

export default InputBar;
