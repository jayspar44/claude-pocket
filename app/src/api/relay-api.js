import axios from 'axios';

const DEFAULT_RELAY_URL = 'http://localhost:4501';

function getRelayBaseUrl() {
  const stored = localStorage.getItem('relayUrl');
  if (stored) {
    // Convert ws:// to http:// for REST API
    return stored.replace(/^ws:\/\//, 'http://').replace(/\/ws$/, '');
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

// Commands API
export const commandsApi = {
  list: () => relayApi.get('/api/commands'),
  get: (name) => relayApi.get(`/api/commands/${name}`),
};

// Files API
export const filesApi = {
  list: (path = '') => relayApi.get('/api/files', { params: { path } }),
  info: () => relayApi.get('/api/files/info'),
  upload: (file, path = '', filename) => {
    return relayApi.post('/api/files/upload', file, {
      params: { path, filename },
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
  },
};

// Health API
export const healthApi = {
  check: () => relayApi.get('/api/health'),
  ptyStatus: () => relayApi.get('/api/pty/status'),
  restartPty: () => relayApi.post('/api/pty/restart'),
  startPty: (workingDir) => relayApi.post('/api/pty/start', { workingDir }),
  stopPty: () => relayApi.post('/api/pty/stop'),
};

export default relayApi;
