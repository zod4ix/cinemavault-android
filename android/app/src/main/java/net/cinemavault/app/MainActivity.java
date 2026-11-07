package net.cinemavault.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.KeyEvent;
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

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private View customFullscreenView = null;
    private BridgeWebChromeClient.CustomViewCallback customViewCallback = null;
    private boolean isPlayerLandscape = false;

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

            // Expose native bridge to React for landscape fullscreen & back navigation
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

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            switch (keyCode) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                case KeyEvent.KEYCODE_MEDIA_PLAY:
                case KeyEvent.KEYCODE_MEDIA_PAUSE:
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                case KeyEvent.KEYCODE_MEDIA_REWIND:
                case KeyEvent.KEYCODE_MEDIA_NEXT:
                case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                case KeyEvent.KEYCODE_MEDIA_STOP:
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
        public void openExternalUrl(String url) {
            if (url == null || url.trim().isEmpty()) return;
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception ignored) {
                }
            });
        }
    }
}
