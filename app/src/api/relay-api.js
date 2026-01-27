import axios from 'axios';
import { storage } from '../utils/storage';

const DEFAULT_RELAY_URL = 'http://localhost:4501';

function getRelayBaseUrl() {
  // Check port-prefixed storage first
  const stored = storage.get('relayUrl');
  if (stored) {
    // Convert ws:// to http:// for REST API
    return stored.replace(/^ws:\/\//, 'http://').replace(/\/ws$/, '');
  }

  const host = import.meta.env.VITE_RELAY_HOST || 'minibox.rattlesnake-mimosa.ts.net';
  const devRelayPort = import.meta.env.VITE_DEV_RELAY_PORT || '4503';
  const prodRelayPort = import.meta.env.VITE_PROD_RELAY_PORT || '4501';

  // For native apps (Capacitor), use VITE_APP_ENV set at build time
  const appEnv = import.meta.env.VITE_APP_ENV;
  if (appEnv === 'dev') return `http://${host}:${devRelayPort}`;
  if (appEnv === 'prod') return `http://${host}:${prodRelayPort}`;

  // For web, detect from port
  if (typeof window !== 'undefined' && window.location.port) {
    const appPort = window.location.port;
    const webHost = window.location.hostname;
    const devAppPort = import.meta.env.VITE_DEV_APP_PORT || '4502';
    if (appPort === devAppPort) return `http://${webHost}:${devRelayPort}`;
    return `http://${webHost}:${prodRelayPort}`;
  }

  return import.meta.env.VITE_RELAY_API_URL || DEFAULT_RELAY_URL;
}

const relayApi = axios.create({
  timeout: 10000,
});

// Request interceptor to set base URL dynamically
relayApi.interceptors.request.use((config) => {
  config.baseURL = getRelayBaseUrl();
  return config;
});

// Commands API - 30s timeout for slow networks
export const commandsApi = {
  list: () => relayApi.get('/api/commands', { timeout: 30000 }),
  get: (name) => relayApi.get(`/api/commands/${name}`, { timeout: 30000 }),
};

// Files API - 60s timeout for uploads
export const filesApi = {
  list: (path = '') => relayApi.get('/api/files', { params: { path } }),
  info: () => relayApi.get('/api/files/info'),
  upload: (file, path = '', filename) => {
    return relayApi.post('/api/files/upload', file, {
      params: { path, filename },
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      timeout: 60000,
    });
  },
  // Upload any file type with explicit content type
  uploadFile: (data, path = '', filename, contentType = 'application/octet-stream') => {
    return relayApi.post('/api/files/upload', data, {
      params: { path, filename },
      headers: { 'Content-Type': contentType },
      timeout: 60000,
    });
  },
  // Clean up .claude-pocket directory (uploads, temp files)
  cleanup: () => relayApi.delete('/api/files/cleanup'),
  // Upload file as base64 (more reliable over unstable connections)
  uploadBase64: (base64Data, filename, contentType) => {
    return relayApi.post('/api/files/upload-base64', {
      data: base64Data,
      filename,
      contentType,
    }, { timeout: 60000 });
  },
};

// Health API
export const healthApi = {
  check: () => relayApi.get('/api/health'),
  ptyStatus: (instanceId) => relayApi.get('/api/pty/status', { params: { instanceId } }),
  restartPty: (workingDir, instanceId) => relayApi.post('/api/pty/restart', { workingDir, instanceId }),
  startPty: (workingDir, instanceId) => relayApi.post('/api/pty/start', { workingDir, instanceId }),
  stopPty: (instanceId, clearBuffer = true) => relayApi.post('/api/pty/stop', { instanceId, clearBuffer }),
};

// Instances API - Multi-PTY support
export const instancesApi = {
  // List all instances on the relay
  list: () => relayApi.get('/api/instances'),

  // Create or get an instance (optionally auto-start)
  create: (instanceId, workingDir, autoStart = false) =>
    relayApi.post('/api/instances', { instanceId, workingDir, autoStart }),

  // Get specific instance status
  get: (instanceId) => relayApi.get(`/api/instances/${instanceId}`),

  // Delete an instance
  delete: (instanceId) => relayApi.delete(`/api/instances/${instanceId}`),

  // Stop and delete all instances
  deleteAll: () => relayApi.delete('/api/instances'),
};

export default relayApi;
