import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SafeArea } from '@capacitor-community/safe-area';
import './index.css';
import App from './App.jsx';
import { logger } from './utils/logger';

// Global error handlers
window.onerror = function (msg, url, line, col, error) {
  logger.error('Uncaught error:', { msg, url, line, col, error });
  return false;
};
window.addEventListener('unhandledrejection', function (event) {
  logger.error('Unhandled rejection:', event.reason);
});

// Register Service Worker for web notifications (PWA)
if ('serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        logger.info('Service Worker registered:', registration.scope);

        // Handle updates
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New SW available, trigger update
                logger.info('New Service Worker available');
                installingWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            };
          }
        };
      })
      .catch((error) => {
        logger.error('Service Worker registration failed:', error);
      });

    // Listen for SW messages (e.g., notification clicks)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'sw-switch-instance') {
        // Dispatch custom event for InstanceContext to handle
        window.dispatchEvent(new CustomEvent('sw-switch-instance', {
          detail: {
            instanceId: event.data.instanceId,
            notificationType: event.data.notificationType,
          },
        }));
      }
    });
  });
}

// Configure status bar for native platforms
if (Capacitor.isNativePlatform()) {
  // Initialize safe area plugin
  SafeArea.enable().catch(() => {
    // Not implemented on all Android versions
  });

  // Configure status bar for dark theme
  StatusBar.setOverlaysWebView({ overlay: true });
  StatusBar.setStyle({ style: Style.Dark }); // light icons on dark background
  StatusBar.setBackgroundColor({ color: '#1f2937' }); // gray-800
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
