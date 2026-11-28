package net.cinemavault.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Hardware-accelerated native Media3 ExoPlayer overlay for Smart TVs, Projectors & Android devices.
 * Renders directly onto a SurfaceView (with optional TV tunneling) while hiding WebView compositing overhead.
 */
public class NativeVideoOverlay {

    public interface Listener {
        void onProgress(double currentSec, double durationSec, boolean isPlaying);
        void onClosed(double currentSec, double durationSec, boolean fallbackToWeb);
        void onError(String message);
    }

    private final Activity activity;
    private final FrameLayout rootContainer;
    private final PlayerView playerView;
    private final LinearLayout topBar;
    private final TextView titleView;
    private final TextView subtitleView;
    private final TextView osdView;
    private final ProgressBar loadingSpinner;
    private final Button backBtn;
    private final Button audioBtn;
    private final Button subBtn;
    private final Button aspectBtn;
    private final Button webFallbackBtn;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Listener listener;

    private ExoPlayer player;
    private DefaultTrackSelector trackSelector;
    private boolean isShowing = false;
    private boolean isLive = false;
    private boolean appliedInitialAudio = false;
    private int preferredAudioIndex = -1;
    private final List<String> audioLabels = new ArrayList<>();
    private int currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;

    private final Runnable progressTicker = new Runnable() {
        @Override
        public void run() {
            if (!isShowing || player == null) return;
            double curSec = Math.max(0.0, player.getCurrentPosition() / 1000.0);
            long durMs = player.getDuration();
            double durSec = durMs > 0 ? durMs / 1000.0 : 0.0;
            listener.onProgress(curSec, durSec, player.isPlaying());
            mainHandler.postDelayed(this, 2000);
        }
    };

    private final Runnable hideOsdTask = new Runnable() {
        @Override
        public void run() {
            osdView.setVisibility(View.GONE);
        }
    };

    public NativeVideoOverlay(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;

        rootContainer = new FrameLayout(activity);
        rootContainer.setBackgroundColor(Color.BLACK);
        rootContainer.setVisibility(View.GONE);
        rootContainer.setFocusable(true);
        rootContainer.setFocusableInTouchMode(true);

        playerView = new PlayerView(activity);
        playerView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        playerView.setBackgroundColor(Color.BLACK);
        playerView.setUseController(true);
        playerView.setControllerShowTimeoutMs(3600);
        playerView.setControllerHideOnTouch(true);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
        playerView.setKeepScreenOn(true);
        rootContainer.addView(playerView);

        // Top HUD Bar (visible together with PlayerView controller)
        topBar = new LinearLayout(activity);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        int padH = dp(16);
        int padV = dp(12);
        topBar.setPadding(padH, padV, padH, padV);
        GradientDrawable topGrad = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] { Color.parseColor("#E607090E"), Color.parseColor("#6607090E"), Color.TRANSPARENT }
        );
        topBar.setBackground(topGrad);

        backBtn = createHudButton("← Назад", Color.parseColor("#33FFFFFF"));
        backBtn.setOnClickListener(v -> close(false));

        LinearLayout titleBox = new LinearLayout(activity);
        titleBox.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
        );
        titleParams.setMargins(dp(14), 0, dp(14), 0);
        titleBox.setLayoutParams(titleParams);

        titleView = new TextView(activity);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);

        subtitleView = new TextView(activity);
        subtitleView.setTextColor(Color.parseColor("#94A3B8"));
        subtitleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        subtitleView.setSingleLine(true);
        subtitleView.setEllipsize(TextUtils.TruncateAt.END);

        titleBox.addView(titleView);
        titleBox.addView(subtitleView);

        audioBtn = createHudButton("🎙 Озвучка", Color.parseColor("#CC1D4ED8"));
        audioBtn.setOnClickListener(v -> showAudioDialog());

        subBtn = createHudButton("💬 Субтитри", Color.parseColor("#44FFFFFF"));
        subBtn.setOnClickListener(v -> showSubtitleDialog());

        aspectBtn = createHudButton("🖵 Екран", Color.parseColor("#44FFFFFF"));
        aspectBtn.setOnClickListener(v -> cycleAspectMode());

        webFallbackBtn = createHudButton("🌐 Веб-плеєр", Color.parseColor("#44FFFFFF"));
        webFallbackBtn.setOnClickListener(v -> close(true));

        topBar.addView(backBtn);
        topBar.addView(titleBox);
        topBar.addView(audioBtn);
        topBar.addView(subBtn);
        topBar.addView(aspectBtn);
        topBar.addView(webFallbackBtn);

        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        );
        rootContainer.addView(topBar, topParams);

        // Center OSD feedback pill
        osdView = new TextView(activity);
        osdView.setTextColor(Color.WHITE);
        osdView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        osdView.setTypeface(Typeface.DEFAULT_BOLD);
        osdView.setPadding(dp(18), dp(10), dp(18), dp(10));
        GradientDrawable osdBg = new GradientDrawable();
        osdBg.setColor(Color.parseColor("#D90B101D"));
        osdBg.setCornerRadius(dp(24));
        osdBg.setStroke(dp(1), Color.parseColor("#44FFFFFF"));
        osdView.setBackground(osdBg);
        osdView.setVisibility(View.GONE);
        FrameLayout.LayoutParams osdParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER_HORIZONTAL | Gravity.TOP
        );
        osdParams.topMargin = dp(76);
        rootContainer.addView(osdView, osdParams);

        // Initial buffering spinner
        loadingSpinner = new ProgressBar(activity);
        loadingSpinner.setIndeterminate(true);
        FrameLayout.LayoutParams spinParams = new FrameLayout.LayoutParams(
            dp(54), dp(54), Gravity.CENTER
        );
        rootContainer.addView(loadingSpinner, spinParams);

        playerView.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> {
            topBar.setVisibility(visibility == View.VISIBLE ? View.VISIBLE : View.GONE);
        });
    }

    public View getRootView() {
        return rootContainer;
    }

    public boolean isShowing() {
        return isShowing;
    }

    private int dp(int val) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, val, activity.getResources().getDisplayMetrics()
        ));
    }

    private Button createHudButton(String text, int bgColor) {
        Button btn = new Button(activity);
        btn.setText(text);
        btn.setAllCaps(false);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setPadding(dp(12), dp(6), dp(12), dp(6));
        btn.setMinimumHeight(dp(36));
        btn.setMinimumWidth(0);
        btn.setFocusable(true);
        btn.setFocusableInTouchMode(false);

        GradientDrawable normal = new GradientDrawable();
        normal.setColor(bgColor);
        normal.setCornerRadius(dp(10));
        normal.setStroke(dp(1), Color.parseColor("#33FFFFFF"));

        GradientDrawable focused = new GradientDrawable();
        focused.setColor(Color.parseColor("#DC2626"));
        focused.setCornerRadius(dp(10));
        focused.setStroke(dp(2), Color.WHITE);

        android.graphics.drawable.StateListDrawable states = new android.graphics.drawable.StateListDrawable();
        states.addState(new int[] { android.R.attr.state_focused }, focused);
        states.addState(new int[] { android.R.attr.state_pressed }, focused);
        states.addState(new int[] {}, normal);
        btn.setBackground(states);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        lp.setMarginStart(dp(8));
        btn.setLayoutParams(lp);
        return btn;
    }

    public void showAndPlay(String url, String title, String subtitle, double startSeconds,
                            String referer, String audioLabelsJson, int preferredAudioIdx,
                            String subtitlesJson, boolean liveStream, boolean isTvDevice) {
        mainHandler.post(() -> {
            releasePlayerOnly();

            isShowing = true;
            isLive = liveStream;
            appliedInitialAudio = false;
            preferredAudioIndex = preferredAudioIdx;
            audioLabels.clear();

            if (!TextUtils.isEmpty(audioLabelsJson)) {
                try {
                    JSONArray arr = new JSONArray(audioLabelsJson);
                    for (int i = 0; i < arr.length(); i++) {
                        audioLabels.add(arr.optString(i, "Доріжка " + (i + 1)));
                    }
                } catch (Exception ignored) {}
            }

            titleView.setText(TextUtils.isEmpty(title) ? "CinemaVault PRO" : title);
            subtitleView.setText(subtitle != null ? subtitle : "");
            subtitleView.setVisibility(TextUtils.isEmpty(subtitle) ? View.GONE : View.VISIBLE);
            audioBtn.setVisibility(liveStream && audioLabels.isEmpty() ? View.GONE : View.VISIBLE);
            loadingSpinner.setVisibility(View.VISIBLE);
            rootContainer.setVisibility(View.VISIBLE);
            rootContainer.bringToFront();

            DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(12000, 45000, 750, 1500)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build();

            trackSelector = new DefaultTrackSelector(activity);
            DefaultTrackSelector.Parameters.Builder paramBuilder = trackSelector.buildUponParameters()
                .setPreferredAudioLanguage("uk");
            if (isTvDevice) {
                paramBuilder.setTunnelingEnabled(true);
            }
            trackSelector.setParameters(paramBuilder);

            Map<String, String> headers = new HashMap<>();
            headers.put(
                "User-Agent",
                "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
            );
            if (!TextUtils.isEmpty(referer)) {
                headers.put("Referer", referer);
                try {
                    Uri refUri = Uri.parse(referer);
                    if (refUri.getScheme() != null && refUri.getHost() != null) {
                        headers.put("Origin", refUri.getScheme() + "://" + refUri.getHost());
                    }
                } catch (Exception ignored) {}
            }

            DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                .setDefaultRequestProperties(headers)
                .setConnectTimeoutMs(8000)
                .setReadTimeoutMs(10000)
                .setAllowCrossProtocolRedirects(true);

            player = new ExoPlayer.Builder(activity)
                .setLoadControl(loadControl)
                .setTrackSelector(trackSelector)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(httpFactory))
                .build();

            playerView.setPlayer(player);

            MediaItem.Builder itemBuilder = new MediaItem.Builder().setUri(Uri.parse(url));
            if (url.contains(".m3u8")) {
                itemBuilder.setMimeType(MimeTypes.APPLICATION_M3U8);
            }

            if (!TextUtils.isEmpty(subtitlesJson)) {
                try {
                    JSONArray subArr = new JSONArray(subtitlesJson);
                    List<MediaItem.SubtitleConfiguration> subs = new ArrayList<>();
                    for (int i = 0; i < subArr.length(); i++) {
                        JSONObject o = subArr.optJSONObject(i);
                        if (o == null) continue;
                        String sUrl = o.optString("url", "");
                        String sName = o.optString("name", "Subtitles " + (i + 1));
                        if (!sUrl.startsWith("http")) continue;
                        String lang = sName.toLowerCase().contains("укр") ? "uk"
                            : sName.toLowerCase().contains("eng") ? "en" : "und";
                        subs.add(new MediaItem.SubtitleConfiguration.Builder(Uri.parse(sUrl))
                            .setMimeType(MimeTypes.TEXT_VTT)
                            .setLanguage(lang)
                            .setLabel(sName)
                            .build());
                    }
                    if (!subs.isEmpty()) {
                        itemBuilder.setSubtitleConfigurations(subs);
                    }
                } catch (Exception ignored) {}
            }

            player.setMediaItem(itemBuilder.build());
            if (!liveStream && startSeconds > 3.0) {
                player.seekTo(Math.round(startSeconds * 1000.0));
            }

            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    if (playbackState == Player.STATE_BUFFERING) {
                        loadingSpinner.setVisibility(View.VISIBLE);
                    } else if (playbackState == Player.STATE_READY) {
                        loadingSpinner.setVisibility(View.GONE);
                        if (!appliedInitialAudio) {
                            appliedInitialAudio = true;
                            applyPreferredAudioTrack();
                        }
                    } else if (playbackState == Player.STATE_ENDED) {
                        loadingSpinner.setVisibility(View.GONE);
                    }
                }

                @Override
                public void onTracksChanged(Tracks tracks) {
                    updateAudioButtonVisibility(tracks);
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    loadingSpinner.setVisibility(View.GONE);
                    String msg = error.getMessage() != null ? error.getMessage() : "ExoPlayer error";
                    closeWithError(msg);
                }
            });

            player.prepare();
            player.play();
            playerView.hideController();
            rootContainer.requestFocus();
            showOsd("⚡ Нативний ExoPlayer • " + (liveStream ? "LIVE" : "FHD"));

            mainHandler.removeCallbacks(progressTicker);
            mainHandler.postDelayed(progressTicker, 2000);
        });
    }

    private void updateAudioButtonVisibility(Tracks tracks) {
        int audioCount = 0;
        for (Tracks.Group g : tracks.getGroups()) {
            if (g.getType() == C.TRACK_TYPE_AUDIO && g.isSupported()) {
                audioCount += g.length;
            }
        }
        audioBtn.setVisibility(audioCount > 1 || !audioLabels.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private void applyPreferredAudioTrack() {
        if (player == null || trackSelector == null || preferredAudioIndex < 0) return;
        Tracks tracks = player.getCurrentTracks();
        List<TrackSelectionEntry> entries = collectTrackEntries(tracks, C.TRACK_TYPE_AUDIO);
        if (preferredAudioIndex < entries.size()) {
            TrackSelectionEntry target = entries.get(preferredAudioIndex);
            selectTrackEntry(C.TRACK_TYPE_AUDIO, target);
            String label = preferredAudioIndex < audioLabels.size()
                ? audioLabels.get(preferredAudioIndex)
                : "Українська";
            showOsd("🇺🇦 Озвучка: " + label);
        }
    }

    private static class TrackSelectionEntry {
        final TrackGroup group;
        final int trackIndex;
        final String label;
        final boolean selected;

        TrackSelectionEntry(TrackGroup group, int trackIndex, String label, boolean selected) {
            this.group = group;
            this.trackIndex = trackIndex;
            this.label = label;
            this.selected = selected;
        }
    }

    private List<TrackSelectionEntry> collectTrackEntries(Tracks tracks, int trackType) {
        List<TrackSelectionEntry> list = new ArrayList<>();
        int idx = 0;
        for (Tracks.Group g : tracks.getGroups()) {
            if (g.getType() != trackType) continue;
            for (int i = 0; i < g.length; i++) {
                if (!g.isTrackSupported(i)) continue;
                Format fmt = g.getTrackFormat(i);
                String label;
                if (trackType == C.TRACK_TYPE_AUDIO && idx < audioLabels.size()) {
                    label = audioLabels.get(idx);
                } else if (!TextUtils.isEmpty(fmt.label)) {
                    label = fmt.label;
                } else if (!TextUtils.isEmpty(fmt.language)) {
                    label = fmt.language.toUpperCase();
                } else {
                    label = (trackType == C.TRACK_TYPE_AUDIO ? "Аудіо " : "Субтитри ") + (idx + 1);
                }
                list.add(new TrackSelectionEntry(g.getMediaTrackGroup(), i, label, g.isTrackSelected(i)));
                idx++;
            }
        }
        return list;
    }

    private void selectTrackEntry(int trackType, TrackSelectionEntry entry) {
        if (trackSelector == null) return;
        DefaultTrackSelector.Parameters.Builder builder = trackSelector.buildUponParameters();
        builder.setTrackTypeDisabled(trackType, false);
        builder.clearOverridesOfType(trackType);
        builder.addOverride(new TrackSelectionOverride(entry.group, entry.trackIndex));
        trackSelector.setParameters(builder);
    }

    private void showAudioDialog() {
        if (player == null) return;
        List<TrackSelectionEntry> entries = collectTrackEntries(player.getCurrentTracks(), C.TRACK_TYPE_AUDIO);
        if (entries.isEmpty()) {
            showOsd("Доступна лише 1 аудіодоріжка");
            return;
        }
        String[] labels = new String[entries.size()];
        int checked = 0;
        for (int i = 0; i < entries.size(); i++) {
            labels[i] = entries.get(i).label;
            if (entries.get(i).selected) checked = i;
        }
        new AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("🎙 Вибір озвучення")
            .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                selectTrackEntry(C.TRACK_TYPE_AUDIO, entries.get(which));
                showOsd("🎙 " + entries.get(which).label);
                dialog.dismiss();
            })
            .setNegativeButton("Скасувати", null)
            .show();
    }

    private void showSubtitleDialog() {
        if (player == null) return;
        List<TrackSelectionEntry> entries = collectTrackEntries(player.getCurrentTracks(), C.TRACK_TYPE_TEXT);
        String[] labels = new String[entries.size() + 1];
        labels[0] = "Вимкнено";
        int checked = 0;
        for (int i = 0; i < entries.size(); i++) {
            labels[i + 1] = entries.get(i).label;
            if (entries.get(i).selected) checked = i + 1;
        }
        new AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("💬 Субтитри")
            .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                if (which == 0) {
                    if (trackSelector != null) {
                        trackSelector.setParameters(
                            trackSelector.buildUponParameters().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                        );
                    }
                    showOsd("💬 Субтитри вимкнено");
                } else {
                    selectTrackEntry(C.TRACK_TYPE_TEXT, entries.get(which - 1));
                    showOsd("💬 " + entries.get(which - 1).label);
                }
                dialog.dismiss();
            })
            .setNegativeButton("Скасувати", null)
            .show();
    }

    private void cycleAspectMode() {
        if (currentResizeMode == AspectRatioFrameLayout.RESIZE_MODE_FIT) {
            currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM;
            showOsd("🖵 Екран: Заповнити (Zoom)");
        } else if (currentResizeMode == AspectRatioFrameLayout.RESIZE_MODE_ZOOM) {
            currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FILL;
            showOsd("🖵 Екран: Розтягнути (16:9)");
        } else {
            currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;
            showOsd("🖵 Екран: Оригінал (Fit)");
        }
        playerView.setResizeMode(currentResizeMode);
    }

    private void showOsd(String msg) {
        mainHandler.removeCallbacks(hideOsdTask);
        osdView.setText(msg);
        osdView.setVisibility(View.VISIBLE);
        mainHandler.postDelayed(hideOsdTask, 1800);
    }

    public boolean handleKeyEvent(KeyEvent event) {
        if (!isShowing || event == null) return false;
        int keyCode = event.getKeyCode();
        int action = event.getAction();

        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
            if (action == KeyEvent.ACTION_UP) {
                close(false);
            }
            return true;
        }

        if (action == KeyEvent.ACTION_DOWN) {
            boolean controllerVisible = playerView.isControllerFullyVisible();

            if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE ||
                keyCode == KeyEvent.KEYCODE_MEDIA_PLAY ||
                keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE) {
                if (player != null) {
                    if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY) player.play();
                    else if (keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE) player.pause();
                    else if (player.isPlaying()) player.pause();
                    else player.play();
                    showOsd(player.isPlaying() ? "▶ Відтворення" : "⏸ Пауза");
                    playerView.showController();
                }
                return true;
            }

            if ((keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) && !controllerVisible) {
                if (player != null) {
                    if (player.isPlaying()) {
                        player.pause();
                        showOsd("⏸ Пауза");
                    } else {
                        player.play();
                        showOsd("▶ Відтворення");
                    }
                    playerView.showController();
                }
                return true;
            }

            if ((keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_MEDIA_REWIND) && !controllerVisible) {
                if (player != null && !isLive) {
                    long target = Math.max(0, player.getCurrentPosition() - 10_000);
                    player.seekTo(target);
                    showOsd("⏪ -10с");
                } else {
                    playerView.showController();
                }
                return true;
            }

            if ((keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) && !controllerVisible) {
                if (player != null && !isLive) {
                    long dur = player.getDuration();
                    long target = dur > 0 ? Math.min(dur, player.getCurrentPosition() + 10_000) : player.getCurrentPosition() + 10_000;
                    player.seekTo(target);
                    showOsd("⏩ +10с");
                } else {
                    playerView.showController();
                }
                return true;
            }

            if ((keyCode == KeyEvent.KEYCODE_DPAD_UP || keyCode == KeyEvent.KEYCODE_DPAD_DOWN) && !controllerVisible) {
                playerView.showController();
                if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    audioBtn.requestFocus();
                }
                return true;
            }
        }

        return rootContainer.dispatchKeyEvent(event);
    }

    public void close(boolean fallbackToWeb) {
        mainHandler.post(() -> {
            if (!isShowing) return;
            double curSec = player != null ? Math.max(0.0, player.getCurrentPosition() / 1000.0) : 0.0;
            double durSec = (player != null && player.getDuration() > 0) ? player.getDuration() / 1000.0 : 0.0;
            releasePlayerOnly();
            isShowing = false;
            rootContainer.setVisibility(View.GONE);
            listener.onClosed(curSec, durSec, fallbackToWeb);
        });
    }

    private void closeWithError(String reason) {
        mainHandler.post(() -> {
            if (!isShowing) return;
            releasePlayerOnly();
            isShowing = false;
            rootContainer.setVisibility(View.GONE);
            listener.onError(reason);
        });
    }

    public void releasePlayerOnly() {
        mainHandler.removeCallbacks(progressTicker);
        mainHandler.removeCallbacks(hideOsdTask);
        if (player != null) {
            try {
                player.stop();
                player.release();
            } catch (Exception ignored) {}
            player = null;
        }
        playerView.setPlayer(null);
    }

    public void onPause() {
        if (player != null && player.isPlaying()) {
            player.pause();
        }
    }
}
