import { useState, useCallback, useRef } from 'react';
import { X, Camera, Image, Upload, Trash2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { filesApi } from '../../api/relay-api';

function ImagePicker({ isOpen, onClose, onUpload }) {
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return;
    }

    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = () => {
      setPreview({
        data: reader.result,
        file,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!preview?.file) return;

    setUploading(true);
    setError(null);

    try {
      // Use base64 encoding for more reliable upload over unstable connections
      const base64Data = preview.data.split(',')[1]; // Remove data:image/...;base64, prefix
      console.log('[ImagePicker] Starting upload:', {
        filename: preview.name,
        type: preview.file.type,
        base64Length: base64Data?.length,
      });

      const response = await filesApi.uploadBase64(
        base64Data,
        preview.name,
        preview.file.type
      );

      console.log('[ImagePicker] Upload success:', response.data);
      onUpload(response.data.path);
      onClose();
      setPreview(null);
    } catch (err) {
      console.error('[ImagePicker] Upload error:', err.message, err.response?.data);
      setError('Failed to upload image');
    } finally {
      setUploading(false);
    }
  }, [preview, onUpload, onClose]);

  const handleClear = useCallback(() => {
    setPreview(null);
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg bg-gray-800 rounded-t-2xl max-h-[70vh] flex flex-col animate-slide-up safe-area-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Add Image</h2>
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
            accept="image/*"
            capture={Capacitor.isNativePlatform() ? 'environment' : undefined}
            onChange={handleFileSelect}
            className="hidden"
          />

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {preview ? (
            // Preview mode
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden bg-gray-900">
                <img
                  src={preview.data}
                  alt="Preview"
                  className="w-full max-h-60 object-contain"
                />
                <button
                  onClick={handleClear}
                  className="absolute top-2 right-2 p-2 bg-gray-800/80 hover:bg-gray-700 rounded-full transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
              <p className="text-sm text-gray-400 truncate">{preview.name}</p>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-600/50 rounded-lg text-white font-medium transition-colors"
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
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={openFilePicker}
                className="flex flex-col items-center justify-center gap-3 p-6 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-cyan-600/20 rounded-full">
                  <Camera className="w-6 h-6 text-cyan-400" />
                </div>
                <span className="text-white font-medium">Take Photo</span>
              </button>

              <button
                onClick={openFilePicker}
                className="flex flex-col items-center justify-center gap-3 p-6 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-blue-600/20 rounded-full">
                  <Image className="w-6 h-6 text-blue-400" />
                </div>
                <span className="text-white font-medium">Choose File</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImagePicker;
