package {{PACKAGE_NAME}};

import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom plugins before calling super.onCreate()
        registerPlugin(WebSocketServicePlugin.class);

        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();

        // Force-hide any ghost IME state from other apps and reapply window insets.
        // Fixes: when switching to this app from another app with keyboard open,
        // the WebView viewport height stays reduced as if keyboard is still showing.
        View decorView = getWindow().getDecorView();
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            WindowInsetsController controller = decorView.getWindowInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.ime());
            }
        }
        decorView.requestApplyInsets();
        decorView.requestLayout();
    }
}
