import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Search, Terminal } from 'lucide-react';
import { commandsApi } from '../../api/relay-api';
import { SYSTEM_COMMANDS } from '../../constants/system-commands';

const CACHE_KEY = 'claude-pocket-repo-commands';

// Get cached commands from localStorage
function getCachedCommands() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

// Save commands to localStorage cache
function setCachedCommands(commands) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(commands));
  } catch {
    // Ignore storage errors
  }
}

// Fetch with retry logic (1 retry with 2s delay)
async function fetchWithRetry(retries = 1) {
  try {
    return await commandsApi.list();
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return fetchWithRetry(retries - 1);
    }
    throw err;
  }
}

function CommandPalette({ isOpen, onClose, onSelect }) {
  // Initialize repo commands from cache
  const [repoCommands, setRepoCommands] = useState(() => getCachedCommands());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch repo commands when opened
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    fetchWithRetry()
      .then((response) => {
        // Mark repo commands with type: 'repo'
        const commands = (response.data.commands || []).map(cmd => ({
          ...cmd,
          type: 'repo',
        }));
        setRepoCommands(commands);
        setCachedCommands(commands);
      })
      .catch((err) => {
        setError('Unable to load project commands');
        console.error('Failed to load commands:', err);
        // Keep using cached commands on error
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  // Filter commands based on search and group by type
  const { filteredSystemCommands, filteredRepoCommands } = useMemo(() => {
    const searchLower = search.trim().toLowerCase();

    const filterFn = (cmd) => {
      if (!searchLower) return true;
      return cmd.name.toLowerCase().includes(searchLower) ||
        (cmd.description && cmd.description.toLowerCase().includes(searchLower));
    };

    return {
      filteredSystemCommands: SYSTEM_COMMANDS.filter(filterFn),
      filteredRepoCommands: repoCommands.filter(filterFn),
    };
  }, [repoCommands, search]);

  const handleSelect = useCallback((command) => {
    // Pass command object to parent, let parent handle closing
    onSelect(command);
    setSearch('');
  }, [onSelect]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  const hasNoResults = filteredSystemCommands.length === 0 && filteredRepoCommands.length === 0;

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
          {hasNoResults ? (
            <div className="text-center py-8 text-gray-400">
              {search ? 'No commands found' : 'No commands available'}
            </div>
          ) : (
            <div className="space-y-4">
              {/* System Commands - always shown */}
              {filteredSystemCommands.length > 0 && (
                <div>
                  <h3 className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    System Commands
                  </h3>
                  <div className="space-y-1 mt-1">
                    {filteredSystemCommands.map((command) => (
                      <button
                        key={`system-${command.name}`}
                        onClick={() => handleSelect(command)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-700 transition-colors text-left"
                      >
                        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gray-600/30 rounded-lg">
                          <Terminal className="w-3.5 h-3.5 text-gray-400" />
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
                </div>
              )}

              {/* Project Commands - show loading, error, or commands */}
              <div>
                <h3 className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Project Commands
                </h3>
                {loading && filteredRepoCommands.length === 0 ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : error && filteredRepoCommands.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    {error}
                  </div>
                ) : filteredRepoCommands.length > 0 ? (
                  <div className="space-y-1 mt-1">
                    {filteredRepoCommands.map((command) => (
                      <button
                        key={`repo-${command.name}`}
                        onClick={() => handleSelect(command)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-700 transition-colors text-left"
                      >
                        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-purple-600/20 rounded-lg">
                          <span className="text-sm font-bold text-purple-400">/</span>
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
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    No project commands found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
