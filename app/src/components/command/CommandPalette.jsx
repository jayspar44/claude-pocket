import { useState, useCallback, useMemo } from 'react';
import { X, Search, Terminal } from 'lucide-react';
import { useCommands } from '../../hooks/useCommands';

const SOURCE_HEADINGS = {
  project: 'Project',
  user: 'User',
  plugin: 'Plugins',
  extension: 'Extensions',
  builtin: 'Built-in',
};

function badgeText(cmd) {
  if (cmd.source === 'plugin' || cmd.source === 'extension') {
    return cmd.sourceLabel ? `${cmd.source}: ${cmd.sourceLabel}` : cmd.source;
  }
  return cmd.source;
}

function CommandPalette({ isOpen, onClose, onSelect, activeInstanceId, cliType }) {
  const [search, setSearch] = useState('');
  const { commands, loading, error } = useCommands(activeInstanceId, cliType, { enabled: isOpen });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  }, [commands, search]);

  const grouped = useMemo(() => {
    const out = { project: [], user: [], plugin: [], extension: [], builtin: [] };
    for (const c of filtered) {
      if (out[c.source]) out[c.source].push(c);
    }
    return out;
  }, [filtered]);

  const handleSelect = useCallback((command) => {
    onSelect(command);
    setSearch('');
  }, [onSelect]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const hasNoResults = filtered.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-lg bg-gray-800 rounded-t-2xl max-h-[70vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold text-purple-400">/</span>
            <h2 className="text-sm font-semibold text-white">Commands</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search commands..."
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {hasNoResults && !loading ? (
            <div className="text-center py-8 text-gray-400">
              {search ? 'No commands found' : (error || 'No commands available')}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([source, list]) => (
                list.length > 0 && (
                  <div key={source}>
                    <h3 className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {SOURCE_HEADINGS[source]}
                    </h3>
                    <div className="space-y-1 mt-1">
                      {list.map((command) => (
                        <button
                          key={`${source}-${command.name}`}
                          onClick={() => handleSelect(command)}
                          className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-700 transition-colors text-left"
                        >
                          <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gray-600/30 rounded-lg">
                            <Terminal className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-white font-medium">/{command.name}</p>
                              {command.argumentHint && (
                                <span className="text-xs text-gray-500">{command.argumentHint}</span>
                              )}
                              <span className="ml-auto text-[10px] text-gray-500 px-1.5 py-0.5 bg-gray-700 rounded">
                                {badgeText(command)}
                              </span>
                            </div>
                            {command.description && (
                              <p className="text-sm text-gray-400 truncate">{command.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ))}
              {loading && (
                <div className="flex items-center justify-center py-2">
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
