import React, { useEffect, useRef, useState, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX,
  Maximize, Minimize, ArrowLeft, Settings, Check, Radio,
  Server, SkipForward, SkipBack, Smartphone, Link2
} from 'lucide-react';
import { MediaItem, AudioTrack, StreamQuality, StreamServer } from '../types/movie';
import { buildServersForMedia } from '../services/rezka';
import { storageService } from '../services/storage';
import { useLanguage } from '../i18n/LanguageContext';

declare global {
  interface Window {
    AndroidCinemaBridge?: {
      setPlayerFullscreen: (fullscreen: boolean) => void;
    };
  }
}

interface VideoPlayerProps {
  media: MediaItem;
  title: string;
  subtitle?: string;
  qualities: StreamQuality[];
  audioTracks: AudioTrack[];
  embedUrl?: string;
  servers?: StreamServer[];
  initialMode?: 'native' | 'embed' | 'trailer';
  onClose: () => void;
  episodeId?: string | number;
  seasonNumber?: number;
  episodeNumber?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  media,
  title,
  subtitle,
  qualities,
  audioTracks,
  embedUrl,
  initialMode = 'embed',
  onClose,
  episodeId,
  seasonNumber: initialSeason,
  episodeNumber: initialEpisode,
}) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const isSeries = media.mediaType === 'tv' || media.mediaType === 'anime';
  const [activeSeason, setActiveSeason] = useState<number>(initialSeason || 1);
  const [activeEpisode, setActiveEpisode] = useState<number>(initialEpisode || 1);
  const [isLandscapeLocked, setIsLandscapeLocked] = useState<boolean>(false);

  // Dynamically build all servers for current movie or season/episode
  const availableServers = useMemo(
    () => buildServersForMedia(media, activeSeason, activeEpisode),
    [media, activeSeason, activeEpisode]
  );

  // Determine initial server based on embedUrl or initialMode
  const getInitialServerId = () => {
    if (initialMode === 'native') return 'native-hls';
    if (initialMode === 'trailer') {
      const tr = availableServers.find((s) => s.mode === 'trailer');
      if (tr) return tr.id;
    }
    if (embedUrl) {
      const matched = availableServers.find((s) => embedUrl.includes(s.url.split('?')[0]));
      if (matched) return matched.id;
    }
    return availableServers[0]?.id || 'native-hls';
  };

  const [selectedServerId, setSelectedServerId] = useState<string>(getInitialServerId);
  const activeServer =
    availableServers.find((s) => s.id === selectedServerId) || availableServers[0];

  const nonEmbedQualities = qualities.filter((q) => !q.isEmbed);
  const [customStreamUrl, setCustomStreamUrl] = useState<string>('');
  const [showCustomUrlInput, setShowCustomUrlInput] = useState<boolean>(false);

  const defaultNativeUrl =
    nonEmbedQualities[0]?.url ||
    availableServers.find((s) => s.mode === 'native')?.url ||
    media.streamUrl ||
    '';

  const [selectedQuality, setSelectedQuality] = useState<StreamQuality>(
    nonEmbedQualities[0] || { label: '1080p', url: defaultNativeUrl }
  );
  const [selectedAudio, setSelectedAudio] = useState<AudioTrack>(
    audioTracks[0] || { id: 'default', name: 'Український Дубляж', language: 'uk' }
  );

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showSettingsMenu, setShowSettingsMenu] = useState<'none' | 'quality' | 'audio'>('none');
  const [bufferedEnd, setBufferedEnd] = useState<number>(0);
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ensure landscape lock is released when closing player
  useEffect(() => {
    return () => {
      try {
        window.AndroidCinemaBridge?.setPlayerFullscreen(false);
      } catch {
        // Ignore on desktop browser
      }
    };
  }, []);

  useEffect(() => {
    setIframeLoading(true);
  }, [activeServer?.url]);

  const toggleAndroidLandscape = () => {
    const next = !isLandscapeLocked;
    setIsLandscapeLocked(next);
    try {
      if (window.AndroidCinemaBridge) {
        window.AndroidCinemaBridge.setPlayerFullscreen(next);
      } else if (containerRef.current) {
        if (next && !document.fullscreenElement) {
          containerRef.current.requestFullscreen().catch(() => {});
        } else if (!next && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    } catch {
      // Ignore
    }
  };

  // Initialize native HTML5 / HLS playback when in 'native' server mode
  useEffect(() => {
    if (!activeServer || activeServer.mode !== 'native') return;
    const video = videoRef.current;
    const streamToPlay = customStreamUrl.trim() || selectedQuality.url || activeServer.url;
    if (!video || !streamToPlay) return;

    const saved = storageService.getProgress(media.id, episodeId);
    const initialTime =
      saved?.currentTime && saved.currentTime < saved.duration - 15 ? saved.currentTime : 0;

    if (Hls.isSupported() && streamToPlay.includes('.m3u8')) {
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hlsRef.current = hls;
      hls.loadSource(streamToPlay);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (initialTime > 0) video.currentTime = initialTime;
        video.play().catch(() => setIsPlaying(false));
      });
    } else {
      video.src = streamToPlay;
      if (initialTime > 0) video.currentTime = initialTime;
      video.play().catch(() => setIsPlaying(false));
    }

    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [activeServer, selectedQuality.url, customStreamUrl, media.id, episodeId]);

  // Save watch history immediately & periodically
  useEffect(() => {
    storageService.saveProgress({
      mediaId: media.id,
      episodeId: isSeries ? `${media.id}-s${activeSeason}e${activeEpisode}` : episodeId,
      seasonNumber: isSeries ? activeSeason : undefined,
      episodeNumber: isSeries ? activeEpisode : undefined,
      currentTime: currentTime || 30,
      duration: duration || (media.duration ? media.duration * 60 : 5400),
      lastUpdated: Date.now(),
      title,
      posterPath: media.posterPath,
      mediaSnapshot: media,
    });

    const interval = setInterval(() => {
      if (videoRef.current && duration > 0 && activeServer?.mode === 'native') {
        storageService.saveProgress({
          mediaId: media.id,
          episodeId: isSeries ? `${media.id}-s${activeSeason}e${activeEpisode}` : episodeId,
          seasonNumber: isSeries ? activeSeason : undefined,
          episodeNumber: isSeries ? activeEpisode : undefined,
          currentTime: videoRef.current.currentTime,
          duration,
          lastUpdated: Date.now(),
          title,
          posterPath: media.posterPath,
          mediaSnapshot: media,
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [media, episodeId, activeSeason, activeEpisode, isSeries, duration, title, activeServer?.mode]);

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && activeServer?.mode === 'native') {
        setShowControls(false);
        setShowSettingsMenu('none');
      }
    }, 3500);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    resetControlsTimeout();
  };

  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
    resetControlsTimeout();
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const targetTime = parseFloat(e.target.value);
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
    resetControlsTimeout();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    resetControlsTimeout();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
    resetControlsTimeout();
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
    resetControlsTimeout();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if (h > 0) {
      return `${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
      className="fixed inset-0 z-50 bg-black flex flex-col select-none overflow-hidden"
    >
      {/* DEDICATED TOP HEADER BAR (Never overlaps iframe controls; compact on mobile) */}
      <div className="shrink-0 z-30 bg-[#07090e] border-b border-white/10 px-2.5 sm:px-4 py-2 space-y-2">
        {/* Row 1: Back, Title, Episode Controls, Rotate/Fullscreen */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-red-600 text-white transition-all active:scale-95 shrink-0"
              aria-label="Закрити плеєр"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-white font-bold text-xs sm:text-base truncate">{title}</h2>
              <p className="text-[10px] sm:text-xs text-amber-400 font-medium truncate">
                {isSeries
                  ? `Сезон ${activeSeason} • Серія ${activeEpisode}`
                  : subtitle || `${media.year} • ${media.quality || '1080p HD'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Season/Episode Switcher for Series & Anime */}
            {isSeries && (
              <div className="flex items-center gap-1 bg-white/5 px-1.5 py-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setActiveEpisode((prev) => Math.max(1, prev - 1))}
                  disabled={activeEpisode <= 1}
                  className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-30 text-white"
                  title="Попередня серія"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <select
                  value={activeSeason}
                  onChange={(e) => {
                    setActiveSeason(Number(e.target.value));
                    setActiveEpisode(1);
                  }}
                  className="bg-transparent text-[11px] font-bold text-amber-400 focus:outline-none"
                >
                  {Array.from({ length: Math.max(media.seasonsCount || 4, activeSeason) }, (_, i) => i + 1).map(
                    (sNum) => (
                      <option key={sNum} value={sNum} className="bg-slate-900 text-white">
                        С{sNum}
                      </option>
                    )
                  )}
                </select>
                <span className="text-[11px] text-slate-400">:</span>
                <select
                  value={activeEpisode}
                  onChange={(e) => setActiveEpisode(Number(e.target.value))}
                  className="bg-transparent text-[11px] font-bold text-white focus:outline-none"
                >
                  {Array.from({ length: 26 }, (_, i) => i + 1).map((eNum) => (
                    <option key={eNum} value={eNum} className="bg-slate-900 text-white">
                      Е{eNum}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setActiveEpisode((prev) => prev + 1)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white"
                  title="Наступна серія"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Rotate Phone to Landscape / Fullscreen Button */}
            <button
              onClick={toggleAndroidLandscape}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition-all ${
                isLandscapeLocked
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-white/10 text-slate-200 border-white/15 hover:bg-white/20'
              }`}
              title="Повернути екран горизонтально"
            >
              <Smartphone className={`w-3.5 h-3.5 ${isLandscapeLocked ? 'rotate-90' : ''} transition-transform`} />
              <span className="hidden sm:inline">{isLandscapeLocked ? 'Звичайний' : 'Горизонтально'}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Multi-Server Switcher Pills (Scrollable on Phone!) */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 shrink-0 mr-1">
            <Server className="w-3 h-3 text-red-500" /> Сервер:
          </span>
          {availableServers.map((srv) => {
            const active = activeServer?.id === srv.id;
            return (
              <button
                key={srv.id}
                onClick={() => setSelectedServerId(srv.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap flex items-center gap-1.5 border transition-all shrink-0 ${
                  active
                    ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30'
                    : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/15 hover:text-white'
                }`}
              >
                <span>{srv.name}</span>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded ${
                    active ? 'bg-black/30 text-amber-300' : 'bg-white/10 text-slate-400'
                  }`}
                >
                  {srv.badge}
                </span>
              </button>
            );
          })}

          {activeServer?.mode === 'native' && (
            <button
              onClick={() => setShowCustomUrlInput(!showCustomUrlInput)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap flex items-center gap-1 shrink-0"
            >
              <Link2 className="w-3 h-3" /> Власний .m3u8/.mp4
            </button>
          )}
        </div>

        {/* Optional Custom Stream URL Bar */}
        {showCustomUrlInput && activeServer?.mode === 'native' && (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="url"
              value={customStreamUrl}
              onChange={(e) => setCustomStreamUrl(e.target.value)}
              placeholder="Вставте пряме посилання на потік (.m3u8, .mp4, TorrServe)..."
              className="flex-1 bg-black/60 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500"
            />
            <button
              onClick={() => setShowCustomUrlInput(false)}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
            >
              OK
            </button>
          </div>
        )}
      </div>

      {/* MAIN VIDEO VIEWPORT */}
      <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
        {activeServer && activeServer.mode !== 'native' ? (
          <>
            {iframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#05070c] z-10 pointer-events-none">
                <div className="w-11 h-11 rounded-full border-4 border-red-600/30 border-t-red-600 animate-spin" />
                <p className="text-xs text-slate-300 font-medium">
                  Підключення до <span className="text-amber-400 font-bold">{activeServer.name}</span>...
                </p>
                <p className="text-[11px] text-slate-500 px-6 text-center">
                  Якщо сервер довго відповідає, натисніть сусідню кнопку сервера вгорі
                </p>
              </div>
            )}
            <iframe
              key={activeServer.url}
              src={activeServer.url}
              title={title}
              onLoad={() => setIframeLoading(false)}
              referrerPolicy="origin"
              className="w-full h-full border-0 bg-black"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
            />
          </>
        ) : (
          /* NATIVE HTML5 / HLS VIDEO MODE */
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
              onTimeUpdate={() => {
                if (videoRef.current) {
                  setCurrentTime(videoRef.current.currentTime);
                  if (videoRef.current.buffered.length > 0) {
                    setBufferedEnd(
                      videoRef.current.buffered.end(videoRef.current.buffered.length - 1)
                    );
                  }
                }
              }}
              onLoadedMetadata={() => {
                if (videoRef.current) setDuration(videoRef.current.duration);
              }}
              onEnded={() => setIsPlaying(false)}
              playsInline
            />

            {/* Native Overlay Controls */}
            <div
              className={`absolute inset-0 flex flex-col justify-between pointer-events-none transition-opacity duration-300 bg-gradient-to-t from-black/90 via-transparent to-black/40 ${
                showControls ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="flex justify-end p-3 gap-2 pointer-events-auto">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSettingsMenu(showSettingsMenu === 'audio' ? 'none' : 'audio');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-black/70 text-xs font-semibold text-amber-400 border border-white/15 flex items-center gap-1.5"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[110px]">{selectedAudio.name}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSettingsMenu(showSettingsMenu === 'quality' ? 'none' : 'quality');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-black/70 text-xs font-bold text-emerald-400 border border-white/15 flex items-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{selectedQuality.label}</span>
                </button>
              </div>

              {/* Center Play/Seek Touch Controls */}
              <div className="flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto">
                <button
                  onClick={() => seek(-10)}
                  className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-md active:scale-90 transition-transform"
                  title={t('rewind10')}
                >
                  <RotateCcw className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>

                <button
                  onClick={togglePlay}
                  className="p-5 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-600/40 active:scale-95 transition-all"
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 sm:w-10 sm:h-10" />
                  ) : (
                    <Play className="w-8 h-8 sm:w-10 sm:h-10 ml-1" />
                  )}
                </button>

                <button
                  onClick={() => seek(10)}
                  className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-md active:scale-90 transition-transform"
                  title={t('forward10')}
                >
                  <RotateCw className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>
              </div>

              {/* Bottom Timeline */}
              <div className="p-3.5 sm:p-5 space-y-2.5 pointer-events-auto">
                <div className="relative flex items-center">
                  <div className="absolute left-0 right-0 h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/35"
                      style={{ width: `${duration > 0 ? (bufferedEnd / duration) * 100 : 0}%` }}
                    />
                  </div>
                  <div
                    className="absolute left-0 h-1.5 bg-red-600 rounded-full pointer-events-none"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeekChange}
                    className="relative w-full h-5 opacity-0 cursor-pointer z-10"
                  />
                </div>

                <div className="flex items-center justify-between text-white text-xs sm:text-sm">
                  <div className="flex items-center gap-3">
                    <button onClick={togglePlay} className="hover:text-red-500">
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <button onClick={toggleMute} className="hover:text-red-500">
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-5 h-5 text-red-500" />
                      ) : (
                        <Volume2 className="w-5 h-5" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-16 sm:w-24 h-1 bg-white/20 accent-red-600 rounded-full cursor-pointer hidden sm:block"
                    />
                    <span className="font-mono text-slate-300">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  <button onClick={toggleFullscreen} className="p-1.5 rounded-lg hover:bg-white/10">
                    {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Quality & Audio Popups */}
            {showSettingsMenu === 'quality' && (
              <div className="absolute right-4 top-14 z-50 bg-[#121824] border border-white/15 rounded-xl shadow-2xl p-2 w-44 animate-fadeIn">
                <div className="text-[11px] font-bold text-slate-400 px-3 py-1 uppercase">
                  {t('qualityMenu')}
                </div>
                {nonEmbedQualities.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => {
                      setSelectedQuality(q);
                      setShowSettingsMenu('none');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-slate-200 hover:bg-white/10"
                  >
                    <span>{q.label}</span>
                    {selectedQuality.label === q.label && (
                      <Check className="w-4 h-4 text-emerald-400" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {showSettingsMenu === 'audio' && (
              <div className="absolute right-4 top-14 z-50 bg-[#121824] border border-white/15 rounded-xl shadow-2xl p-2 w-60 animate-fadeIn">
                <div className="text-[11px] font-bold text-slate-400 px-3 py-1 uppercase">
                  {t('audioTrackMenu')}
                </div>
                {audioTracks.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedAudio(a);
                      setShowSettingsMenu('none');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-slate-200 hover:bg-white/10"
                  >
                    <span className="truncate pr-2">{a.name}</span>
                    {selectedAudio.id === a.id && (
                      <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
