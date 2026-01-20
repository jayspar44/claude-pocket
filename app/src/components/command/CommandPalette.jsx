import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Search, Slash } from 'lucide-react';
import { commandsApi } from '../../api/relay-api';

function CommandPalette({ isOpen, onClose, onSelect }) {
  const [commands, setCommands] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch commands when opened
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    commandsApi.list()
      .then((response) => {
        setCommands(response.data.commands || []);
      })
      .catch((err) => {
        setError('Failed to load commands');
        console.error('Failed to load commands:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands;
    const searchLower = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(searchLower) ||
        (cmd.description && cmd.description.toLowerCase().includes(searchLower))
    );
  }, [commands, search]);

  const handleSelect = useCallback((command) => {
    onSelect(`/${command.name}`);
    onClose();
    setSearch('');
  }, [onSelect, onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

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
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Slash className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Commands</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
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

        {/* Commands list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-400">{error}</div>
          ) : filteredCommands.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              {search ? 'No commands found' : 'No commands available'}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCommands.map((command) => (
                <button
                  key={command.name}
                  onClick={() => handleSelect(command)}
                  className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-purple-600/20 rounded-lg">
                    <Slash className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium">/{command.name}</p>
                    {command.description && (
                      <p className="text-sm text-gray-400 truncate">
                        {command.description}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
