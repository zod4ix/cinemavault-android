import React, { useEffect, useRef, useState, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX,
  Maximize, Minimize, ArrowLeft, Settings, Check, Radio,
  Server, SkipForward, SkipBack, Smartphone, Link2, ChevronRight, AlertCircle,
  HardDrive, X
} from 'lucide-react';
import { MediaItem, AudioTrack, StreamQuality, StreamServer, TorrentItem } from '../types/movie';
import { buildServers, ensureIds, resolveUaServer, probeServer, ServerHealth } from '../services/servers';
import { rememberWorkingServer } from '../services/rezka';
import { storageService } from '../services/storage';
import { torrentService } from '../services/torrent';
import { useLanguage } from '../i18n/LanguageContext';

declare global {
  interface Window {
    AndroidCinemaBridge?: {
      setPlayerFullscreen: (fullscreen: boolean) => void;
    };
    webtor?: any;
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
  initialMode?: 'native' | 'embed' | 'trailer' | 'torrent';
  onClose: () => void;
  episodeId?: string | number;
  seasonNumber?: number;
  episodeNumber?: number;
  magnet?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  media,
  title,
  subtitle,
  qualities,
  audioTracks,
  embedUrl,
  servers: initialServers,
  initialMode = 'embed',
  onClose,
  episodeId,
  seasonNumber: initialSeason,
  episodeNumber: initialEpisode,
  magnet: initialMagnet,
}) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const isSeries = media.mediaType === 'tv' || media.mediaType === 'anime';
  const [activeSeason, setActiveSeason] = useState<number>(initialSeason || 1);
  const [activeEpisode, setActiveEpisode] = useState<number>(initialEpisode || 1);
  const [isLandscapeLocked, setIsLandscapeLocked] = useState<boolean>(false);
  const [serverHealthMap, setServerHealthMap] = useState<Record<string, ServerHealth>>({});
  const [autoFailoverMsg, setAutoFailoverMsg] = useState<string | null>(null);

  // Active Menu: 'none' | 'audio' | 'quality' | 'torrents' | 'episodes'
  const [activeMenu, setActiveMenu] = useState<'none' | 'audio' | 'quality' | 'torrents' | 'episodes'>('none');
  const [audioLangFilter, setAudioLangFilter] = useState<string>('all');
  const [torrentLangFilter, setTorrentLangFilter] = useState<string>('all');

  // Live P2P Torrents
  const [torrentStreams, setTorrentStreams] = useState<TorrentItem[]>([]);
  const [currentMagnet, setCurrentMagnet] = useState<string>(initialMagnet || '');

  // Background ensure IDs + UA dubbing lookup for current season
  const [serversVersion, setServersVersion] = useState<number>(0);
  useEffect(() => {
    let active = true;
    Promise.all([
      ensureIds(media),
      resolveUaServer(media, activeSeason),
    ]).then(() => {
      if (active) setServersVersion((v) => v + 1);
    });
    return () => {
      active = false;
    };
  }, [media, activeSeason]);

  // Live search torrents for this movie or episode
  useEffect(() => {
    let active = true;
    torrentService.searchTorrents(media, activeSeason, activeEpisode).then((torrents) => {
      if (active && torrents.length > 0) {
        setTorrentStreams(torrents);
      }
    });
    return () => {
      active = false;
    };
  }, [media, activeSeason, activeEpisode]);

  // Dynamically build all servers for current movie or season/episode
  const availableServers = useMemo(() => {
    const list = buildServers(media, activeSeason, activeEpisode);
    const map = new Map<string, StreamServer>();
    list.forEach((s) => map.set(s.id, s));

    if (initialServers && initialServers.length > 0) {
      initialServers.forEach((s) => {
        if (!map.has(s.id)) map.set(s.id, s);
      });
    }

    // Add torrent streams directly to server list
    if (initialMagnet) {
      map.set('initial-torrent', {
        id: 'initial-torrent',
        name: '⚡ P2P Торрент',
        badge: 'Торрент',
        url: initialMagnet,
        mode: 'torrent',
        magnet: initialMagnet,
        langs: ['UA', 'MULTI'],
      });
    }

    torrentStreams.forEach((tItem) => {
      const sId = `torrent-${tItem.id}`;
      if (!map.has(sId)) {
        map.set(sId, {
          id: sId,
          name: `⚡ P2P ${tItem.tracker} (${tItem.quality})`,
          badge: `${tItem.seeds} seeds`,
          url: tItem.magnet,
          mode: 'torrent',
          magnet: tItem.magnet,
          langs: [tItem.audio || 'MULTI'],
        });
      }
    });

    return Array.from(map.values());
  }, [media, activeSeason, activeEpisode, serversVersion, initialServers, torrentStreams, initialMagnet]);

  // Determine initial server based on embedUrl, magnet or initialMode
  const getInitialServerId = () => {
    if (initialMode === 'torrent' || initialMagnet) return 'initial-torrent';
    if (initialMode === 'native') return 'custom-stream';
    if (initialMode === 'trailer') {
      const tr = availableServers.find((s) => s.mode === 'trailer');
      if (tr) return tr.id;
    }
    if (embedUrl) {
      const matched = availableServers.find((s) => s.url && embedUrl.includes(s.url.split('?')[0]));
      if (matched) return matched.id;
    }
    return availableServers[0]?.id || 'vidlink';
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
    audioTracks[0] || { id: 'default', name: 'Auto (Original / Dub)', language: 'uk' }
  );

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [bufferedEnd, setBufferedEnd] = useState<number>(0);
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);
  const [osdMessage, setOsdMessage] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showOsd = (msg: string) => {
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    setOsdMessage(msg);
    osdTimerRef.current = setTimeout(() => setOsdMessage(null), 1500);
  };

  // TV remote autofocus on mount
  useEffect(() => {
    const tId = setTimeout(() => {
      backBtnRef.current?.focus();
    }, 150);
    return () => clearTimeout(tId);
  }, []);

  // Probe current active server health on mount or when switching
  useEffect(() => {
    if (!activeServer || activeServer.mode !== 'embed') return;
    probeServer(activeServer.url).then((h) => {
      setServerHealthMap((prev) => ({ ...prev, [activeServer.id]: h }));
    });
  }, [activeServer]);

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
    if (activeServer) {
      rememberWorkingServer(activeServer.id);
    }
  }, [activeServer?.url, activeServer?.id]);

  // In-App Webtor P2P Torrent Streaming Engine
  useEffect(() => {
    if (!activeServer || activeServer.mode !== 'torrent') return;
    const magnet = activeServer.magnet || activeServer.url || currentMagnet;
    if (!magnet) return;

    setCurrentMagnet(magnet);
    setIframeLoading(true);

    const target = document.getElementById('webtor-torrent-target');
    if (!target) return;
    target.innerHTML = '';

    const initWebtor = () => {
      const win = window as any;
      win.webtor = win.webtor || [];
      win.webtor.push({
        id: 'webtor-torrent-target',
        magnet,
        width: '100%',
        height: '100%',
        controls: true,
        title: title,
        poster: media.backdropPath || media.posterPath,
        imdbId: media.imdbId,
        lang: 'uk',
        header: true,
        on: (e: any) => {
          if (e.name === 'inited' || e.name === 'play_clicked' || e.name === 'player status') {
            setIframeLoading(false);
          }
        },
      });
    };

    if ((window as any).webtor) {
      initWebtor();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@webtor/embed-sdk-js/dist/index.min.js';
      script.async = true;
      script.onload = () => initWebtor();
      document.body.appendChild(script);
    }

    return () => {
      if (target) target.innerHTML = '';
    };
  }, [activeServer?.id, activeServer?.mode, activeServer?.magnet, activeServer?.url]);

  // Helper to switch to the next server
  const switchToNextServer = () => {
    const embedServers = availableServers.filter((s) => s.mode === 'embed');
    if (embedServers.length <= 1) return;
    const currentIndex = embedServers.findIndex((s) => s.id === activeServer?.id);
    const nextIndex = (currentIndex + 1) % embedServers.length;
    const nextServer = embedServers[nextIndex];
    if (nextServer) {
      setSelectedServerId(nextServer.id);
      setAutoFailoverMsg(`${t('connectingTo')} ${nextServer.name}...`);
      setTimeout(() => setAutoFailoverMsg(null), 3000);
    }
  };

  const toggleAndroidLandscape = () => {
    const next = !isLandscapeLocked;
    setIsLandscapeLocked(next);
    setIsFullscreen(next);
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
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
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
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeServer?.id, activeServer?.mode, selectedQuality.url, customStreamUrl]);

  // Periodic watch progress save
  useEffect(() => {
    if (!currentTime || !duration || duration <= 0) return;
    const timer = setInterval(() => {
      storageService.saveProgress({
        mediaId: media.id,
        mediaSnapshot: media,
        title: title,
        posterPath: media.posterPath,
        currentTime,
        duration,
        lastUpdated: Date.now(),
        episodeId,
        seasonNumber: activeSeason,
        episodeNumber: activeEpisode,
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [currentTime, duration, media, episodeId, activeSeason, activeEpisode, title]);

  const togglePlay = () => {
    if (activeServer?.mode !== 'native') return;
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  const seek = (seconds: number) => {
    if (activeServer?.mode !== 'native' || !videoRef.current) return;
    videoRef.current.currentTime = Math.max(
      0,
      Math.min(duration, videoRef.current.currentTime + seconds)
    );
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    toggleAndroidLandscape();
  };

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && activeMenu === 'none') setShowControls(false);
    }, 4500);
  };

  // Keyboard navigation & remote control hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      resetControlsTimeout();

      // If a menu modal is open, Escape closes the menu
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeMenu !== 'none') {
          setActiveMenu('none');
          return;
        }
        onClose();
        return;
      }

      // Hotkeys for TV Remote & Air Mouse
      switch (e.key) {
        case 'a':
        case 'A':
          e.preventDefault();
          setActiveMenu((prev) => (prev === 'audio' ? 'none' : 'audio'));
          break;
        case 'q':
        case 'Q':
          e.preventDefault();
          setActiveMenu((prev) => (prev === 'quality' ? 'none' : 'quality'));
          break;
        case 't':
        case 'T':
          e.preventDefault();
          setActiveMenu((prev) => (prev === 'torrents' ? 'none' : 'torrents'));
          break;
        case ' ':
        case 'k':
        case 'K':
          if (activeServer?.mode === 'native') {
            e.preventDefault();
            togglePlay();
            showOsd(isPlaying ? '⏸ Пауза' : '▶ Відтворення');
          }
          break;
        case 'ArrowLeft':
          if (activeServer?.mode === 'native') {
            e.preventDefault();
            seek(-10);
            showOsd('⏪ -10 сек');
          }
          break;
        case 'ArrowRight':
          if (activeServer?.mode === 'native') {
            e.preventDefault();
            seek(10);
            showOsd('⏩ +10 сек');
          }
          break;
        case 'ArrowUp':
          if (videoRef.current && activeServer?.mode === 'native') {
            e.preventDefault();
            const nextVol = Math.min(1, Number((volume + 0.1).toFixed(2)));
            videoRef.current.volume = nextVol;
            setVolume(nextVol);
            setIsMuted(false);
            showOsd(`🔊 ${Math.round(nextVol * 100)}%`);
          }
          break;
        case 'ArrowDown':
          if (videoRef.current && activeServer?.mode === 'native') {
            e.preventDefault();
            const nextVol = Math.max(0, Number((volume - 0.1).toFixed(2)));
            videoRef.current.volume = nextVol;
            setVolume(nextVol);
            setIsMuted(nextVol === 0);
            showOsd(nextVol === 0 ? '🔇 Без звуку' : `🔉 ${Math.round(nextVol * 100)}%`);
          }
          break;
        case 'm':
        case 'M':
          if (activeServer?.mode === 'native') {
            e.preventDefault();
            toggleMute();
            showOsd(isMuted ? '🔊 Звук увімкнено' : '🔇 Без звуку');
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          showOsd(isFullscreen ? '🗗 Звичайний екран' : '🗖 Повний екран');
          break;
      }
    };

    // Listen to native hardware remote media keys forwarded from MainActivity
    const handleRemoteMedia = (e: any) => {
      const keyCode = e.detail?.keyCode;
      if (keyCode === 85) { // KEYCODE_MEDIA_PLAY_PAUSE
        togglePlay();
        showOsd(isPlaying ? '⏸ Пауза' : '▶ Відтворення');
      } else if (keyCode === 126) { // KEYCODE_MEDIA_PLAY
        if (videoRef.current && videoRef.current.paused) videoRef.current.play();
        setIsPlaying(true);
        showOsd('▶ Відтворення');
      } else if (keyCode === 127) { // KEYCODE_MEDIA_PAUSE
        if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
        setIsPlaying(false);
        showOsd('⏸ Пауза');
      } else if (keyCode === 90) { // KEYCODE_MEDIA_FAST_FORWARD
        seek(10);
        showOsd('⏩ +10 сек');
      } else if (keyCode === 89) { // KEYCODE_MEDIA_REWIND
        seek(-10);
        showOsd('⏪ -10 сек');
      } else if (keyCode === 87 && isSeries) { // KEYCODE_MEDIA_NEXT
        setActiveEpisode((prev) => prev + 1);
        showOsd('⏭ Наступна серія');
      } else if (keyCode === 88 && isSeries) { // KEYCODE_MEDIA_PREVIOUS
        setActiveEpisode((prev) => Math.max(1, prev - 1));
        showOsd('⏮ Попередня серія');
      } else if (keyCode === 86) { // KEYCODE_MEDIA_STOP
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('cinema-remote-media', handleRemoteMedia);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('cinema-remote-media', handleRemoteMedia);
    };
  }, [isPlaying, volume, isMuted, isFullscreen, activeServer?.mode, isSeries, activeMenu, onClose]);

  // Current audio label for the dedicated action button
  const getCurrentAudioLabel = () => {
    if (activeServer?.id.includes('ashdi') || activeServer?.langs?.includes('UA')) return '🇺🇦 Ashdi UA';
    if (activeServer?.id.includes('loadbox')) return '🎭 Rezka Multi';
    if (activeServer?.mode === 'torrent') return '⚡ P2P Торрент';
    if (activeServer?.langs && activeServer.langs.length > 0) return `🌐 ${activeServer.langs[0]}`;
    return '🔊 Озвучення';
  };

  // Current quality label
  const getCurrentQualityLabel = () => {
    if (activeServer?.mode === 'torrent') return '⚡ 4K / 1080p';
    if (activeServer?.id.includes('vidlink') || activeServer?.id.includes('vidsrc')) return '💎 4K HDR';
    return '📺 1080p';
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
      className="fixed inset-0 z-50 bg-black flex flex-col select-none overflow-hidden"
    >
      {/* ========================================================
          DEDICATED TV / AIR MOUSE TOP CONTROL BAR
          ======================================================== */}
      <div className="shrink-0 z-30 bg-[#07090e] border-b border-white/10 px-3 sm:px-5 py-2.5 space-y-2">
        {/* Row 1: Back, Title, High-Visibility TV Remote Buttons */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              ref={backBtnRef}
              onClick={onClose}
              tabIndex={0}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-red-600 text-white transition-all active:scale-95 shrink-0 tv-btn-focus focus:outline-none"
              aria-label={t('closePlayer')}
              title="Закрити плеєр (ESC / Назад)"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-white font-bold text-xs sm:text-base truncate">{title}</h2>
              <p className="text-[10px] sm:text-xs text-amber-400 font-medium truncate">
                {isSeries
                  ? `${t('seasonWord')} ${activeSeason} • ${t('episodeWord')} ${activeEpisode}`
                  : subtitle || `${media.year} • ${media.quality || '1080p HD'}`}
              </p>
            </div>
          </div>

          {/* D-Pad & Mouse Accessible Primary Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 1. AUDIO / DUBBING SELECTOR BUTTON */}
            <button
              onClick={() => setActiveMenu((prev) => (prev === 'audio' ? 'none' : 'audio'))}
              tabIndex={0}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all tv-btn-focus focus:outline-none ${
                activeMenu === 'audio'
                  ? 'bg-amber-500 text-black border-amber-400'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
              }`}
              title="Вибір мовної доріжки та озвучення (A)"
            >
              <Radio className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Озвучення:</span>
              <span>{getCurrentAudioLabel()}</span>
            </button>

            {/* 2. QUALITY SELECTOR BUTTON */}
            <button
              onClick={() => setActiveMenu((prev) => (prev === 'quality' ? 'none' : 'quality'))}
              tabIndex={0}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all tv-btn-focus focus:outline-none ${
                activeMenu === 'quality'
                  ? 'bg-emerald-500 text-black border-emerald-400'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
              }`}
              title="Вибір якості відео (Q)"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Якість:</span>
              <span>{getCurrentQualityLabel()}</span>
            </button>

            {/* 3. TORRENT STREAM BUTTON */}
            <button
              onClick={() => setActiveMenu((prev) => (prev === 'torrents' ? 'none' : 'torrents'))}
              tabIndex={0}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all tv-btn-focus focus:outline-none ${
                activeMenu === 'torrents' || activeServer?.mode === 'torrent'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30'
                  : 'bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25'
              }`}
              title="Торренти онлайн P2P (T)"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>⚡ Торренти</span>
              {torrentStreams.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-purple-500/30 text-purple-200">
                  {torrentStreams.length}
                </span>
              )}
            </button>

            {/* 4. Quick Season/Episode Switcher for Series */}
            {isSeries && (
              <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setActiveEpisode((prev) => Math.max(1, prev - 1))}
                  disabled={activeEpisode <= 1}
                  tabIndex={0}
                  className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-white tv-btn-focus focus:outline-none"
                  title={t('prevEpisode')}
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <select
                  value={activeSeason}
                  onChange={(e) => {
                    setActiveSeason(Number(e.target.value));
                    setActiveEpisode(1);
                  }}
                  tabIndex={0}
                  className="bg-transparent text-[11px] font-bold text-amber-400 focus:outline-none cursor-pointer"
                >
                  {Array.from({ length: Math.max(media.seasonsCount || 4, activeSeason) }, (_, i) => i + 1).map(
                    (sNum) => (
                      <option key={sNum} value={sNum} className="bg-slate-900 text-white">
                        {t('seasonLetter')}{sNum}
                      </option>
                    )
                  )}
                </select>
                <span className="text-[11px] text-slate-400">:</span>
                <select
                  value={activeEpisode}
                  onChange={(e) => setActiveEpisode(Number(e.target.value))}
                  tabIndex={0}
                  className="bg-transparent text-[11px] font-bold text-white focus:outline-none cursor-pointer"
                >
                  {Array.from({ length: 35 }, (_, i) => i + 1).map((eNum) => (
                    <option key={eNum} value={eNum} className="bg-slate-900 text-white">
                      {t('episodeLetter')}{eNum}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setActiveEpisode((prev) => prev + 1)}
                  tabIndex={0}
                  className="p-1 rounded hover:bg-white/10 text-white tv-btn-focus focus:outline-none"
                  title={t('nextEpisode')}
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 5. Next Mirror Quick Failover Button */}
            {availableServers.filter((s) => s.mode === 'embed').length > 1 && (
              <button
                onClick={switchToNextServer}
                tabIndex={0}
                className="px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold flex items-center gap-1 shadow-md shadow-red-600/30 active:scale-95 transition-all tv-btn-focus focus:outline-none"
                title={t('nextServer')}
              >
                <span>{t('nextServer')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {/* 6. Rotate Phone to Landscape Button */}
            <button
              onClick={toggleAndroidLandscape}
              tabIndex={0}
              className={`p-2 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition-all tv-btn-focus focus:outline-none ${
                isLandscapeLocked
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-white/10 text-slate-200 border-white/15 hover:bg-white/20'
              }`}
              title={isLandscapeLocked ? t('rotateNormal') : t('rotateLandscape')}
            >
              <Smartphone className={`w-4 h-4 ${isLandscapeLocked ? 'rotate-90' : ''} transition-transform`} />
            </button>
          </div>
        </div>

        {/* Row 2: Multi-Server Switcher Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 shrink-0 mr-1">
            <Server className="w-3 h-3 text-red-500" /> {t('serverLabel')}
          </span>
          {availableServers
            .filter((srv, idx) => {
              if (srv.mode !== 'torrent') return true;
              if (activeServer?.id === srv.id) return true;
              const firstTorrentIdx = availableServers.findIndex((s) => s.mode === 'torrent');
              return idx - firstTorrentIdx < 4;
            })
            .map((srv) => {
            const active = activeServer?.id === srv.id;
            const health = serverHealthMap[srv.id];
            const isUa = srv.id.includes('ashdi') || srv.langs?.includes('UA');
            const isTorrent = srv.mode === 'torrent';

            return (
              <button
                key={srv.id}
                onClick={() => {
                  setSelectedServerId(srv.id);
                  if (srv.mode === 'torrent' && srv.magnet) {
                    setCurrentMagnet(srv.magnet);
                  }
                }}
                tabIndex={0}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap flex items-center gap-1.5 border transition-all shrink-0 tv-btn-focus focus:outline-none ${
                  active
                    ? isTorrent
                      ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/30'
                      : 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30'
                    : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/15 hover:text-white'
                }`}
              >
                {/* Health dot */}
                {isTorrent ? (
                  <span>⚡</span>
                ) : isUa ? (
                  <span>🇺🇦</span>
                ) : health === 'ok' ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                ) : null}

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
              tabIndex={0}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap flex items-center gap-1 shrink-0 tv-btn-focus focus:outline-none"
            >
              <Link2 className="w-3 h-3" /> {t('customStream')}
            </button>
          )}
        </div>

        {/* Custom Stream URL Bar */}
        {showCustomUrlInput && activeServer?.mode === 'native' && (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="url"
              value={customStreamUrl}
              onChange={(e) => setCustomStreamUrl(e.target.value)}
              placeholder={t('customStreamPlaceholder')}
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

      {/* Auto Failover Notification Toast */}
      {autoFailoverMsg && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 bg-black/95 border border-amber-500 text-amber-300 px-4 py-2 rounded-xl text-xs font-bold shadow-2xl flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span>{autoFailoverMsg}</span>
        </div>
      )}

      {/* ========================================================
          QUICK OVERLAY MENUS FOR TV REMOTE & AIR MOUSE
          ======================================================== */}
      {activeMenu !== 'none' && (
        <div 
          className="absolute inset-0 z-40 bg-black/85 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setActiveMenu('none')}
        >
          <div 
            className="bg-[#0b0f19] border border-white/20 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-white text-base sm:text-lg font-bold flex items-center gap-2">
                {activeMenu === 'audio' && (
                  <>
                    <Radio className="w-5 h-5 text-amber-400" />
                    <span>Вибір озвучення та мовної доріжки</span>
                  </>
                )}
                {activeMenu === 'quality' && (
                  <>
                    <Settings className="w-5 h-5 text-emerald-400" />
                    <span>Вибір якості та відео-сервера</span>
                  </>
                )}
                {activeMenu === 'torrents' && (
                  <>
                    <HardDrive className="w-5 h-5 text-purple-400" />
                    <span>P2P Торренти онлайн ({torrentStreams.length})</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setActiveMenu('none')}
                tabIndex={0}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-red-600 text-slate-300 hover:text-white transition-all tv-btn-focus focus:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content for Audio / Multi-Language Channels Menu */}
            {activeMenu === 'audio' && (
              <div className="space-y-3 max-h-[64vh] overflow-y-auto custom-scrollbar">
                {/* Language Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                  {[
                    { id: 'all', label: '🌐 Усі мови' },
                    { id: 'ua', label: '🇺🇦 Українська' },
                    { id: 'en', label: '🇬🇧 English' },
                    { id: 'pl', label: '🇵🇱 Polski' },
                    { id: 'es', label: '🇪🇸 Español' },
                    { id: 'multi', label: '🎭 Multi / RU' },
                  ].map((lf) => (
                    <button
                      key={lf.id}
                      onClick={() => setAudioLangFilter(lf.id)}
                      tabIndex={0}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap border transition-all tv-btn-focus focus:outline-none ${
                        audioLangFilter === lf.id
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/15'
                      }`}
                    >
                      {lf.label}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-slate-400">
                  Оберіть потрібний мовний канал. Спочатку представлені українські канали, далі — усі світові мови додатку:
                </p>
                {availableServers
                  .filter((srv) => srv.mode !== 'torrent' || srv.id === activeServer?.id)
                  .filter((srv) => {
                    if (audioLangFilter === 'all') return true;
                    const idLow = srv.id.toLowerCase();
                    if (audioLangFilter === 'ua') return idLow.startsWith('ua-') || srv.langs?.includes('UA');
                    if (audioLangFilter === 'en') return idLow.includes('vidlink') || idLow.includes('vidsrc') || idLow.includes('vidfast') || srv.langs?.includes('EN');
                    if (audioLangFilter === 'pl') return idLow.startsWith('pl-') || srv.langs?.includes('PL');
                    if (audioLangFilter === 'es') return idLow.startsWith('es-') || srv.langs?.includes('ES');
                    return srv.langs?.includes('MULTI') || srv.langs?.includes('RU');
                  })
                  .map((srv) => {
                    const isCur = activeServer?.id === srv.id;
                    const idLow = srv.id.toLowerCase();
                    const isUa = idLow.startsWith('ua-') || idLow.includes('ashdi');
                    const isPl = idLow.startsWith('pl-');
                    const isEs = idLow.startsWith('es-');
                    const isRezka = idLow.includes('loadbox');
                    const isTorrent = srv.mode === 'torrent';

                    const getDesc = () => {
                      if (idLow.includes('ashdi')) return '🇺🇦 Повний професійний український дубляж (UAKino / Ashdi)';
                      if (idLow.includes('ua-kino-rezka')) return '🇺🇦 Українська озвучка та дубляж (КіноБаза UA)';
                      if (idLow.includes('ua-videasy')) return '🇺🇦 Український потік 4K HDR + субтитри';
                      if (idLow.includes('ua-autoembed')) return '🇺🇦 Український дубляж та багатоголосий переклад';
                      if (isPl) return '🇵🇱 Polski Lektor / Dubbing / Napisy PL';
                      if (isEs) return '🇪🇸 Español Latino / Castellano + Subtítulos';
                      if (isRezka) return '🎭 Багатоголосе озвучення (UA / EN / Rezka / LostFilm / RU)';
                      if (isTorrent) return '⚡ P2P потік без стиснення з оригінальними доріжками';
                      return '🇬🇧 English Original 4K / 1080p + Multi Subtitles';
                    };

                    return (
                      <button
                        key={srv.id}
                        onClick={() => {
                          setSelectedServerId(srv.id);
                          if (isTorrent && srv.magnet) setCurrentMagnet(srv.magnet);
                          setActiveMenu('none');
                          showOsd(`🔊 ${srv.name}`);
                        }}
                        tabIndex={0}
                        className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all tv-btn-focus focus:outline-none ${
                          isCur
                            ? 'bg-red-600 text-white border-red-500 shadow-md'
                            : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">
                            {isUa ? '🇺🇦' : isPl ? '🇵🇱' : isEs ? '🇪🇸' : isRezka ? '🎭' : isTorrent ? '⚡' : '🇬🇧'}
                          </span>
                          <div>
                            <h4 className="font-bold text-sm">{srv.name}</h4>
                            <p className="text-xs text-slate-300">{getDesc()}</p>
                          </div>
                        </div>
                        {isCur && <Check className="w-5 h-5 text-white shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Content for Quality Menu */}
            {activeMenu === 'quality' && (
              <div className="space-y-2.5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <p className="text-xs text-slate-400">
                  Оберіть бажану якість відтворення:
                </p>
                {[
                  { id: 'vidlink', label: '💎 4K HDR Ultra HD', desc: 'Максимальна якість для 4K ТВ та проєкторів (VidLink 4K)' },
                  { id: 'vidsrc', label: '📺 1080p Ultra Full HD', desc: 'Швидка буферизація та висока чіткість (VidSrc PRO)' },
                  { id: 'ashdi', label: '🇺🇦 1080p HD (Ashdi UA)', desc: 'Український дубляж у високій якості 1080p' },
                  { id: 'loadbox', label: '🎭 1080p HD (Rezka Multi)', desc: 'Адаптивна якість 1080p / 720p з вибором озвучень' },
                ].map((qOpt) => {
                  const srv = availableServers.find((s) => s.id === qOpt.id) || availableServers[0];
                  const isCur = activeServer?.id === srv?.id;

                  return (
                    <button
                      key={qOpt.id}
                      onClick={() => {
                        if (srv) setSelectedServerId(srv.id);
                        setActiveMenu('none');
                        showOsd(`💎 ${qOpt.label}`);
                      }}
                      tabIndex={0}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all tv-btn-focus focus:outline-none ${
                        isCur
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                          : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/15'
                      }`}
                    >
                      <div>
                        <h4 className="font-bold text-sm">{qOpt.label}</h4>
                        <p className="text-xs text-slate-300">{qOpt.desc}</p>
                      </div>
                      {isCur && <Check className="w-5 h-5 text-white shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Content for Torrents Menu */}
            {activeMenu === 'torrents' && (
              <div className="space-y-3 max-h-[64vh] overflow-y-auto custom-scrollbar">
                {/* Language & Quality Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                  {[
                    { id: 'all', label: `⚡ Усі (${torrentStreams.length})` },
                    { id: 'ua', label: '🇺🇦 Українською' },
                    { id: '4k', label: '💎 4K HDR' },
                    { id: 'en', label: '🇬🇧 English' },
                    { id: 'pl', label: '🇵🇱 Polski' },
                    { id: 'es', label: '🇪🇸 Español' },
                  ].map((tf) => (
                    <button
                      key={tf.id}
                      onClick={() => setTorrentLangFilter(tf.id)}
                      tabIndex={0}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap border transition-all tv-btn-focus focus:outline-none ${
                        torrentLangFilter === tf.id
                          ? 'bg-purple-600 text-white border-purple-400'
                          : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/15'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-slate-400">
                  Пряме програвання торрентів через вбудований P2P-рушій (Torrentio + TPB + YTS + EZTV):
                </p>
                {torrentStreams.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 space-y-2">
                    <HardDrive className="w-8 h-8 mx-auto text-slate-500 animate-pulse" />
                    <p className="text-xs">Пошук відкритих P2P-роздач...</p>
                  </div>
                ) : (
                  torrentStreams
                    .filter((tItem) => {
                      if (torrentLangFilter === 'all') return true;
                      const c = `${tItem.audio} ${tItem.title} ${tItem.quality}`.toLowerCase();
                      if (torrentLangFilter === 'ua') return c.includes('ua') || c.includes('укр') || c.includes('🇺🇦');
                      if (torrentLangFilter === '4k') return c.includes('4k') || c.includes('2160');
                      if (torrentLangFilter === 'en') return c.includes('en') || c.includes('eng');
                      if (torrentLangFilter === 'pl') return c.includes('pl') || c.includes('pol') || c.includes('lektor');
                      if (torrentLangFilter === 'es') return c.includes('es') || c.includes('esp') || c.includes('latino');
                      return true;
                    })
                    .map((tItem) => (
                    <button
                      key={tItem.id}
                      onClick={() => {
                        setCurrentMagnet(tItem.magnet);
                        // Add or activate this torrent server
                        setSelectedServerId(`torrent-${tItem.id}`);
                        setActiveMenu('none');
                        showOsd(`⚡ P2P: ${tItem.quality}`);
                      }}
                      tabIndex={0}
                      className="w-full p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-purple-900/40 hover:border-purple-500/50 text-left flex items-center justify-between transition-all tv-btn-focus focus:outline-none"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600/30 text-purple-300 border border-purple-500/30">
                            {tItem.tracker}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {tItem.quality}
                          </span>
                          <span className="text-xs font-mono text-emerald-400 font-bold">
                            ▲ {tItem.seeds} seeds
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            {tItem.size}
                          </span>
                        </div>
                        <h4 className="font-semibold text-white text-xs sm:text-sm line-clamp-1">{tItem.title}</h4>
                        <p className="text-[11px] text-slate-400">{tItem.audio}</p>
                      </div>
                      <div className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shrink-0 ml-3 shadow-md">
                        <Play className="w-4 h-4 fill-white" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          MAIN VIDEO VIEWPORT
          ======================================================== */}
      <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
        {/* On-Screen Display (OSD) feedback for Remote Control and Air Mouse */}
        {osdMessage && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none bg-black/95 border border-white/25 text-white px-6 py-3.5 rounded-2xl text-base sm:text-xl font-black shadow-2xl animate-fadeIn flex items-center gap-3">
            <span>{osdMessage}</span>
          </div>
        )}

        {/* 1. TORRENT STREAMING VIEWPORT */}
        {activeServer?.mode === 'torrent' ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            {iframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#05070c] z-10">
                <div className="w-12 h-12 rounded-full border-4 border-purple-600/30 border-t-purple-600 animate-spin" />
                <p className="text-xs text-slate-300 font-medium">
                  Підключення до P2P-роздачі <span className="text-purple-400 font-bold">{activeServer.name}</span>...
                </p>
                <p className="text-[11px] text-slate-500 px-6 text-center pt-1">
                  Буферизація відеопотоку безпосередньо з мережі торент-пірів.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={switchToNextServer}
                    className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-red-600 text-white text-xs font-bold border border-white/15 transition-all tv-btn-focus focus:outline-none"
                  >
                    Перемкнути на звичайний сервер
                  </button>
                </div>
              </div>
            )}
            <div id="webtor-torrent-target" className="w-full h-full flex items-center justify-center" />
          </div>
        ) : activeServer && activeServer.mode !== 'native' ? (
          /* 2. EMBED / IFRAME STREAMING VIEWPORT */
          <>
            {iframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#05070c] z-10">
                <div className="w-11 h-11 rounded-full border-4 border-red-600/30 border-t-red-600 animate-spin" />
                <p className="text-xs text-slate-300 font-medium">
                  {t('connectingTo')} <span className="text-amber-400 font-bold">{activeServer.name}</span>...
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={switchToNextServer}
                    className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-red-600 text-white text-xs font-bold border border-white/15 transition-all tv-btn-focus focus:outline-none"
                  >
                    {t('nextServer')}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 px-6 text-center pt-1">
                  {t('serverSlowHint')}
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
          /* 3. NATIVE HTML5 / HLS VIDEO MODE */
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
                    if (audioTracks.length > 1) {
                      const curIdx = audioTracks.findIndex((a) => a.id === selectedAudio.id);
                      const next = audioTracks[(curIdx + 1) % audioTracks.length];
                      if (next) setSelectedAudio(next);
                    }
                    setActiveMenu(activeMenu === 'audio' ? 'none' : 'audio');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-black/80 text-xs font-semibold text-amber-400 border border-white/15 flex items-center gap-1.5 tv-btn-focus focus:outline-none"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[110px]">{selectedAudio.name}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (nonEmbedQualities.length > 1) {
                      const curIdx = nonEmbedQualities.findIndex((q) => q.url === selectedQuality.url);
                      const next = nonEmbedQualities[(curIdx + 1) % nonEmbedQualities.length];
                      if (next) setSelectedQuality(next);
                    }
                    setActiveMenu(activeMenu === 'quality' ? 'none' : 'quality');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-black/80 text-xs font-bold text-emerald-400 border border-white/15 flex items-center gap-1.5 tv-btn-focus focus:outline-none"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{selectedQuality.label}</span>
                </button>
              </div>

              {/* Center Play/Seek Touch Controls */}
              <div className="flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto">
                <button
                  onClick={() => seek(-10)}
                  tabIndex={0}
                  className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 text-white active:scale-90 transition-transform tv-btn-focus focus:outline-none"
                  aria-label="Перемотати назад 10 сек"
                >
                  <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <button
                  onClick={togglePlay}
                  tabIndex={0}
                  className="p-5 sm:p-6 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-600/40 active:scale-95 transition-all tv-btn-focus focus:outline-none"
                  aria-label={isPlaying ? "Пауза" : "Відтворення"}
                >
                  {isPlaying ? (
                    <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-white" />
                  ) : (
                    <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-white ml-0.5" />
                  )}
                </button>
                <button
                  onClick={() => seek(10)}
                  tabIndex={0}
                  className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 text-white active:scale-90 transition-transform tv-btn-focus focus:outline-none"
                  aria-label="Перемотати вперед 10 сек"
                >
                  <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              {/* Bottom Progress Bar & Volume */}
              <div className="p-3 sm:p-5 space-y-2 pointer-events-auto">
                <div
                  className="relative w-full h-2 bg-white/20 rounded-full cursor-pointer overflow-hidden"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos = (e.clientX - rect.left) / rect.width;
                    seek(pos * duration - currentTime);
                  }}
                >
                  <div
                    className="absolute top-0 left-0 bottom-0 bg-white/30"
                    style={{ width: `${duration > 0 ? (bufferedEnd / duration) * 100 : 0}%` }}
                  />
                  <div
                    className="absolute top-0 left-0 bottom-0 bg-red-600"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>
                    {Math.floor(currentTime / 60)}:
                    {String(Math.floor(currentTime % 60)).padStart(2, '0')} /{' '}
                    {Math.floor(duration / 60)}:
                    {String(Math.floor(duration % 60)).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleMute}
                      tabIndex={0}
                      className="p-1 hover:text-white tv-btn-focus focus:outline-none"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={toggleFullscreen}
                      tabIndex={0}
                      className="p-1 hover:text-white tv-btn-focus focus:outline-none"
                    >
                      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
