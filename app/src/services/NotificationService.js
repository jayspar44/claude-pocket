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
    this.debugLog = []; // In-memory log for debugging
    this.maxLogEntries = 50;
    this.lastNotificationTime = 0; // Debounce duplicate notifications
    this.lastNotificationType = null;
  }

  // Add entry to debug log
  log(message, data = {}) {
    const entry = {
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      message,
      ...data,
    };
    this.debugLog.unshift(entry); // Add to front
    if (this.debugLog.length > this.maxLogEntries) {
      this.debugLog.pop(); // Remove oldest
    }
    console.info('[NotificationService]', message, data);
  }

  // Get debug log for UI display
  getDebugLog() {
    return [...this.debugLog];
  }

  // Clear debug log
  clearDebugLog() {
    this.debugLog = [];
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
    console.log('[NotificationService] notify() called:', { title, body, type, instanceId });
    console.log('[NotificationService] Current state:', {
      initialized: this.initialized,
      settings: this.settings,
      isNative: Capacitor.isNativePlatform(),
      hasLocalNotifications: !!this.LocalNotifications,
      hasSwRegistration: !!this.swRegistration,
      notificationPermission: 'Notification' in window ? Notification.permission : 'N/A',
    });

    if (!this.settings.enabled) {
      console.log('[NotificationService] Blocked: notifications disabled in settings');
      return { sent: false, reason: 'disabled' };
    }

    // Check type-specific settings
    if (type === 'input-needed' && !this.settings.inputNeeded) {
      console.log('[NotificationService] Blocked: inputNeeded notifications disabled');
      return { sent: false, reason: 'type-disabled' };
    }
    if (type === 'task-complete' && !this.settings.taskComplete) {
      console.log('[NotificationService] Blocked: taskComplete notifications disabled');
      return { sent: false, reason: 'type-disabled' };
    }

    // Debounce: prevent duplicate notifications within 2 seconds
    // input-needed takes priority over task-complete
    const now = Date.now();
    const timeSinceLastNotification = now - this.lastNotificationTime;
    if (timeSinceLastNotification < 2000) {
      // Within debounce window
      if (type === 'task-complete' && this.lastNotificationType === 'input-needed') {
        // Skip task-complete if we just sent input-needed
        console.log('[NotificationService] Blocked: input-needed notification was just sent');
        return { sent: false, reason: 'debounced-priority' };
      }
      if (type === 'task-complete' && this.lastNotificationType === 'task-complete') {
        // Skip duplicate task-complete
        console.log('[NotificationService] Blocked: duplicate task-complete within debounce window');
        return { sent: false, reason: 'debounced-duplicate' };
      }
      // input-needed can always go through (and will suppress subsequent task-complete)
    }

    // Don't notify if app is in foreground (DISABLED FOR TESTING)
    // if (document.visibilityState === 'visible') return;

    await this.init();
    console.log('[NotificationService] After init:', {
      initialized: this.initialized,
      hasSwRegistration: !!this.swRegistration,
      swActive: !!this.swRegistration?.active,
    });

    const tag = `claude-pocket-${type}-${instanceId || 'default'}`;
    const data = { instanceId, type };

    // Track notification for debouncing
    this.lastNotificationTime = Date.now();
    this.lastNotificationType = type;

    if (Capacitor.isNativePlatform() && this.LocalNotifications) {
      // Native notification via Capacitor
      console.log('[NotificationService] Sending via Capacitor LocalNotifications');
      await this.LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now() % 2147483647,
            title,
            body,
            extra: data,
            sound: 'default',
            smallIcon: 'ic_notification',
          },
        ],
      });
      return { sent: true, method: 'capacitor' };
    } else if (this.swRegistration?.active) {
      // Service Worker notification (works in background on mobile Chrome)
      console.log('[NotificationService] Sending via Service Worker postMessage');
      this.swRegistration.active.postMessage({
        type: 'SHOW_NOTIFICATION',
        payload: { title, body, tag, data },
      });
      return { sent: true, method: 'service-worker' };
    } else if ('Notification' in window && Notification.permission === 'granted') {
      // Basic web notification fallback
      console.log('[NotificationService] Sending via basic Notification API');
      new Notification(title, { body, tag, data });
      return { sent: true, method: 'basic-api' };
    } else {
      console.log('[NotificationService] No notification method available');
      return { sent: false, reason: 'no-method' };
    }
  }

  async notifyInputNeeded({ instanceId, optionCount }) {
    // Always use sensible title - triggerPhrase was unreliable (often "?" or garbage)
    const title = 'Claude needs input';
    const body = optionCount > 0
      ? `Select from ${optionCount} option${optionCount > 1 ? 's' : ''}`
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
