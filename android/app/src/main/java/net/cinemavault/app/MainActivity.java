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
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private View customFullscreenView = null;
    private BridgeWebChromeClient.CustomViewCallback customViewCallback = null;
    private boolean isPlayerLandscape = false;

    // Universal Mouse, Air Mouse & Projector Remote Pointer Tracking (in Window coordinates!)
    private float lastPointerWinX = -1f;
    private float lastPointerWinY = -1f;
    private long lastHoverTimestamp = 0L;
    private long lastJsHoverNotifyTime = 0L;
    private boolean isMousePointerMode = false;

    // Air Mouse & Projector Mouse click jitter stabilization state
    private float mouseDownWinX = 0f;
    private float mouseDownWinY = 0f;
    private long mouseDownTime = 0L;
    private int mouseDownButtonState = 0;
    private boolean mouseExceededSlop = false;
    private boolean isSynthesizingTouch = false;

    // YouTube-style Edge & Center Double-Tap Detection
    private long lastTapTime = 0L;
    private float lastTapWinX = -1f;
    private float lastTapWinY = -1f;

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

            // Inject Universal Subframe Player Bridge into ALL frames & cross-origin iframes (Rezka, Ashdi, Videasy, VidLink, etc.)!
            try {
                if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                    WebViewCompat.addDocumentStartJavaScript(
                        webView,
                        getSubframePlayerBridgeJs(),
                        Collections.singleton("*")
                    );
                }
            } catch (Exception ignored) {
            }

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
                        "(function(){ " +
                        "  if (typeof window.__cinemaHandlePlayerBack === 'function' && window.__cinemaHandlePlayerBack()) return 'handled'; " +
                        "  if (typeof window.__cinemaHandleBack === 'function' && window.__cinemaHandleBack()) return 'handled'; " +
                        "  return 'exit'; " +
                        "})()",
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
     * Universal JavaScript bridge injected into every frame and cross-origin iframe
     * (Rezka / Loadbox, Ashdi, Voidboost, Videasy, VidLink, VidSrc, etc.).
     * Enables remote & mouse seeking (прокрутка), play/pause, audio booster up to 300%,
     * aspect ratio crop, internal voiceover/quality switching, and touch-to-click synthesis!
     */
    private String getSubframePlayerBridgeJs() {
        return "(function(){" +
            "if(window.__cinemaSubframeBridgeInstalled)return;" +
            "window.__cinemaSubframeBridgeInstalled=true;" +
            "var isSubframe=(window!==window.top);" +
            "var audioCtx=null,gainNode=null,hookedVideo=null;" +
            "var preferUa=true,uaAutoAttempts=0,uaAutoSelected=false;" +
            "var VOICE_SELECTORS='.b-translators__item, [data-translator_id], .pljs-menu li, [class*=\"translator\"], [class*=\"voice\"], select.pljs-audio option, select[name*=\"voice\"] option, select[name*=\"audio\"] option, [data-voice], .voice-btn, .audio-track-item, [data-audio]';" +
            "function getActiveVideo(){" +
            "  var vids=document.querySelectorAll('video');" +
            "  for(var i=0;i<vids.length;i++){if(vids[i].readyState>0||vids[i].src||vids[i].currentSrc)return vids[i];}" +
            "  return vids[0]||null;" +
            "}" +
            "function getElementCenter(el){" +
            "  try{" +
            "    var r=el.getBoundingClientRect();" +
            "    if(r&&r.width>0&&r.height>0){return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};}" +
            "  }catch(e){}" +
            "  return {x:30,y:30};" +
            "}" +
            "function scanVoices(){" +
            "  var out=[];" +
            "  try{" +
            "    var nodes=document.querySelectorAll(VOICE_SELECTORS);" +
            "    for(var i=0;i<nodes.length&&out.length<20;i++){" +
            "      var el=nodes[i];" +
            "      var txt=(el.textContent||el.value||'').trim();" +
            "      if(txt&&txt.length>1&&txt.length<50){" +
            "        var act=el.classList.contains('active')||el.classList.contains('selected')||el.getAttribute('aria-selected')==='true'||Boolean(el.selected);" +
            "        out.push({index:i,label:txt,active:act});" +
            "      }" +
            "    }" +
            "  }catch(e){}" +
            "  return out;" +
            "}" +
            "function tryAutoSelectUaVoice(){" +
            "  if(!preferUa||uaAutoSelected||uaAutoAttempts>12)return;" +
            "  uaAutoAttempts++;" +
            "  try{" +
            "    var vList=scanVoices();" +
            "    if(vList&&vList.length>0){" +
            "      var activeIsUa=vList.some(function(v){return v.active&&/(укр|ukr|ua\\b|укра|дубляж)/i.test(v.label);});" +
            "      if(activeIsUa){uaAutoSelected=true;return;}" +
            "      for(var j=0;j<vList.length;j++){" +
            "        if(/(укр|ukr|ua\\b|укра|дубляж)/i.test(vList[j].label)){" +
            "          var allNodes=document.querySelectorAll(VOICE_SELECTORS);" +
            "          var targetNode=null;" +
            "          for(var k=0;k<allNodes.length;k++){" +
            "            if((allNodes[k].textContent||allNodes[k].value||'').trim()===vList[j].label){targetNode=allNodes[k];break;}" +
            "          }" +
            "          if(!targetNode&&allNodes[vList[j].index])targetNode=allNodes[vList[j].index];" +
            "          if(targetNode){" +
            "            uaAutoSelected=true;" +
            "            fireFullTapOnElement(targetNode);" +
            "            try{window.top.postMessage({__cinemaPlayerBridge:true,type:'uaVoiceAutoActivated',label:vList[j].label},'*');}catch(e){}" +
            "            return;" +
            "          }" +
            "        }" +
            "      }" +
            "    }" +
            "    var allMenuItems=document.querySelectorAll('li, div, button, span, a');" +
            "    for(var mi=0;mi<allMenuItems.length;mi++){" +
            "      var mTxt=(allMenuItems[mi].textContent||'').trim();" +
            "      if(mTxt.length>2&&mTxt.length<40&&/^(украинск|українськ|ukrainian|дубляж\\s*\\(?укр\\)?)/i.test(mTxt)){" +
            "        uaAutoSelected=true;" +
            "        fireFullTapOnElement(allMenuItems[mi]);" +
            "        try{window.top.postMessage({__cinemaPlayerBridge:true,type:'uaVoiceAutoActivated',label:mTxt},'*');}catch(e){}" +
            "        return;" +
            "      }" +
            "    }" +
            "  }catch(e){}" +
            "}" +
            "function scanQualities(){" +
            "  var out=[];" +
            "  try{" +
            "    var nodes=document.querySelectorAll('[data-quality], .pljs-quality li, [class*=\"quality\"] li, [class*=\"quality\"] div');" +
            "    for(var i=0;i<nodes.length&&out.length<8;i++){" +
            "      var txt=(nodes[i].textContent||'').trim();" +
            "      if(/^(4K|2160p?|1440p?|1080p?|720p?|480p?|360p?)$/i.test(txt)&&out.indexOf(txt)===-1)out.push(txt);" +
            "    }" +
            "  }catch(e){}" +
            "  return out;" +
            "}" +
            "function reportState(){" +
            "  if(!isSubframe)return;" +
            "  var v=getActiveVideo();" +
            "  if(!v)return;" +
            "  var bufEnd=0;" +
            "  try{if(v.buffered&&v.buffered.length>0)bufEnd=v.buffered.end(v.buffered.length-1);}catch(e){}" +
            "  try{" +
            "    window.top.postMessage({" +
            "      __cinemaPlayerBridge:true," +
            "      type:'videoState'," +
            "      currentTime:v.currentTime||0," +
            "      duration:v.duration||0," +
            "      paused:Boolean(v.paused)," +
            "      muted:Boolean(v.muted)," +
            "      volume:typeof v.volume==='number'?v.volume:1," +
            "      playbackRate:v.playbackRate||1," +
            "      bufferedEnd:bufEnd," +
            "      voices:scanVoices()," +
            "      qualities:scanQualities()" +
            "    },'*');" +
            "  }catch(e){}" +
            "}" +
            "if(isSubframe){" +
            "  setInterval(function(){" +
            "    var v=getActiveVideo();" +
            "    if(v&&!v.__cinemaHooked){" +
            "      v.__cinemaHooked=true;" +
            "      v.addEventListener('timeupdate',reportState);" +
            "      v.addEventListener('loadedmetadata',reportState);" +
            "      v.addEventListener('play',reportState);" +
            "      v.addEventListener('pause',reportState);" +
            "    }" +
            "    tryAutoSelectUaVoice();" +
            "    if(v)reportState();" +
            "  },650);" +
            "}" +
            "function fireFullTapOnElement(el,cx,cy){" +
            "  if(!el)return;" +
            "  if(typeof cx!=='number'||typeof cy!=='number'||(cx<=15&&cy<=15)){" +
            "    var pt=getElementCenter(el);" +
            "    cx=pt.x; cy=pt.y;" +
            "  }" +
            "  try{" +
            "    if(typeof Touch!=='undefined'&&typeof TouchEvent!=='undefined'){" +
            "      var tObj=new Touch({identifier:Date.now()%10000,target:el,clientX:cx,clientY:cy,pageX:cx,pageY:cy,radiusX:4,radiusY:4,force:1});" +
            "      el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[tObj],targetTouches:[tObj],changedTouches:[tObj]}));" +
            "      el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[tObj]}));" +
            "    }" +
            "  }catch(e){}" +
            "  try{" +
            "    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerType:'touch',isPrimary:true}));" +
            "    el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:cx,clientY:cy,button:0,buttons:1}));" +
            "    el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerType:'touch',isPrimary:true}));" +
            "    el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,clientX:cx,clientY:cy,button:0,buttons:0}));" +
            "    if(typeof el.click==='function')el.click();" +
            "    else el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:cx,clientY:cy,button:0}));" +
            "    if(el.tagName==='OPTION'&&el.parentElement){" +
            "      el.parentElement.value=el.value;" +
            "      el.parentElement.dispatchEvent(new Event('change',{bubbles:true}));" +
            "      el.parentElement.dispatchEvent(new Event('input',{bubbles:true}));" +
            "    }" +
            "  }catch(e){}" +
            "}" +
            "window.addEventListener('message',function(ev){" +
            "  var d=ev.data;" +
            "  if(!d||typeof d!=='object'||!d.__cinemaCmd)return;" +
            "  var cmd=d.__cinemaCmd;" +
            "  var subFrames=document.querySelectorAll('iframe');" +
            "  if(cmd!=='clickAt'&&cmd!=='hoverAt'){" +
            "    for(var f=0;f<subFrames.length;f++){try{subFrames[f].contentWindow.postMessage(d,'*');}catch(e){}}" +
            "  }" +
            "  if(cmd==='hoverAt'){" +
            "    var hx=Math.round((d.normX||0.5)*window.innerWidth);" +
            "    var hy=Math.round((d.normY||0.5)*window.innerHeight);" +
            "    var hEl=document.elementFromPoint(hx,hy);" +
            "    if(hEl&&hEl.tagName==='IFRAME'){" +
            "      var hr=hEl.getBoundingClientRect();" +
            "      if(hr.width>0&&hr.height>0){" +
            "        try{hEl.contentWindow.postMessage({__cinemaCmd:'hoverAt',normX:(hx-hr.left)/hr.width,normY:(hy-hr.top)/hr.height},'*');}catch(e){}" +
            "      }" +
            "      return;" +
            "    }" +
            "    if(hEl){" +
            "      hEl.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:hx,clientY:hy}));" +
            "      hEl.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:hx,clientY:hy}));" +
            "    }" +
            "    return;" +
            "  }" +
            "  if(cmd==='clickAt'){" +
            "    var cx=Math.round((d.normX||0.5)*window.innerWidth);" +
            "    var cy=Math.round((d.normY||0.5)*window.innerHeight);" +
            "    var cEl=document.elementFromPoint(cx,cy);" +
            "    if(!cEl)return;" +
            "    if(cEl.tagName==='IFRAME'){" +
            "      var cr=cEl.getBoundingClientRect();" +
            "      if(cr.width>0&&cr.height>0){" +
            "        try{cEl.contentWindow.postMessage({__cinemaCmd:'clickAt',normX:(cx-cr.left)/cr.width,normY:(cy-cr.top)/cr.height},'*');}catch(e){}" +
            "      }" +
            "      return;" +
            "    }" +
            "    fireFullTapOnElement(cEl,cx,cy);" +
            "    return;" +
            "  }" +
            "  var v=getActiveVideo();" +
            "  if(cmd==='togglePlay'){" +
            "    if(v){if(v.paused)v.play().catch(function(){});else v.pause();reportState();}" +
            "    var toggleBtn=document.querySelector('.vjs-play-control, .pljs-play, [class*=\"play-pause\"], [class*=\"play_pause\"], button[aria-label*=\"play\" i], button[aria-label*=\"pause\" i], .jw-icon-playback');" +
            "    if(toggleBtn)try{toggleBtn.click();}catch(e){}" +
            "  }" +
            "  else if(cmd==='play'){" +
            "    if(v){v.play().catch(function(){});reportState();}" +
            "    var startBtn=document.querySelector('.vjs-play-control.vjs-paused, .pljs-play, button[aria-label*=\"play\" i], .vjs-big-play-button');" +
            "    if(startBtn)try{startBtn.click();}catch(e){}" +
            "  }" +
            "  else if(cmd==='pause'){" +
            "    if(v){v.pause();reportState();}" +
            "    var stopBtn=document.querySelector('.vjs-play-control.vjs-playing, .pljs-pause, button[aria-label*=\"pause\" i]');" +
            "    if(stopBtn)try{stopBtn.click();}catch(e){}" +
            "  }" +
            "  else if(cmd==='seekBy'&&v){var dur=v.duration||99999;v.currentTime=Math.max(0,Math.min(dur,(v.currentTime||0)+(Number(d.delta)||0)));reportState();}" +
            "  else if(cmd==='seekToPercent'&&v){if(v.duration>0)v.currentTime=Math.max(0,Math.min(v.duration,(Number(d.percent)||0)*v.duration));else if(d.time)v.currentTime=Number(d.time);reportState();}" +
            "  else if(cmd==='toggleMute'&&v){v.muted=typeof d.muted==='boolean'?d.muted:!v.muted;reportState();}" +
            "  else if(cmd==='setSpeed'&&v){v.playbackRate=Number(d.rate)||1.0;reportState();}" +
            "  else if(cmd==='setAspect'&&v){" +
            "    var m=d.mode||'contain';" +
            "    v.style.objectFit=(m==='cover')?'cover':(m==='fill')?'fill':'contain';" +
            "    v.style.transform=(m==='zoom115')?'scale(1.15)':'none';" +
            "  }" +
            "  else if(cmd==='setAudioBoost'&&v){" +
            "    try{" +
            "      var g=Number(d.gain)||1.0;" +
            "      if(!audioCtx||hookedVideo!==v){" +
            "        var AC=window.AudioContext||window.webkitAudioContext;" +
            "        if(AC){" +
            "          audioCtx=new AC();" +
            "          var src=audioCtx.createMediaElementSource(v);" +
            "          gainNode=audioCtx.createGain();" +
            "          src.connect(gainNode);" +
            "          gainNode.connect(audioCtx.destination);" +
            "          hookedVideo=v;" +
            "        }" +
            "      }" +
            "      if(gainNode&&audioCtx){if(audioCtx.state==='suspended')audioCtx.resume();gainNode.gain.value=g;}" +
            "    }catch(e){}" +
            "  }" +
            "  else if(cmd==='selectInternalVoice'){" +
            "    var vNodes=document.querySelectorAll(VOICE_SELECTORS);" +
            "    var target=null;" +
            "    var targetLabel=(d.label||'').trim().toLowerCase();" +
            "    if(targetLabel){" +
            "      for(var vi=0;vi<vNodes.length;vi++){" +
            "        var nTxt=(vNodes[vi].textContent||vNodes[vi].value||'').trim().toLowerCase();" +
            "        if(nTxt===targetLabel||(targetLabel.length>3&&nTxt.indexOf(targetLabel)!==-1)){" +
            "          target=vNodes[vi];break;" +
            "        }" +
            "      }" +
            "    }" +
            "    if(!target&&typeof d.index==='number'&&vNodes[d.index]){target=vNodes[d.index];}" +
            "    if(target){" +
            "      try{target.scrollIntoView({block:'nearest',inline:'nearest'});}catch(e){}" +
            "      fireFullTapOnElement(target);" +
            "      try{if(window.jQuery&&target.getAttribute('data-translator_id')){window.jQuery(target).trigger('click');}}catch(e){}" +
            "    }" +
            "  }" +
            "  else if(cmd==='preferLanguage'){" +
            "    if(d.lang==='ua'){preferUa=true;uaAutoAttempts=0;tryAutoSelectUaVoice();}" +
            "  }" +
            "  else if(cmd==='selectInternalQuality'){" +
            "    var qTarget=String(d.quality||'').toLowerCase();" +
            "    var qNodes=document.querySelectorAll('[data-quality], .pljs-quality li, [class*=\"quality\"] li, [class*=\"quality\"] div, li, button, span');" +
            "    for(var qi=0;qi<qNodes.length;qi++){" +
            "      var qt=(qNodes[qi].textContent||'').trim().toLowerCase();" +
            "      if(qt===qTarget||(qTarget==='4k'&&(qt==='2160p'||qt==='4k'||qt==='2160'))||(qTarget==='1080p'&&(qt==='1080p'||qt==='1080'))){" +
            "        fireFullTapOnElement(qNodes[qi]);break;" +
            "      }" +
            "    }" +
            "  }" +
            "  else if(cmd==='openInternalMenu'){" +
            "    var gear=document.querySelector('[class*=\"setting\"], [class*=\"gear\"], [class*=\"cog\"], .pljs-settings, .vjs-subs-caps-button, .jw-icon-settings');" +
            "    if(gear)fireFullTapOnElement(gear,10,10);" +
            "    else if(v)fireFullTapOnElement(v,window.innerWidth*0.5,window.innerHeight*0.5);" +
            "  }" +
            "});" +
            "window.addEventListener('keydown',function(e){" +
            "  if(e.key==='Escape'||e.key==='Backspace'||e.keyCode===4||e.keyCode===27){" +
            "    try{window.top.postMessage({type:'cinema-bridge-back'},'*');}catch(ex){}" +
            "  }" +
            "},true);" +
            "})();";
    }

    /**
     * Converts Window-local coordinates (event.getX(), event.getY()) into WebView-local
     * and normalized [0..1] coordinates. Immune to Projector Keystone Correction & Zoom!
     */
    private float[] getWebViewCoordsFromWindow(float winX, float winY) {
        if (this.bridge == null || this.bridge.getWebView() == null) return null;
        WebView webView = this.bridge.getWebView();
        int w = webView.getWidth();
        int h = webView.getHeight();
        if (w <= 0 || h <= 0) return null;

        int[] winLoc = new int[2];
        webView.getLocationInWindow(winLoc);
        float localX = winX - winLoc[0];
        float localY = winY - winLoc[1];

        float normX = Math.max(0f, Math.min(1f, localX / (float) w));
        float normY = Math.max(0f, Math.min(1f, localY / (float) h));
        return new float[]{normX, normY, localX, localY};
    }

    private void notifyJsMouseHover(float winX, float winY) {
        long now = SystemClock.uptimeMillis();
        if (now - lastJsHoverNotifyTime < 28) return;
        lastJsHoverNotifyTime = now;

        float[] coords = getWebViewCoordsFromWindow(winX, winY);
        if (coords == null) return;

        String js = String.format(
            Locale.US,
            "if(window.__cinemaOnMouseHover){window.__cinemaOnMouseHover(%.5f,%.5f);}",
            coords[0],
            coords[1]
        );
        this.bridge.getWebView().evaluateJavascript(js, null);
    }

    /**
     * Evaluates window.__cinemaEnsureClickAt(normX, normY).
     * - If a native click already fired on a React button, JS returns 'already_clicked'.
     * - If the click was dropped by WebView (e.g. Projector Mouse Mode buttonState=0), JS clicks the button!
     * - If the click landed on an <iframe> (e.g. Rezka player) and forceIframeTouch is true,
     *   also dispatches a two-step asynchronous finger tap (ACTION_DOWN -> 55ms -> ACTION_UP) to WebView.
     */
    private void triggerSmartClickAtWindowCoords(float winX, float winY, boolean forceIframeTouch) {
        if (this.bridge == null || this.bridge.getWebView() == null) return;
        float[] coords = getWebViewCoordsFromWindow(winX, winY);
        if (coords == null) return;

        final WebView webView = this.bridge.getWebView();
        final float normX = coords[0];
        final float normY = coords[1];
        final float localX = coords[2];
        final float localY = coords[3];

        webView.postDelayed(() -> {
            String js = String.format(
                Locale.US,
                "(function(){ if(window.__cinemaEnsureClickAt){ return window.__cinemaEnsureClickAt(%.5f,%.5f); } return 'none'; })()",
                normX,
                normY
            );
            webView.evaluateJavascript(js, result -> {
                if (forceIframeTouch && result != null && result.contains("iframe")) {
                    dispatchAsyncFingerTapToWebView(localX, localY);
                }
            });
        }, 30);
    }

    /**
     * Dispatches a true two-step asynchronous finger touch (ACTION_DOWN at t=0,
     * ACTION_UP at t=55ms via postDelayed) directly to WebView in WebView-local coordinates
     * so cross-origin iframes (like Rezka / PlayerJS) always register the tap!
     */
    private void dispatchAsyncFingerTapToWebView(float localX, float localY) {
        if (this.bridge == null || this.bridge.getWebView() == null) return;
        final WebView webView = this.bridge.getWebView();
        if (isSynthesizingTouch) return;

        final long downTime = SystemClock.uptimeMillis();
        isSynthesizingTouch = true;
        try {
            MotionEvent downEv = buildFingerMotionEvent(
                downTime,
                downTime,
                MotionEvent.ACTION_DOWN,
                localX,
                localY
            );
            webView.dispatchTouchEvent(downEv);
            downEv.recycle();
        } finally {
            isSynthesizingTouch = false;
        }

        webView.postDelayed(() -> {
            isSynthesizingTouch = true;
            try {
                long upTime = SystemClock.uptimeMillis();
                MotionEvent upEv = buildFingerMotionEvent(
                    downTime,
                    upTime,
                    MotionEvent.ACTION_UP,
                    localX,
                    localY
                );
                webView.dispatchTouchEvent(upEv);
                upEv.recycle();
            } finally {
                isSynthesizingTouch = false;
            }
        }, 55);
    }

    private void synthesizeAsyncWebViewTapAtWindowCoords(float winX, float winY) {
        float[] coords = getWebViewCoordsFromWindow(winX, winY);
        if (coords == null) return;
        dispatchAsyncFingerTapToWebView(coords[2], coords[3]);
        triggerSmartClickAtWindowCoords(winX, winY, false);
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
                lastPointerWinX = event.getX();
                lastPointerWinY = event.getY();
                lastHoverTimestamp = SystemClock.uptimeMillis();
                isMousePointerMode = true;
                notifyJsMouseHover(lastPointerWinX, lastPointerWinY);
            } else if (action == MotionEvent.ACTION_BUTTON_PRESS) {
                int btn = event.getActionButton();
                if (btn == MotionEvent.BUTTON_SECONDARY || btn == MotionEvent.BUTTON_BACK) {
                    getOnBackPressedDispatcher().onBackPressed();
                    return true;
                }
                if (btn == MotionEvent.BUTTON_PRIMARY) {
                    lastPointerWinX = event.getX();
                    lastPointerWinY = event.getY();
                    mouseDownWinX = event.getX();
                    mouseDownWinY = event.getY();
                    lastHoverTimestamp = SystemClock.uptimeMillis();
                    isMousePointerMode = true;
                    notifyJsMouseHover(lastPointerWinX, lastPointerWinY);
                }
            } else if (action == MotionEvent.ACTION_BUTTON_RELEASE) {
                int btn = event.getActionButton();
                if (btn == MotionEvent.BUTTON_PRIMARY) {
                    lastPointerWinX = event.getX();
                    lastPointerWinY = event.getY();
                    lastHoverTimestamp = SystemClock.uptimeMillis();
                    isMousePointerMode = true;
                    triggerSmartClickAtWindowCoords(event.getX(), event.getY(), true);
                }
            } else if (action == MotionEvent.ACTION_SCROLL) {
                lastPointerWinX = event.getX();
                lastPointerWinY = event.getY();
                isMousePointerMode = true;
                float vScroll = event.getAxisValue(MotionEvent.AXIS_VSCROLL);
                float hScroll = event.getAxisValue(MotionEvent.AXIS_HSCROLL);
                if ((vScroll != 0f || hScroll != 0f) && this.bridge != null && this.bridge.getWebView() != null) {
                    float[] coords = getWebViewCoordsFromWindow(lastPointerWinX, lastPointerWinY);
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
            (source & InputDevice.SOURCE_CLASS_POINTER) != 0 && toolType == MotionEvent.TOOL_TYPE_MOUSE ||
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

        float density = getResources().getDisplayMetrics().density;
        float jitterSlopPx = 22f * (density > 0 ? density : 2f);

        if (action == MotionEvent.ACTION_DOWN) {
            mouseDownWinX = event.getX();
            mouseDownWinY = event.getY();
            mouseDownTime = event.getEventTime();
            mouseDownButtonState = event.getButtonState();
            mouseExceededSlop = false;

            if (isMouseOrPointer) {
                lastPointerWinX = event.getX();
                lastPointerWinY = event.getY();
                lastHoverTimestamp = SystemClock.uptimeMillis();
                isMousePointerMode = true;
            }
            notifyJsMouseHover(mouseDownWinX, mouseDownWinY);
        } else if (action == MotionEvent.ACTION_MOVE) {
            float dist = (float) Math.hypot(event.getX() - mouseDownWinX, event.getY() - mouseDownWinY);
            if (!mouseExceededSlop && dist < jitterSlopPx) {
                if (isMouseOrPointer) {
                    // Stabilize Air Mouse / Projector Mouse hand tremor in-place without changing source or toolType!
                    event.setLocation(mouseDownWinX, mouseDownWinY);
                }
            } else {
                mouseExceededSlop = true;
            }
        } else if (action == MotionEvent.ACTION_UP) {
            if (!mouseExceededSlop && isMouseOrPointer) {
                event.setLocation(mouseDownWinX, mouseDownWinY);
            }
        }

        // Always pass the genuine native event to super.dispatchTouchEvent so WebView's native mouse/touch pipeline stays intact!
        boolean handled = super.dispatchTouchEvent(event);

        // 1. YouTube-style Edge & Center Double-Tap Detection across ALL video players (Native, Embed & Torrents)!
        if (action == MotionEvent.ACTION_UP && !mouseExceededSlop) {
            long now = SystemClock.uptimeMillis();
            if (now - lastTapTime < 330) {
                float tapDist = (float) Math.hypot(event.getX() - lastTapWinX, event.getY() - lastTapWinY);
                if (tapDist < jitterSlopPx * 2.2f) {
                    float[] coords = getWebViewCoordsFromWindow(event.getX(), event.getY());
                    if (coords != null && this.bridge != null && this.bridge.getWebView() != null) {
                        float normX = coords[0];
                        String side = (normX < 0.32f) ? "left" : (normX > 0.68f) ? "right" : "center";
                        String doubleTapJs = String.format(
                            Locale.US,
                            "window.dispatchEvent(new CustomEvent('cinema-double-tap', { detail: { side: '%s', normX: %.4f } }));",
                            side,
                            normX
                        );
                        this.bridge.getWebView().evaluateJavascript(doubleTapJs, null);
                    }
                    lastTapTime = 0L;
                } else {
                    lastTapTime = now;
                    lastTapWinX = event.getX();
                    lastTapWinY = event.getY();
                }
            } else {
                lastTapTime = now;
                lastTapWinX = event.getX();
                lastTapWinY = event.getY();
            }
        }

        // 2. ONLY synthesize smart click for physical Mouse / Air Mouse / Pointer devices where buttonState was 0!
        // NEVER for regular touchscreen taps, because WebView already dispatches genuine touch events natively!
        if (isMouseOrPointer && action == MotionEvent.ACTION_UP && !mouseExceededSlop) {
            boolean needsIframeFingerFallback = (mouseDownButtonState == 0);
            triggerSmartClickAtWindowCoords(mouseDownWinX, mouseDownWinY, needsIframeFingerFallback);
        }

        return handled;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event == null) return false;
        int keyCode = event.getKeyCode();
        int action = event.getAction();
        long now = SystemClock.uptimeMillis();

        // 1. Handle D-Pad Directional Keys directly via JS bridge so cross-origin iframes
        // in VideoPlayer / SportsHub can NEVER trap or swallow remote control navigation!
        if (
            keyCode == KeyEvent.KEYCODE_DPAD_UP ||
            keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
            keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
            keyCode == KeyEvent.KEYCODE_DPAD_RIGHT
        ) {
            // Only exit mouse pointer mode if no mouse hover move happened in the last 1200ms
            // (Projector remotes in Mouse Mode often emit D-Pad keys while moving the hover cursor!)
            if (now - lastHoverTimestamp > 1200) {
                isMousePointerMode = false;
            }
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

        // 2. Handle OK / Enter / Center button for BOTH Projector Mouse Mode and D-Pad Mode!
        if (
            keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
            keyCode == KeyEvent.KEYCODE_ENTER ||
            keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
            keyCode == KeyEvent.KEYCODE_BUTTON_A ||
            keyCode == KeyEvent.KEYCODE_BUTTON_SELECT
        ) {
            boolean activeHoverCursor =
                isMousePointerMode &&
                lastPointerWinX >= 0 &&
                lastPointerWinY >= 0 &&
                (now - lastHoverTimestamp) < 30000;

            if (activeHoverCursor) {
                if (action == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                    synthesizeAsyncWebViewTapAtWindowCoords(lastPointerWinX, lastPointerWinY);
                }
                return true;
            } else {
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

        // 2.5 Hardware Back & Escape Keys (ensures remotes/projectors can ALWAYS exit fullscreen or player!)
        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
            if (action == KeyEvent.ACTION_UP) {
                if (customFullscreenView != null) {
                    exitCustomFullscreenView();
                    return true;
                }
                if (this.bridge != null && this.bridge.getWebView() != null) {
                    this.bridge.getWebView().evaluateJavascript(
                        "(function(){ " +
                        "  if (typeof window.__cinemaHandlePlayerBack === 'function' && window.__cinemaHandlePlayerBack()) return 'handled'; " +
                        "  if (typeof window.__cinemaHandleBack === 'function' && window.__cinemaHandleBack()) return 'handled'; " +
                        "  return 'unhandled'; " +
                        "})()",
                        value -> {
                            if (value == null || value.contains("unhandled")) {
                                runOnUiThread(() -> moveTaskToBack(true));
                            }
                        }
                    );
                    return true;
                }
            }
            return true; // Consume ACTION_DOWN to avoid iframe/system swallowing
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
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            try {
                startActivity(installIntent);
                notifyApkProgress("ready", 100, "Вікно встановлення відкрито! Натисніть «Оновити / Встановити».");
                return;
            } catch (Exception firstErr) {
                Intent fallbackInstall = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                fallbackInstall.setData(apkUri);
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
                float localX = Math.max(0f, Math.min(1f, normX)) * webView.getWidth();
                float localY = Math.max(0f, Math.min(1f, normY)) * webView.getHeight();
                dispatchAsyncFingerTapToWebView(localX, localY);
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
                        "https://github.com/zod4ix/cinemavault-android/raw/main/CinemaVault-PRO-v3.6.3.apk"
                    );
                }
            });
        }
    }
}
