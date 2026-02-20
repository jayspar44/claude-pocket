import { useState, useCallback, useRef } from 'react';
import { X, FileUp, File, Trash2, Upload } from 'lucide-react';
import { filesApi } from '../../api/relay-api';

function MobileFilePicker({ isOpen, onClose, onSelect, instanceId }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File must be less than 10MB');
      return;
    }

    setError(null);
    setSelectedFile(file);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);

    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await selectedFile.arrayBuffer();

      const response = await filesApi.uploadFile(
        arrayBuffer,
        '', // Upload to working directory
        selectedFile.name,
        selectedFile.type || 'application/octet-stream',
        instanceId
      );

      onSelect(response.data.path);
      onClose();
      setSelectedFile(null);
    } catch (err) {
      setError('Failed to upload file');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  }, [selectedFile, onSelect, onClose, instanceId]);

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = useCallback(() => {
    handleClear();
    onClose();
  }, [handleClear, onClose]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg bg-gray-800 rounded-t-2xl max-h-[70vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <FileUp className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Upload File</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
          />

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {selectedFile ? (
            // Preview mode
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gray-700 rounded-lg">
                <div className="w-12 h-12 flex items-center justify-center bg-blue-600/20 rounded-lg">
                  <File className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{selectedFile.name}</p>
                  <p className="text-sm text-gray-400">{formatSize(selectedFile.size)}</p>
                </div>
                <button
                  onClick={handleClear}
                  className="p-2 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5 text-red-400" />
                </button>
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 rounded-lg text-white font-medium transition-colors"
              >
                {uploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span>Upload & Insert</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            // Selection mode
            <button
              onClick={openFilePicker}
              className="w-full flex flex-col items-center justify-center gap-4 p-8 bg-gray-700 hover:bg-gray-600 rounded-xl border-2 border-dashed border-gray-600 hover:border-blue-500 transition-colors"
            >
              <div className="w-16 h-16 flex items-center justify-center bg-blue-600/20 rounded-full">
                <FileUp className="w-8 h-8 text-blue-400" />
              </div>
              <div className="text-center">
                <p className="text-white font-medium">Choose a file</p>
                <p className="text-sm text-gray-400 mt-1">Upload any file (max 10MB)</p>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MobileFilePicker;
