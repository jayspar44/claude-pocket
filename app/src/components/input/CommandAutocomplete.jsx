import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useCommands } from '../../hooks/useCommands';

// Find the slash token under the caret. Returns { start, query } or null.
function findSlashToken(value, caret) {
  // Walk left from caret to find a '/' at start-of-line / after whitespace
  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === '/') {
      const prev = i > 0 ? value[i - 1] : '\n';
      if (prev === '\n' || prev === ' ' || prev === '\t' || i === 0) {
        // Make sure no whitespace between '/' and caret
        const tail = value.slice(i + 1, caret);
        if (/\s/.test(tail)) return null;
        return { start: i, query: tail };
      }
      return null;
    }
    if (ch === '\n' || ch === ' ' || ch === '\t') return null;
    i--;
  }
  return null;
}

export default function CommandAutocomplete({
  value,
  caret,
  activeInstanceId,
  cliType,
  onInsert,
  disabled = false,
}) {
  const token = useMemo(() => (disabled ? null : findSlashToken(value, caret)), [value, caret, disabled]);
  const isOpen = token !== null;

  const { commands } = useCommands(activeInstanceId, cliType, { enabled: isOpen });
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    if (!isOpen) return [];
    const q = token.query.toLowerCase();
    if (!q) return commands.slice(0, 50);
    return commands.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [isOpen, token, commands]);

  useEffect(() => { setHighlight(0); }, [token?.query]);

  const insert = useCallback((cmd) => {
    if (!token) return;
    const before = value.slice(0, token.start);
    const after = value.slice(caret);
    onInsert({
      newValue: `${before}/${cmd.name} ${after}`,
      newCaret: token.start + cmd.name.length + 2, // '/' + name + ' '
    });
  }, [token, value, caret, onInsert]);

  // Listen for keys on document while open so arrow keys navigate even while textarea has focus
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        if (filtered[highlight]) {
          e.preventDefault();
          insert(filtered[highlight]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Best-effort dismiss: clear by inserting current value untouched is no-op; rely on onInsert no-op
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen, filtered, highlight, insert]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <div className="px-3 pb-1">
      <div
        ref={listRef}
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-700"
      >
        {filtered.map((cmd, idx) => (
          <button
            key={`${cmd.source}-${cmd.name}`}
            onClick={() => insert(cmd)}
            onMouseEnter={() => setHighlight(idx)}
            className={
              'w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm ' +
              (idx === highlight ? 'bg-gray-700' : 'hover:bg-gray-700/60')
            }
          >
            <span className="text-white">/{cmd.name}</span>
            {cmd.argumentHint && <span className="text-xs text-gray-500">{cmd.argumentHint}</span>}
            <span className="ml-2 text-gray-400 text-xs truncate flex-1">{cmd.description}</span>
            <span className="text-[10px] text-gray-500 px-1.5 py-0.5 bg-gray-700/80 rounded">
              {cmd.source === 'plugin' || cmd.source === 'extension'
                ? `${cmd.source}: ${cmd.sourceLabel || ''}`
                : cmd.source}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
