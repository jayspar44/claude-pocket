// Service Worker for Claude Pocket
// Handles push notifications and notification click events
/* global clients */

const CACHE_VERSION = 'v1';

// Handle notification click - focus app and switch to correct instance
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { instanceId, type } = event.notification.data || {};

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          // Send message to switch instance if needed
          if (instanceId) {
            client.postMessage({
              type: 'sw-switch-instance',
              instanceId,
              notificationType: type,
            });
          }
          return client.focus();
        }
      }

      // No existing window, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Handle messages from the app to show notifications
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, data } = event.data.payload;

    self.registration.showNotification(title, {
      body,
      tag: tag || 'claude-pocket',
      icon: '/icon-192.png',
      badge: '/icon-72.png',
      data,
      vibrate: [200, 100, 200],
      requireInteraction: false,
      silent: false,
    });
  }

  // Handle skip waiting request
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Install event - cache essential assets
self.addEventListener('install', (_event) => {
  console.log('[SW] Installing service worker');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    Promise.all([
      // Take control of all clients immediately
      clients.claim(),
      // Clean up old caches if version changes
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_VERSION)
            .map((name) => caches.delete(name))
        );
      }),
    ])
  );
});

// Fetch event - network first strategy (no caching for now)
self.addEventListener('fetch', (_event) => {
  // Let all requests pass through to network
  // We're not implementing offline support yet
});
