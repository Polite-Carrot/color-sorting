package com.politecarrot.colorjars;

import android.os.Build;
import android.os.Bundle;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Samsung's One UI WebView ignores CSS user-select: none and web-side
 * preventDefault on selectstart when a <button> is long-pressed, so the
 * OS-level text selection UI still fires and paints the button blue.
 * Android 15+ (API 35+) also forces the app into edge-to-edge mode, drawing
 * the WebView under the status and nav bars, so env(safe-area-inset-*) from
 * JS reads zero. These native overrides fix both at the only layer that
 * actually respects them.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        // ── 1. Kill Samsung's long-press text selection ──────────────────
        webView.setLongClickable(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setOnLongClickListener(v -> true);
        webView.setOnCreateContextMenuListener((menu, v, info) -> menu.clear());

        // ── 2. Apply system-bar padding ONLY on Android 15+ ──────────────
        // On Android 14 and below the default theme already reserves status
        // and nav bar space at the decor level, so a WebView-side inset
        // listener would double-pad and leave a black strip below the app
        // (which is what the Samsung A55 was showing). Android 15+ (API 35+)
        // mandates edge-to-edge and the listener is the only way to reclaim
        // that space, so scope the padding to that runtime.
        if (Build.VERSION.SDK_INT >= 35) {
            ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
        }
    }

    /**
     * Second layer of defense against the copy/paste ActionMode floating
     * menu that some WebView builds raise on double-tap even when
     * long-press is disabled.
     */
    @Override
    public ActionMode onWindowStartingActionMode(ActionMode.Callback callback, int type) {
        if (type == ActionMode.TYPE_FLOATING) return null;
        return super.onWindowStartingActionMode(callback, type);
    }

    @Override
    public ActionMode onWindowStartingActionMode(ActionMode.Callback callback) {
        return null;
    }
}
