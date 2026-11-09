package net.cinemavault.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private View customFullscreenView = null;
    private BridgeWebChromeClient.CustomViewCallback customViewCallback = null;
    private boolean isPlayerLandscape = false;

    // Universal Mouse, Air Mouse & TV Remote Pointer Tracking
    private float lastPointerRawX = -1f;
    private float lastPointerRawY = -1f;
    private long lastHoverTimestamp = 0L;
    private long lastJsHoverNotifyTime = 0L;
    private boolean isMousePointerMode = false;

    // Air Mouse click jitter stabilization state
    private float mouseDownX = 0f;
    private float mouseDownY = 0f;
    private float mouseDownRawX = 0f;
    private float mouseDownRawY = 0f;
    private long mouseDownTime = 0L;
    private boolean mouseExceededSlop = false;
    private boolean isSynthesizingTouch = false;

    // Native In-App APK Updater state (works on Projectors & Android TV without any browser installed)
    private File pendingInstallApkFile = null;
    private boolean waitingForInstallPermission = false;
    private volatile boolean isDownloadingApk = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window.setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );
        window.getDecorView().setBackgroundColor(Color.parseColor("#07090E"));

        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false);
            insetsController.setAppearanceLightNavigationBars(false);
        }

        // Enforce exact safe-area padding on DecorView so top Header and BottomNav NEVER overlap status/navigation bars
        View decorView = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, insets) -> {
            if (isPlayerLandscape || customFullscreenView != null) {
                v.setPadding(0, 0, 0, 0);
                return WindowInsetsCompat.CONSUMED;
            }
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean kbVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            v.setPadding(
                bars.left,
                bars.top,
                bars.right,
                kbVisible ? Math.max(bars.bottom, ime.bottom) : bars.bottom
            );
            return WindowInsetsCompat.CONSUMED;
        });

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            webView.setBackgroundColor(Color.parseColor("#07090E"));

            // Enforce hardware acceleration on the WebView layer for 60 FPS on Smart TVs & Projectors
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

            // Enable focus & spatial navigation for Smart TV remotes, D-Pads and Air Mouse
            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            webView.requestFocus();

            // Enable 1st-party and 3rd-party cookies (Mandatory for HLS video balancers in iframes!)
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            settings.setNeedInitialFocus(true);
            settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setOffscreenPreRaster(true);
            // Trap popup ads via onCreateWindow so balancers never redirect main app
            settings.setSupportMultipleWindows(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);

            // Clean Chrome Mobile User-Agent (remove "; wv" & "Version/4.0 " which video CDNs block)
            String defaultUa = settings.getUserAgentString();
            if (defaultUa != null) {
                String cleanUa = defaultUa
                    .replace("; wv)", ")")
                    .replace("Version/4.0 ", "");
                settings.setUserAgentString(cleanUa);
            }

            // Expose native bridge to React for landscape fullscreen, simulated taps & back navigation
            webView.addJavascriptInterface(new CinemaJsBridge(), "AndroidCinemaBridge");

            // Subclass BridgeWebViewClient so iframe video players load inside the app instead of launching external Chrome
            webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    if (url == null) return false;
                    String scheme = url.getScheme() != null ? url.getScheme().toLowerCase() : "";

                    // Block non-web schemes (intent://, market://, tg://) from hijacking playback
                    if (!scheme.equals("http") && !scheme.equals("https") && !scheme.equals("blob") && !scheme.equals("data")) {
                        return true;
                    }

                    // Allow ALL iframe subframes (video balancers, HLS redirects, YouTube embeds) to load right inside the player!
                    if (!request.isForMainFrame()) {
                        return false;
                    }

                    // Protect main frame: keep our React app at localhost, block rogue ad redirects
                    String host = url.getHost() != null ? url.getHost().toLowerCase() : "";
                    if (host.equals("localhost") || host.equals("127.0.0.1")) {
                        return false;
                    }
                    return true;
                }
            });

            // Subclass BridgeWebChromeClient to support fullscreen video & block ad popups
            webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    // Block popup ad windows triggered by streaming balancers
                    return false;
                }

                @Override
                public void onShowCustomView(View view, CustomViewCallback callback) {
                    if (customFullscreenView != null) {
                        callback.onCustomViewHidden();
                        return;
                    }
                    customFullscreenView = view;
                    customViewCallback = callback;

                    FrameLayout decor = (FrameLayout) getWindow().getDecorView();
                    decor.addView(
                        customFullscreenView,
                        new FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    );
                    enterImmersiveLandscape();
                }

                @Override
                public void onHideCustomView() {
                    exitCustomFullscreenView();
                }
            });
        }

        // Smart Android Hardware/Gesture Back Button handling
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (customFullscreenView != null) {
                    exitCustomFullscreenView();
                    return;
                }
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript(
                        "(function(){ if(window.__cinemaHandleBack && window.__cinemaHandleBack()) { return 'handled'; } return 'exit'; })()",
                        value -> {
                            if (value == null || value.contains("exit")) {
                                moveTaskToBack(true);
                            }
                        }
                    );
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    /**
     * Converts raw screen coordinates into normalized [0..1] WebView coordinates
     * and invokes JavaScript hover/click helpers.
     */
    private float[] getNormalizedWebViewCoords(float rawX, float rawY) {
        if (this.bridge == null || this.bridge.getWebView() == null) return null;
        WebView webView = this.bridge.getWebView();
        int w = webView.getWidth();
        int h = webView.getHeight();
        if (w <= 0 || h <= 0) return null;

        int[] loc = new int[2];
        webView.getLocationOnScreen(loc);
        float localX = rawX - loc[0];
        float localY = rawY - loc[1];

        float normX = Math.max(0f, Math.min(1f, localX / (float) w));
        float normY = Math.max(0f, Math.min(1f, localY / (float) h));
        return new float[]{normX, normY, localX, localY};
    }

    private void notifyJsMouseHover(float rawX, float rawY) {
        long now = SystemClock.uptimeMillis();
        if (now - lastJsHoverNotifyTime < 32) return;
        lastJsHoverNotifyTime = now;

        float[] coords = getNormalizedWebViewCoords(rawX, rawY);
        if (coords == null) return;

        String js = String.format(
            Locale.US,
            "if(window.__cinemaOnMouseHover){window.__cinemaOnMouseHover(%.5f,%.5f);}",
            coords[0],
            coords[1]
        );
        this.bridge.getWebView().evaluateJavascript(js, null);
    }

    private void triggerJsClickFallback(float rawX, float rawY) {
        if (this.bridge == null || this.bridge.getWebView() == null) return;
        float[] coords = getNormalizedWebViewCoords(rawX, rawY);
        if (coords == null) return;

        WebView webView = this.bridge.getWebView();
        final float normX = coords[0];
        final float normY = coords[1];

        webView.postDelayed(() -> {
            String js = String.format(
                Locale.US,
                "if(window.__cinemaEnsureClickAt){window.__cinemaEnsureClickAt(%.5f,%.5f);}",
                normX,
                normY
            );
            webView.evaluateJavascript(js, null);
        }, 45);
    }

    /**
     * Synthesizes a clean hardware finger-touch (SOURCE_TOUCHSCREEN + TOOL_TYPE_FINGER)
     * tap at the given screen coordinates so WebView and embedded cross-origin iframes
     * always register the click.
     */
    private void synthesizeFingerTapAtRaw(float rawX, float rawY) {
        if (isSynthesizingTouch) return;
        isSynthesizingTouch = true;
        try {
            long downTime = SystemClock.uptimeMillis();
            MotionEvent downEv = buildFingerMotionEvent(
                downTime,
                downTime,
                MotionEvent.ACTION_DOWN,
                rawX,
                rawY
            );
            super.dispatchTouchEvent(downEv);
            downEv.recycle();

            MotionEvent upEv = buildFingerMotionEvent(
                downTime,
                downTime + 25,
                MotionEvent.ACTION_UP,
                rawX,
                rawY
            );
            super.dispatchTouchEvent(upEv);
            upEv.recycle();

            triggerJsClickFallback(rawX, rawY);
        } finally {
            isSynthesizingTouch = false;
        }
    }

    private MotionEvent buildFingerMotionEvent(
        long downTime,
        long eventTime,
        int action,
        float x,
        float y
    ) {
        MotionEvent.PointerProperties[] props = new MotionEvent.PointerProperties[1];
        props[0] = new MotionEvent.PointerProperties();
        props[0].id = 0;
        props[0].toolType = MotionEvent.TOOL_TYPE_FINGER;

        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[1];
        coords[0] = new MotionEvent.PointerCoords();
        coords[0].x = x;
        coords[0].y = y;
        coords[0].pressure = 1.0f;
        coords[0].size = 1.0f;

        return MotionEvent.obtain(
            downTime,
            eventTime,
            action,
            1,
            props,
            coords,
            0,
            0,
            1.0f,
            1.0f,
            0,
            0,
            InputDevice.SOURCE_TOUCHSCREEN,
            0
        );
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (event != null) {
            int action = event.getActionMasked();
            if (
                action == MotionEvent.ACTION_HOVER_MOVE ||
                action == MotionEvent.ACTION_HOVER_ENTER ||
                action == MotionEvent.ACTION_HOVER_EXIT
            ) {
                lastPointerRawX = event.getRawX();
                lastPointerRawY = event.getRawY();
                lastHoverTimestamp = SystemClock.uptimeMillis();
                isMousePointerMode = true;
                notifyJsMouseHover(lastPointerRawX, lastPointerRawY);
            } else if (action == MotionEvent.ACTION_BUTTON_PRESS) {
                int btn = event.getActionButton();
                if (btn == MotionEvent.BUTTON_SECONDARY || btn == MotionEvent.BUTTON_BACK) {
                    getOnBackPressedDispatcher().onBackPressed();
                    return true;
                }
                if (btn == MotionEvent.BUTTON_PRIMARY) {
                    lastPointerRawX = event.getRawX();
                    lastPointerRawY = event.getRawY();
                    lastHoverTimestamp = SystemClock.uptimeMillis();
                    isMousePointerMode = true;
                }
            } else if (action == MotionEvent.ACTION_SCROLL) {
                lastPointerRawX = event.getRawX();
                lastPointerRawY = event.getRawY();
                isMousePointerMode = true;
                float vScroll = event.getAxisValue(MotionEvent.AXIS_VSCROLL);
                float hScroll = event.getAxisValue(MotionEvent.AXIS_HSCROLL);
                if ((vScroll != 0f || hScroll != 0f) && this.bridge != null && this.bridge.getWebView() != null) {
                    float[] coords = getNormalizedWebViewCoords(lastPointerRawX, lastPointerRawY);
                    if (coords != null) {
                        String js = String.format(
                            Locale.US,
                            "if(window.__cinemaOnMouseWheel){window.__cinemaOnMouseWheel(%.5f,%.5f,%.3f,%.3f);}",
                            coords[0],
                            coords[1],
                            vScroll,
                            hScroll
                        );
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                }
            }
        }
        return super.dispatchGenericMotionEvent(event);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (event == null || isSynthesizingTouch) {
            return super.dispatchTouchEvent(event);
        }

        int source = event.getSource();
        int toolType = event.getPointerCount() > 0 ? event.getToolType(0) : MotionEvent.TOOL_TYPE_UNKNOWN;
        boolean isMouseOrPointer =
            (source & InputDevice.SOURCE_MOUSE) == InputDevice.SOURCE_MOUSE ||
            (source & InputDevice.SOURCE_TOUCHPAD) == InputDevice.SOURCE_TOUCHPAD ||
            (source & InputDevice.SOURCE_STYLUS) == InputDevice.SOURCE_STYLUS ||
            toolType == MotionEvent.TOOL_TYPE_MOUSE ||
            toolType == MotionEvent.TOOL_TYPE_STYLUS;

        int action = event.getActionMasked();

        // Right-click on USB / Bluetooth / Air Mouse triggers Back
        if (
            isMouseOrPointer &&
            action == MotionEvent.ACTION_DOWN &&
            (event.getButtonState() & (MotionEvent.BUTTON_SECONDARY | MotionEvent.BUTTON_BACK)) != 0
        ) {
            getOnBackPressedDispatcher().onBackPressed();
            return true;
        }

        // Convert mouse / Air Mouse events into stabilized finger touches so Chromium WebView
        // never drops TOOL_TYPE_MOUSE taps with buttonState=0 or Air Mouse hand jitter!
        if (isMouseOrPointer) {
            lastPointerRawX = event.getRawX();
            lastPointerRawY = event.getRawY();
            lastHoverTimestamp = SystemClock.uptimeMillis();
            isMousePointerMode = true;

            float density = getResources().getDisplayMetrics().density;
            float jitterSlopPx = 26f * (density > 0 ? density : 2f);

            float targetX = event.getX();
            float targetY = event.getY();

            if (action == MotionEvent.ACTION_DOWN) {
                mouseDownX = event.getX();
                mouseDownY = event.getY();
                mouseDownRawX = event.getRawX();
                mouseDownRawY = event.getRawY();
                mouseDownTime = event.getEventTime();
                mouseExceededSlop = false;
                notifyJsMouseHover(mouseDownRawX, mouseDownRawY);
            } else if (action == MotionEvent.ACTION_MOVE) {
                float dist = (float) Math.hypot(event.getX() - mouseDownX, event.getY() - mouseDownY);
                if (!mouseExceededSlop && dist < jitterSlopPx) {
                    targetX = mouseDownX;
                    targetY = mouseDownY;
                } else {
                    mouseExceededSlop = true;
                }
            } else if (action == MotionEvent.ACTION_UP) {
                if (!mouseExceededSlop) {
                    targetX = mouseDownX;
                    targetY = mouseDownY;
                }
            }

            isSynthesizingTouch = true;
            boolean handled;
            try {
                MotionEvent fingerEv = buildFingerMotionEvent(
                    mouseDownTime > 0 ? mouseDownTime : event.getDownTime(),
                    event.getEventTime(),
                    action,
                    targetX,
                    targetY
                );
                handled = super.dispatchTouchEvent(fingerEv);
                fingerEv.recycle();

                if (action == MotionEvent.ACTION_UP && !mouseExceededSlop) {
                    triggerJsClickFallback(mouseDownRawX, mouseDownRawY);
                }
            } finally {
                isSynthesizingTouch = false;
            }
            return handled;
        }

        // Standard touchscreen tap: also record position in case an Air Mouse injects SOURCE_TOUCHSCREEN
        if (action == MotionEvent.ACTION_DOWN) {
            mouseDownX = event.getX();
            mouseDownY = event.getY();
            mouseDownRawX = event.getRawX();
            mouseDownRawY = event.getRawY();
            mouseDownTime = event.getEventTime();
            mouseExceededSlop = false;
        } else if (action == MotionEvent.ACTION_MOVE) {
            float density = getResources().getDisplayMetrics().density;
            float slop = 18f * (density > 0 ? density : 2f);
            if (Math.hypot(event.getX() - mouseDownX, event.getY() - mouseDownY) > slop) {
                mouseExceededSlop = true;
            }
        } else if (action == MotionEvent.ACTION_UP && !mouseExceededSlop) {
            if (event.getEventTime() - mouseDownTime < 550) {
                triggerJsClickFallback(mouseDownRawX, mouseDownRawY);
            }
        }

        return super.dispatchTouchEvent(event);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event == null) return false;
        int keyCode = event.getKeyCode();
        int action = event.getAction();

        // 1. Handle D-Pad Directional Keys directly via JS bridge so cross-origin iframes
        // in VideoPlayer / SportsHub can NEVER trap or swallow remote control navigation!
        if (
            keyCode == KeyEvent.KEYCODE_DPAD_UP ||
            keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
            keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
            keyCode == KeyEvent.KEYCODE_DPAD_RIGHT
        ) {
            isMousePointerMode = false;
            if (action == KeyEvent.ACTION_DOWN && this.bridge != null && this.bridge.getWebView() != null) {
                String keyName = "ArrowDown";
                if (keyCode == KeyEvent.KEYCODE_DPAD_UP) keyName = "ArrowUp";
                else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) keyName = "ArrowLeft";
                else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) keyName = "ArrowRight";

                final String jsKey = keyName;
                this.bridge.getWebView().evaluateJavascript(
                    "if(window.__cinemaHandleDpad){window.__cinemaHandleDpad('" + jsKey + "');}",
                    null
                );
                return true;
            }
            return true;
        }

        // 2. Handle OK / Enter / Center button for BOTH Remote Mouse Mode and D-Pad Mode
        if (
            keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
            keyCode == KeyEvent.KEYCODE_ENTER ||
            keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
            keyCode == KeyEvent.KEYCODE_BUTTON_A
        ) {
            long now = SystemClock.uptimeMillis();
            boolean activeHoverCursor =
                isMousePointerMode &&
                lastPointerRawX >= 0 &&
                lastPointerRawY >= 0 &&
                (now - lastHoverTimestamp) < 8000;

            if (activeHoverCursor) {
                if (action == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                    synthesizeFingerTapAtRaw(lastPointerRawX, lastPointerRawY);
                }
                return true;
            } else if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_BUTTON_A) {
                if (action == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        this.bridge.getWebView().evaluateJavascript(
                            "if(window.__cinemaHandleDpadEnter){window.__cinemaHandleDpadEnter();}",
                            null
                        );
                        return true;
                    }
                }
                return true;
            }
        }

        // 3. Hardware Media & TV Remote Shortcut Keys
        if (action == KeyEvent.ACTION_DOWN) {
            switch (keyCode) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                case KeyEvent.KEYCODE_MEDIA_PLAY:
                case KeyEvent.KEYCODE_MEDIA_PAUSE:
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                case KeyEvent.KEYCODE_MEDIA_REWIND:
                case KeyEvent.KEYCODE_MEDIA_NEXT:
                case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                case KeyEvent.KEYCODE_MEDIA_STOP:
                case KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK:
                case KeyEvent.KEYCODE_CAPTIONS:
                case KeyEvent.KEYCODE_MENU:
                case KeyEvent.KEYCODE_SETTINGS:
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        this.bridge.getWebView().evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('cinema-remote-media', { detail: { keyCode: " + keyCode + " } }));",
                            null
                        );
                        return true;
                    }
                    break;
            }
        }

        return super.dispatchKeyEvent(event);
    }

    private void exitCustomFullscreenView() {
        if (customFullscreenView != null) {
            FrameLayout decor = (FrameLayout) getWindow().getDecorView();
            decor.removeView(customFullscreenView);
            customFullscreenView = null;
        }
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }
        exitImmersiveLandscape();
    }

    private void enterImmersiveLandscape() {
        runOnUiThread(() -> {
            isPlayerLandscape = true;
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (controller != null) {
                controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
                controller.hide(WindowInsetsCompat.Type.systemBars());
            }
            View decorView = getWindow().getDecorView();
            decorView.setPadding(0, 0, 0, 0);
        });
    }

    private void exitImmersiveLandscape() {
        runOnUiThread(() -> {
            isPlayerLandscape = false;
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (controller != null) {
                controller.show(WindowInsetsCompat.Type.systemBars());
                controller.setAppearanceLightStatusBars(false);
                controller.setAppearanceLightNavigationBars(false);
            }
            ViewCompat.requestApplyInsets(getWindow().getDecorView());
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        if (waitingForInstallPermission && pendingInstallApkFile != null && pendingInstallApkFile.exists()) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                waitingForInstallPermission = false;
                File fileToInstall = pendingInstallApkFile;
                pendingInstallApkFile = null;
                installDownloadedApk(fileToInstall);
            }
        }
    }

    private void notifyApkProgress(String status, int percent, String message) {
        runOnUiThread(() -> {
            if (this.bridge == null || this.bridge.getWebView() == null) return;
            String safeMsg = (message != null ? message : "")
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", " ");
            String js = String.format(
                Locale.US,
                "if(window.__cinemaOnApkDownloadProgress){window.__cinemaOnApkDownloadProgress('%s',%d,'%s');}",
                status,
                percent,
                safeMsg
            );
            this.bridge.getWebView().evaluateJavascript(js, null);
        });
    }

    private void downloadAndInstallApkInternal(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return;
        if (isDownloadingApk) {
            runOnUiThread(() ->
                Toast.makeText(MainActivity.this, "⏳ Оновлення вже завантажується...", Toast.LENGTH_SHORT).show()
            );
            return;
        }
        isDownloadingApk = true;
        final String targetUrl = rawUrl.trim();

        runOnUiThread(() ->
            Toast.makeText(
                MainActivity.this,
                "⬇️ Завантаження оновлення CinemaVault PRO...",
                Toast.LENGTH_SHORT
            ).show()
        );
        notifyApkProgress("downloading", 1, "Підключення до сервера GitHub...");

        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream in = null;
            FileOutputStream out = null;
            try {
                String currentUrl = targetUrl;
                for (int redirectCount = 0; redirectCount < 8; redirectCount++) {
                    URL urlObj = new URL(currentUrl);
                    conn = (HttpURLConnection) urlObj.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Android; CinemaVault-PRO-Updater)");
                    conn.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*");
                    conn.connect();

                    int code = conn.getResponseCode();
                    if (
                        code == HttpURLConnection.HTTP_MOVED_PERM ||
                        code == HttpURLConnection.HTTP_MOVED_TEMP ||
                        code == HttpURLConnection.HTTP_SEE_OTHER ||
                        code == 307 ||
                        code == 308
                    ) {
                        String location = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (location == null || location.isEmpty()) break;
                        currentUrl = new URL(urlObj, location).toString();
                        continue;
                    }
                    break;
                }

                if (conn == null || conn.getResponseCode() >= 400) {
                    throw new Exception("HTTP " + (conn != null ? conn.getResponseCode() : -1));
                }

                long totalBytes = conn.getContentLengthLong();
                File apkFile = new File(getCacheDir(), "CinemaVault-PRO-Update.apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                in = conn.getInputStream();
                out = new FileOutputStream(apkFile);

                byte[] buffer = new byte[16384];
                long downloaded = 0L;
                int read;
                long lastNotify = 0L;

                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    downloaded += read;
                    long now = SystemClock.uptimeMillis();
                    if (now - lastNotify >= 220) {
                        lastNotify = now;
                        int pct = totalBytes > 0
                            ? (int) Math.min(99L, (downloaded * 100L) / totalBytes)
                            : 50;
                        double mbDone = downloaded / (1024.0 * 1024.0);
                        double mbTotal = totalBytes > 0 ? totalBytes / (1024.0 * 1024.0) : 4.5;
                        notifyApkProgress(
                            "downloading",
                            Math.max(2, pct),
                            String.format(Locale.US, "Завантаження APK: %d%% (%.1f / %.1f МБ)", pct, mbDone, mbTotal)
                        );
                    }
                }
                out.flush();
                out.close();
                out = null;
                in.close();
                in = null;

                if (!apkFile.exists() || apkFile.length() < 100_000) {
                    throw new Exception("Пошкоджений файл APK");
                }

                // Also copy to public Downloads folder so Projector File Manager can always see it too
                try {
                    File pubDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (pubDownloads != null) {
                        if (!pubDownloads.exists()) pubDownloads.mkdirs();
                        File pubCopy = new File(pubDownloads, "CinemaVault-PRO-Update.apk");
                        try (
                            FileInputStream fis = new FileInputStream(apkFile);
                            FileOutputStream fos = new FileOutputStream(pubCopy)
                        ) {
                            byte[] copyBuf = new byte[16384];
                            int r;
                            while ((r = fis.read(copyBuf)) != -1) {
                                fos.write(copyBuf, 0, r);
                            }
                        }
                    }
                } catch (Exception ignored) {
                }

                notifyApkProgress("installing", 100, "Завантаження завершено (100%). Запуск інсталятора Android...");
                isDownloadingApk = false;
                runOnUiThread(() -> installDownloadedApk(apkFile));
            } catch (Exception e) {
                isDownloadingApk = false;
                notifyApkProgress(
                    "error",
                    0,
                    "Помилка завантаження: " + (e.getMessage() != null ? e.getMessage() : "перевірте інтернет")
                );
                runOnUiThread(() ->
                    Toast.makeText(
                        MainActivity.this,
                        "⚠️ Не вдалося завантажити APK: перевірте підключення до Інтернету",
                        Toast.LENGTH_LONG
                    ).show()
                );
            } finally {
                try {
                    if (out != null) out.close();
                } catch (Exception ignored) {}
                try {
                    if (in != null) in.close();
                } catch (Exception ignored) {}
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void installDownloadedApk(File apkFile) {
        if (apkFile == null || !apkFile.exists()) return;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    pendingInstallApkFile = apkFile;
                    waitingForInstallPermission = true;
                    notifyApkProgress(
                        "permission",
                        100,
                        "Увімкніть дозвіл «Встановлення невідомих додатків» для CinemaVault та натисніть Назад"
                    );
                    Toast.makeText(
                        MainActivity.this,
                        "Увімкніть дозвіл на встановлення оновлень для CinemaVault та натисніть «Назад»",
                        Toast.LENGTH_LONG
                    ).show();
                    try {
                        Intent permIntent = new Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName())
                        );
                        permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(permIntent);
                        return;
                    } catch (Exception ignored) {
                        try {
                            Intent secIntent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
                            secIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(secIntent);
                            return;
                        } catch (Exception ignored2) {
                        }
                    }
                }
            }

            Uri apkUri = FileProvider.getUriForFile(
                MainActivity.this,
                getPackageName() + ".fileprovider",
                apkFile
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            // Explicitly grant URI permission to all package installer activities on TV / Projector ROMs
            List<ResolveInfo> resInfoList = getPackageManager().queryIntentActivities(
                installIntent,
                PackageManager.MATCH_DEFAULT_ONLY
            );
            for (ResolveInfo resolveInfo : resInfoList) {
                String packageName = resolveInfo.activityInfo.packageName;
                grantUriPermission(packageName, apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }

            try {
                startActivity(installIntent);
                notifyApkProgress("ready", 100, "Вікно встановлення відкрито! Натисніть «Оновити / Встановити».");
                return;
            } catch (Exception firstErr) {
                Intent fallbackInstall = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                fallbackInstall.setData(apkUri);
                fallbackInstall.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
                fallbackInstall.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                fallbackInstall.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(fallbackInstall);
                notifyApkProgress("ready", 100, "Вікно встановлення відкрито! Натисніть «Оновити / Встановити».");
            }
        } catch (Exception e) {
            notifyApkProgress(
                "ready",
                100,
                "APK збережено у папку «Завантаження» (Downloads/CinemaVault-PRO-Update.apk). Відкрийте його через Провідник!"
            );
            Toast.makeText(
                MainActivity.this,
                "✅ Файл збережено у папку Downloads/CinemaVault-PRO-Update.apk!",
                Toast.LENGTH_LONG
            ).show();
        }
    }

    public class CinemaJsBridge {
        @JavascriptInterface
        public void setPlayerFullscreen(boolean fullscreen) {
            if (fullscreen) {
                enterImmersiveLandscape();
            } else {
                exitImmersiveLandscape();
            }
        }

        @JavascriptInterface
        public void simulateScreenTap(float normX, float normY) {
            runOnUiThread(() -> {
                if (bridge == null || bridge.getWebView() == null) return;
                WebView webView = bridge.getWebView();
                int[] loc = new int[2];
                webView.getLocationOnScreen(loc);
                float rawX = loc[0] + Math.max(0f, Math.min(1f, normX)) * webView.getWidth();
                float rawY = loc[1] + Math.max(0f, Math.min(1f, normY)) * webView.getHeight();
                synthesizeFingerTapAtRaw(rawX, rawY);
            });
        }

        @JavascriptInterface
        public void downloadAndInstallApk(String url) {
            downloadAndInstallApkInternal(url);
        }

        @JavascriptInterface
        public void openExternalUrl(String url) {
            if (url == null || url.trim().isEmpty()) return;
            final String cleanUrl = url.trim();
            if (cleanUrl.toLowerCase(Locale.US).contains(".apk")) {
                downloadAndInstallApkInternal(cleanUrl);
                return;
            }
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(cleanUrl));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception noBrowserException) {
                    // Projector has no browser installed: fall back to direct in-app APK download!
                    downloadAndInstallApkInternal(
                        "https://github.com/zod4ix/cinemavault-android/raw/main/CinemaVault-PRO-v3.6.0.apk"
                    );
                }
            });
        }
    }
}
