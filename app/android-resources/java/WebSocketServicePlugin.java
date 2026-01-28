package {{PACKAGE_NAME}};

import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin to control the WebSocket foreground service from JavaScript.
 * This allows the app to keep the WebSocket connection alive when backgrounded.
 */
@CapacitorPlugin(name = "WebSocketService")
public class WebSocketServicePlugin extends Plugin {
    private static final String TAG = "WebSocketServicePlugin";

    @PluginMethod
    public void start(PluginCall call) {
        Log.d(TAG, "Starting foreground service");
        try {
            Intent serviceIntent = new Intent(getContext(), WebSocketService.class);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start service", e);
            call.reject("Failed to start service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Log.d(TAG, "Stopping foreground service");
        try {
            Intent serviceIntent = new Intent(getContext(), WebSocketService.class);
            getContext().stopService(serviceIntent);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop service", e);
            call.reject("Failed to stop service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", WebSocketService.isServiceRunning());
        call.resolve(result);
    }
}
