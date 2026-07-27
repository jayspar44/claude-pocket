/**
 * The Android foreground service that keeps the process alive while the app is
 * backgrounded and sockets are open. One flag guards it, and the flag records
 * INTENT rather than native completion.
 *
 * That distinction is the whole point. Clearing it only once stop() resolves
 * leaves it true while the native stop is in flight, so a connection that
 * reaches CONNECTED in that window skips start(); the stop then resolves and
 * clears the flag under a live socket, and the app holds an open WebSocket with
 * no foreground service - which is when Android kills the WebView.
 *
 * Takes the plugin as an argument so it can be driven without Capacitor: null
 * (web, where there is no service) is a no-op.
 */
export function createForegroundService(plugin) {
  let running = false;

  return {
    start() {
      if (!plugin || running) return;
      running = true;
      plugin.start().catch((err) => {
        running = false;
        console.warn('[ForegroundService] Failed to start:', err);
      });
    },

    stop() {
      if (!plugin || !running) return;
      running = false;
      plugin.stop().catch((err) => {
        console.warn('[ForegroundService] Failed to stop:', err);
      });
    },

    // For assertions only; nothing in the app branches on this.
    isRunning() {
      return running;
    },
  };
}
