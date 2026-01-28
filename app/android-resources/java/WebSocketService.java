package {{PACKAGE_NAME}};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service to keep the WebSocket connection alive when app is backgrounded.
 * Shows a persistent notification while connected to the relay server.
 */
public class WebSocketService extends Service {
    private static final String TAG = "WebSocketService";
    private static final String CHANNEL_ID = "websocket_channel";
    private static final int NOTIFICATION_ID = 1;

    private static boolean isRunning = false;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Service created");
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Service started");

        // Create the notification
        Notification notification = createNotification();

        // Start as foreground service
        startForeground(NOTIFICATION_ID, notification);
        isRunning = true;

        // If killed, restart
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "Service destroyed");
        isRunning = false;
    }

    @Override
    public IBinder onBind(Intent intent) {
        // Not binding
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "WebSocket Connection",
                NotificationManager.IMPORTANCE_LOW // Low to avoid sound/vibration
            );
            channel.setDescription("Keeps connection to Claude relay active");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createNotification() {
        // Intent to open the app when notification is tapped
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            pendingIntentFlags
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Claude Pocket")
            .setContentText("Connected to relay")
            .setSmallIcon(R.drawable.ic_stat_code)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    public static boolean isServiceRunning() {
        return isRunning;
    }
}
