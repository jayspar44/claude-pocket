import { Capacitor } from '@capacitor/core';
import { storage } from '../utils/storage';

// Settings key (will be prefixed with port by storage utility)
const SETTINGS_KEY = 'notifications';

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  inputNeeded: true,
  taskComplete: true,
};

class NotificationService {
  constructor() {
    this.LocalNotifications = null;
    this.swRegistration = null;
    this.initialized = false;
    this.settings = this.loadSettings();
  }

  loadSettings() {
    try {
      const stored = storage.get(SETTINGS_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('[NotificationService] Failed to load settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    storage.set(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  getSettings() {
    return { ...this.settings };
  }

  async init() {
    if (this.initialized) return;

    // Native platform - use Capacitor LocalNotifications
    if (Capacitor.isNativePlatform()) {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        this.LocalNotifications = LocalNotifications;

        // Request permission
        const permResult = await LocalNotifications.requestPermissions();
        if (permResult.display !== 'granted') {
          console.warn('[NotificationService] Permission not granted');
        }

        this.initialized = true;
        console.log('[NotificationService] Initialized on native platform');
      } catch (e) {
        console.warn('[NotificationService] Local notifications not available:', e.message);
      }
    } else {
      // Web platform - use Service Worker notifications
      if ('serviceWorker' in navigator && 'Notification' in window) {
        try {
          // Request notification permission
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            console.warn('[NotificationService] Web notification permission denied');
            return;
          }

          // Get SW registration
          this.swRegistration = await navigator.serviceWorker.ready;
          this.initialized = true;
          console.log('[NotificationService] Initialized with Service Worker notifications');
        } catch (e) {
          console.warn('[NotificationService] Service Worker notifications not available:', e.message);

          // Fallback to basic Notification API
          if ('Notification' in window && Notification.permission === 'granted') {
            this.initialized = true;
            console.log('[NotificationService] Initialized with basic Web Notifications');
          }
        }
      }
    }
  }

  async notify({ title, body, instanceId, type }) {
    if (!this.settings.enabled) return;

    // Check type-specific settings
    if (type === 'input-needed' && !this.settings.inputNeeded) return;
    if (type === 'task-complete' && !this.settings.taskComplete) return;

    // Don't notify if app is in foreground (DISABLED FOR TESTING)
    // if (document.visibilityState === 'visible') return;

    await this.init();

    const tag = `claude-pocket-${type}-${instanceId || 'default'}`;
    const data = { instanceId, type };

    if (Capacitor.isNativePlatform() && this.LocalNotifications) {
      // Native notification via Capacitor
      await this.LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now(),
            title,
            body,
            extra: data,
            sound: 'default',
            smallIcon: 'ic_notification',
          },
        ],
      });
    } else if (this.swRegistration) {
      // Service Worker notification (works in background on mobile Chrome)
      this.swRegistration.active?.postMessage({
        type: 'SHOW_NOTIFICATION',
        payload: { title, body, tag, data },
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      // Basic web notification fallback
      new Notification(title, { body, tag, data });
    }
  }

  async notifyInputNeeded({ instanceId, optionCount, triggerPhrase }) {
    const title = triggerPhrase || 'Claude needs input';
    const body = optionCount > 0
      ? `Select from ${optionCount} options`
      : 'Waiting for your response';

    await this.notify({
      title,
      body,
      instanceId,
      type: 'input-needed',
    });
  }

  async notifyTaskComplete({ instanceId, duration }) {
    const seconds = Math.round(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const durationStr = minutes > 0
      ? `${minutes}m ${seconds % 60}s`
      : `${seconds}s`;

    await this.notify({
      title: 'Task complete',
      body: `Finished in ${durationStr}`,
      instanceId,
      type: 'task-complete',
    });
  }

  // Check if notifications are supported
  isSupported() {
    if (Capacitor.isNativePlatform()) {
      return true;
    }
    return 'serviceWorker' in navigator && 'Notification' in window;
  }

  // Get current permission status
  async getPermissionStatus() {
    if (Capacitor.isNativePlatform() && this.LocalNotifications) {
      const result = await this.LocalNotifications.checkPermissions();
      return result.display;
    }
    if ('Notification' in window) {
      return Notification.permission;
    }
    return 'denied';
  }
}

// Singleton instance
export const notificationService = new NotificationService();

export default notificationService;
