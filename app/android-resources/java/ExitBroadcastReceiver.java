package {{PACKAGE_NAME}};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class ExitBroadcastReceiver extends BroadcastReceiver {
    private static final String TAG = "ExitBroadcastReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Exit broadcast received");

        // Stop the foreground service
        Intent serviceIntent = new Intent(context, WebSocketService.class);
        context.stopService(serviceIntent);

        // Exit the app by killing the process
        android.os.Process.killProcess(android.os.Process.myPid());
    }
}
