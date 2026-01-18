import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SafeArea } from '@capacitor-community/safe-area'
import './index.css'
import App from './App.jsx'
import { logger } from './utils/logger'
import { fetchBackendInfo } from './utils/appConfig'

// Fetch backend info early (before render) for version display
fetchBackendInfo().catch(() => {});

// Global error handlers (silent in production)
window.onerror = function (msg, url, line, col, error) {
  logger.error('Uncaught error:', { msg, url, line, col, error });
  return false;
};
window.addEventListener('unhandledrejection', function (event) {
  logger.error('Unhandled rejection:', event.reason);
});

// Configure status bar for native platforms
if (Capacitor.isNativePlatform()) {
  // Initialize safe area plugin (injects CSS variables for older Android WebView)
  SafeArea.enable().catch(() => {
    // Not implemented on all Android versions - CSS fallbacks will be used
  });

  // Configure status bar for edge-to-edge display
  StatusBar.setOverlaysWebView({ overlay: true });

  // Set initial status bar based on saved theme
  // Note: Style.Dark = light/white icons, Style.Light = dark/black icons
  const savedTheme = localStorage.getItem('app_pref_theme') || 'light';
  if (savedTheme === 'dark') {
    StatusBar.setStyle({ style: Style.Dark }); // light icons on dark background
    StatusBar.setBackgroundColor({ color: '#1e293b' }); // slate-800
  } else {
    StatusBar.setStyle({ style: Style.Light }); // dark icons on light background
    StatusBar.setBackgroundColor({ color: '#0ea5e9' }); // sky-500
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
