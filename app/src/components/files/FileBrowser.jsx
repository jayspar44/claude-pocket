import { useState, useEffect, useCallback } from 'react';
import { X, Folder, File, ChevronLeft, Home } from 'lucide-react';
import { filesApi } from '../../api/relay-api';

function FileBrowser({ isOpen, onClose, onSelect }) {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState([]);
  const [workingDir, setWorkingDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch working directory info on mount
  useEffect(() => {
    if (!isOpen) return;

    filesApi.info()
      .then((response) => {
        setWorkingDir(response.data.workingDir);
      })
      .catch(console.error);
  }, [isOpen]);

  // Fetch files when path changes
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    filesApi.list(currentPath)
      .then((response) => {
        setItems(response.data.items || []);
      })
      .catch((err) => {
        setError('Failed to load files');
        console.error('Failed to load files:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, currentPath]);

  const handleNavigate = useCallback((item) => {
    if (item.type === 'directory') {
      setCurrentPath((prev) => {
        return prev ? `${prev}/${item.name}` : item.name;
      });
    } else {
      // File selected
      const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
      onSelect(fullPath);
      onClose();
    }
  }, [currentPath, onSelect, onClose]);

  const handleGoUp = useCallback(() => {
    setCurrentPath((prev) => {
      const parts = prev.split('/').filter(Boolean);
      parts.pop();
      return parts.join('/');
    });
  }, []);

  const handleGoHome = useCallback(() => {
    setCurrentPath('');
  }, []);

  const formatSize = (bytes) => {
    if (bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-gray-800 rounded-t-2xl max-h-[70vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Files</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2 p-2 border-b border-gray-700 bg-gray-850">
          <button
            onClick={handleGoHome}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            title="Go to root"
          >
            <Home className="w-4 h-4" />
          </button>
          {currentPath && (
            <button
              onClick={handleGoUp}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              title="Go up"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 text-sm text-gray-400 truncate">
            {workingDir}{currentPath ? `/${currentPath}` : ''}
          </div>
        </div>

        {/* Files list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-400">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No files in this directory
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => (
                <button
                  key={item.name}
                  onClick={() => handleNavigate(item)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700 transition-colors text-left"
                >
                  {item.type === 'directory' ? (
                    <Folder className="w-5 h-5 text-blue-400" />
                  ) : (
                    <File className="w-5 h-5 text-gray-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white truncate">{item.name}</p>
                  </div>
                  {item.size !== null && (
                    <span className="text-xs text-gray-500">
                      {formatSize(item.size)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FileBrowser;
