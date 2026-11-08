import React, { useEffect, useRef, useState, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ArrowLeft,
  Settings,
  Check,
  Radio,
  Server,
  SkipForward,
  SkipBack,
  Smartphone,
  Link2,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  HardDrive,
  X,
  Layers,
  MousePointer,
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
      simulateScreenTap?: (normX: number, normY: number) => void;
      openExternalUrl?: (url: string) => void;
    };
    __cinemaHandlePlayerBack?: () => boolean;
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
  const audioBtnRef = useRef<HTMLButtonElement>(null);
  const qualityBtnRef = useRef<HTMLButtonElement>(null);
  const torrentsBtnRef = useRef<HTMLButtonElement>(null);
  const episodesBtnRef = useRef<HTMLButtonElement>(null);
  const serversRowRef = useRef<HTMLDivElement>(null);
  const modalBoxRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const isSeries = media.mediaType === 'tv' || media.mediaType === 'anime';
  const [activeSeason, setActiveSeason] = useState<number>(initialSeason || 1);
  const [activeEpisode, setActiveEpisode] = useState<number>(initialEpisode || 1);
  const [isLandscapeLocked, setIsLandscapeLocked] = useState<boolean>(false);
  const [serverHealthMap, setServerHealthMap] = useState<Record<string, ServerHealth>>({});
  const [autoFailoverMsg, setAutoFailoverMsg] = useState<string | null>(null);

  // Active Menu: 'none' | 'audio' | 'quality' | 'torrents' | 'episodes'
  const [activeMenu, setActiveMenu] = useState<'none' | 'audio' | 'quality' | 'torrents' | 'episodes'>('none');
  const prevMenuRef = useRef<'none' | 'audio' | 'quality' | 'torrents' | 'episodes'>('none');
  const [audioLangFilter, setAudioLangFilter] = useState<string>('all');
  const [torrentLangFilter, setTorrentLangFilter] = useState<string>('all');

  // Explicit user-selectable quality resolution
  const [preferredQuality, setPreferredQuality] = useState<'4K' | '1080p' | '720p' | '480p'>(
    media.quality?.includes('4K') ? '4K' : '1080p'
  );

  // Virtual Remote Mouse Cursor Mode (for clicking inside embedded iframes using only TV remote D-Pad)
  const [isVirtualCursorActive, setIsVirtualCursorActive] = useState<boolean>(false);
  const [virtualCursorPos, setVirtualCursorPos] = useState<{ x: number; y: number }>({
    x: 0.5,
    y: 0.55,
  });

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

  // Build effective embed URL with selected quality parameter
  const effectiveEmbedUrl = useMemo(() => {
    if (!activeServer?.url) return '';
    if (activeServer.mode !== 'embed') return activeServer.url;
    try {
      const u = new URL(activeServer.url);
      const qNum =
        preferredQuality === '4K'
          ? '2160'
          : preferredQuality === '1080p'
            ? '1080'
            : preferredQuality === '720p'
              ? '720'
              : '480';
      u.searchParams.set('quality', qNum);
      return u.toString();
    } catch {
      const sep = activeServer.url.includes('?') ? '&' : '?';
      return `${activeServer.url}${sep}quality=${preferredQuality}`;
    }
  }, [activeServer?.url, activeServer?.mode, preferredQuality]);

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
  const [volume] = useState<number>(1);
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
    osdTimerRef.current = setTimeout(() => setOsdMessage(null), 1600);
  };

  // TV remote autofocus on mount: focus the Language/Audio selector button so user can immediately switch language/quality or go back
  useEffect(() => {
    const tId = setTimeout(() => {
      (audioBtnRef.current || backBtnRef.current)?.focus({ preventScroll: true });
    }, 120);
    return () => clearTimeout(tId);
  }, []);

  // Auto-focus first / selected button when opening a modal menu, and restore focus to trigger button when closing
  useEffect(() => {
    if (activeMenu !== 'none') {
      const tId = setTimeout(() => {
        if (!modalBoxRef.current) return;
        const preferred =
          modalBoxRef.current.querySelector<HTMLElement>('[data-menu-initial-focus="true"]') ||
          modalBoxRef.current.querySelector<HTMLElement>('button:not([disabled])');
        preferred?.focus({ preventScroll: true });
      }, 60);
      prevMenuRef.current = activeMenu;
      return () => clearTimeout(tId);
    } else if (prevMenuRef.current !== 'none') {
      const last = prevMenuRef.current;
      prevMenuRef.current = 'none';
      const tId = setTimeout(() => {
        if (last === 'audio') audioBtnRef.current?.focus({ preventScroll: true });
        else if (last === 'quality') qualityBtnRef.current?.focus({ preventScroll: true });
        else if (last === 'torrents') torrentsBtnRef.current?.focus({ preventScroll: true });
        else if (last === 'episodes') episodesBtnRef.current?.focus({ preventScroll: true });
      }, 40);
      return () => clearTimeout(tId);
    }
  }, [activeMenu]);

  // Virtual Remote Mouse Cursor D-Pad Interceptor
  useEffect(() => {
    if (!isVirtualCursorActive) {
      window.__cinemaCustomDpadHandler = null;
      window.__cinemaCustomDpadEnterHandler = null;
      return;
    }

    const stepX = 0.035;
    const stepY = 0.045;

    window.__cinemaCustomDpadHandler = (key: string) => {
      setVirtualCursorPos((prev) => {
        let nx = prev.x;
        let ny = prev.y;
        if (key === 'ArrowLeft') nx = Math.max(0.03, prev.x - stepX);
        else if (key === 'ArrowRight') nx = Math.min(0.97, prev.x + stepX);
        else if (key === 'ArrowUp') ny = Math.max(0.04, prev.y - stepY);
        else if (key === 'ArrowDown') ny = Math.min(0.96, prev.y + stepY);
        return { x: nx, y: ny };
      });
      return true;
    };

    window.__cinemaCustomDpadEnterHandler = () => {
      setVirtualCursorPos((pos) => {
        if (window.AndroidCinemaBridge?.simulateScreenTap) {
          window.AndroidCinemaBridge.simulateScreenTap(pos.x, pos.y);
        } else if (window.__cinemaEnsureClickAt) {
          window.__cinemaEnsureClickAt(pos.x, pos.y);
        }
        return pos;
      });
      showOsd('🖱️ Клік виконано');
      return true;
    };

    return () => {
      window.__cinemaCustomDpadHandler = null;
      window.__cinemaCustomDpadEnterHandler = null;
    };
  }, [isVirtualCursorActive]);

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
  }, [effectiveEmbedUrl, activeServer?.id]);

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

  const scrollServersRow = (dir: 'left' | 'right') => {
    if (!serversRowRef.current) return;
    const step = Math.max(180, serversRowRef.current.clientWidth * 0.6);
    serversRowRef.current.scrollBy({
      left: dir === 'left' ? -step : step,
      behavior: 'smooth',
    });
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
    window.__cinemaHandlePlayerBack = () => {
      if (isVirtualCursorActive) {
        setIsVirtualCursorActive(false);
        showOsd('🖱️ Курсор пульта вимкнено');
        return true;
      }
      if (activeMenu !== 'none') {
        setActiveMenu('none');
        return true;
      }
      return false;
    };
    return () => {
      delete window.__cinemaHandlePlayerBack;
    };
  }, [isVirtualCursorActive, activeMenu]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      resetControlsTimeout();

      if (e.key === 'Escape' || e.key === 'Backspace') {
        if ((document.activeElement as HTMLElement)?.tagName === 'INPUT') return;
        e.preventDefault();
        if (isVirtualCursorActive) {
          setIsVirtualCursorActive(false);
          showOsd('🖱️ Курсор пульта вимкнено');
          return;
        }
        if (activeMenu !== 'none') {
          setActiveMenu('none');
          return;
        }
        onClose();
        return;
      }

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
        case 'e':
        case 'E':
          if (isSeries) {
            e.preventDefault();
            setActiveMenu((prev) => (prev === 'episodes' ? 'none' : 'episodes'));
          }
          break;
        case 'k':
        case 'K':
          if (activeServer?.mode === 'native') {
            e.preventDefault();
            togglePlay();
            showOsd(isPlaying ? '⏸ Пауза' : '▶ Відтворення');
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

    // Listen to native hardware remote media & shortcut keys forwarded from MainActivity
    const handleRemoteMedia = (e: any) => {
      const keyCode = e.detail?.keyCode;
      if (keyCode === 85) {
        togglePlay();
        showOsd(isPlaying ? '⏸ Пауза' : '▶ Відтворення');
      } else if (keyCode === 126) {
        if (videoRef.current && videoRef.current.paused) videoRef.current.play();
        setIsPlaying(true);
        showOsd('▶ Відтворення');
      } else if (keyCode === 127) {
        if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
        setIsPlaying(false);
        showOsd('⏸ Пауза');
      } else if (keyCode === 90) {
        seek(10);
        showOsd('⏩ +10 сек');
      } else if (keyCode === 89) {
        seek(-10);
        showOsd('⏪ -10 сек');
      } else if (keyCode === 87 && isSeries) {
        setActiveEpisode((prev) => prev + 1);
        showOsd('⏭ Наступна серія');
      } else if (keyCode === 88 && isSeries) {
        setActiveEpisode((prev) => Math.max(1, prev - 1));
        showOsd('⏮ Попередня серія');
      } else if (keyCode === 86) {
        onClose();
      } else if (keyCode === 222 || keyCode === 175) {
        // KEYCODE_MEDIA_AUDIO_TRACK or KEYCODE_CAPTIONS -> Open Language/Audio Menu
        setActiveMenu((prev) => (prev === 'audio' ? 'none' : 'audio'));
      } else if (keyCode === 82 || keyCode === 176) {
        // KEYCODE_MENU or KEYCODE_SETTINGS -> Open Quality Menu
        setActiveMenu((prev) => (prev === 'quality' ? 'none' : 'quality'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('cinema-remote-media', handleRemoteMedia);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('cinema-remote-media', handleRemoteMedia);
    };
  }, [
    isPlaying,
    volume,
    isMuted,
    isFullscreen,
    activeServer?.mode,
    isSeries,
    activeMenu,
    isVirtualCursorActive,
    onClose,
  ]);

  const getCurrentAudioLabel = () => {
    const idLow = (activeServer?.id || '').toLowerCase();
    if (idLow.includes('ashdi')) return '🇺🇦 Ashdi UA';
    if (idLow.includes('ua-kino-rezka')) return '🇺🇦 КіноБаза UA';
    if (idLow.includes('ua-videasy')) return '🇺🇦 Videasy UA';
    if (idLow.includes('ua-autoembed')) return '🇺🇦 AutoEmbed UA';
    if (idLow.includes('loadbox')) return '🎭 Rezka Multi';
    if (idLow.startsWith('pl-')) return '🇵🇱 Polski';
    if (idLow.startsWith('es-')) return '🇪🇸 Español';
    if (activeServer?.mode === 'torrent') return '⚡ P2P Торрент';
    if (activeServer?.langs && activeServer.langs.length > 0) return `🌐 ${activeServer.langs[0]}`;
    return '🇺🇦 Мова';
  };

  const getCurrentQualityLabel = () => {
    if (preferredQuality === '4K') return '💎 4K HDR';
    if (preferredQuality === '1080p') return '📺 1080p FHD';
    if (preferredQuality === '720p') return '⚡ 720p HD';
    return '📱 480p SD';
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
      className="fixed inset-0 z-50 bg-black flex flex-col select-none overflow-hidden"
    >
      {/* ========================================================
          DEDICATED TV REMOTE & MOUSE TOP CONTROL BAR
          ======================================================== */}
      <div className="shrink-0 z-30 bg-[#07090e] border-b border-white/15 px-2.5 sm:px-5 py-2 space-y-2">
        {/* Row 1: Unified Single-Row Navigation Strip (D-Pad Left/Right steps across every control!) */}
        <div
          data-nav-row="player-top"
          className="flex items-center justify-between gap-2 w-full min-w-0"
        >
          {/* Left: Back Button + Compact Title */}
          <div className="flex items-center gap-2 min-w-0 shrink">
            <button
              ref={backBtnRef}
              type="button"
              onClick={onClose}
              tabIndex={0}
              className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-red-600 text-white transition-all active:scale-95 shrink-0 tv-btn-focus focus:outline-none border border-white/10"
              aria-label={t('closePlayer')}
              title="Закрити плеєр (ESC / Назад)"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="min-w-0 hidden xs:block sm:block max-w-[140px] sm:max-w-[240px] lg:max-w-[340px]">
              <h2 className="text-white font-bold text-xs sm:text-sm truncate">{title}</h2>
              <p className="text-[10px] text-amber-400 font-medium truncate">
                {isSeries
                  ? `${t('seasonWord')} ${activeSeason} • ${t('episodeWord')} ${activeEpisode}`
                  : subtitle || `${media.year} • ${preferredQuality}`}
              </p>
            </div>
          </div>

          {/* Right: Scrollable Primary Player Controls (Never clipped, 100% D-Pad & Mouse accessible!) */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none py-0.5 px-0.5 max-w-full">
            {/* 1. LANGUAGE / AUDIO SELECTOR BUTTON */}
            <button
              ref={audioBtnRef}
              type="button"
              onClick={() => setActiveMenu((prev) => (prev === 'audio' ? 'none' : 'audio'))}
              tabIndex={0}
              className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border whitespace-nowrap shrink-0 transition-all tv-btn-focus focus:outline-none ${
                activeMenu === 'audio'
                  ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
              }`}
              title="Змінити мову та озвучення (A)"
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              <span>Мова: {getCurrentAudioLabel()}</span>
            </button>

            {/* 2. QUALITY SELECTOR BUTTON */}
            <button
              ref={qualityBtnRef}
              type="button"
              onClick={() => setActiveMenu((prev) => (prev === 'quality' ? 'none' : 'quality'))}
              tabIndex={0}
              className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border whitespace-nowrap shrink-0 transition-all tv-btn-focus focus:outline-none ${
                activeMenu === 'quality'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-lg shadow-emerald-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
              }`}
              title="Змінити якість відео (Q)"
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span>Якість: {getCurrentQualityLabel()}</span>
            </button>

            {/* 3. TORRENT STREAM BUTTON */}
            <button
              ref={torrentsBtnRef}
              type="button"
              onClick={() => setActiveMenu((prev) => (prev === 'torrents' ? 'none' : 'torrents'))}
              tabIndex={0}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border whitespace-nowrap shrink-0 transition-all tv-btn-focus focus:outline-none ${
                activeMenu === 'torrents' || activeServer?.mode === 'torrent'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30'
                  : 'bg-purple-500/15 text-purple-300 border-purple-500/35 hover:bg-purple-500/25'
              }`}
              title="Торренти онлайн P2P (T)"
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span>⚡ Торренти</span>
              {torrentStreams.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-purple-500/30 text-purple-200">
                  {torrentStreams.length}
                </span>
              )}
            </button>

            {/* 4. Series Season & Episode Selector Buttons (100% Remote & Mouse friendly, no native <select> trap!) */}
            {isSeries && (
              <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-xl border border-white/10 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveEpisode((prev) => Math.max(1, prev - 1));
                    showOsd(`⏮ Серія ${Math.max(1, activeEpisode - 1)}`);
                  }}
                  disabled={activeEpisode <= 1}
                  tabIndex={0}
                  className="p-1.5 rounded-lg hover:bg-white/15 disabled:opacity-30 text-white tv-btn-focus focus:outline-none"
                  title={t('prevEpisode')}
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>

                <button
                  ref={episodesBtnRef}
                  type="button"
                  onClick={() => setActiveMenu((prev) => (prev === 'episodes' ? 'none' : 'episodes'))}
                  tabIndex={0}
                  className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-all tv-btn-focus focus:outline-none ${
                    activeMenu === 'episodes'
                      ? 'bg-red-600 text-white'
                      : 'bg-white/10 text-amber-300 hover:bg-white/20'
                  }`}
                  title="Вибір сезону та серії (E)"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    С{activeSeason}:Е{activeEpisode}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveEpisode((prev) => prev + 1);
                    showOsd(`⏭ Серія ${activeEpisode + 1}`);
                  }}
                  tabIndex={0}
                  className="p-1.5 rounded-lg hover:bg-white/15 text-white tv-btn-focus focus:outline-none"
                  title={t('nextEpisode')}
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 5. Next Server Quick Failover Button */}
            {availableServers.filter((s) => s.mode === 'embed').length > 1 && (
              <button
                type="button"
                onClick={switchToNextServer}
                tabIndex={0}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1 shadow-md shadow-red-600/30 active:scale-95 whitespace-nowrap shrink-0 transition-all tv-btn-focus focus:outline-none"
                title={t('nextServer')}
              >
                <span>{t('nextServer')}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            )}

            {/* 6. Virtual Remote Mouse Cursor Toggle (for clicking inside embedded iframe players with D-Pad) */}
            <button
              type="button"
              onClick={() => {
                const next = !isVirtualCursorActive;
                setIsVirtualCursorActive(next);
                showOsd(
                  next
                    ? '🖱️ Курсор пульта увімкнено (Стрілки = рух, ОК = клік, Назад = вихід)'
                    : '🖱️ Курсор пульта вимкнено'
                );
              }}
              tabIndex={0}
              className={`px-2.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1 border whitespace-nowrap shrink-0 transition-all tv-btn-focus focus:outline-none ${
                isVirtualCursorActive
                  ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/40'
                  : 'bg-white/10 text-slate-200 border-white/15 hover:bg-white/20'
              }`}
              title="Віртуальна мишка для пульта (клік всередині плеєра)"
            >
              <MousePointer className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Курсор</span>
            </button>

            {/* 7. Fullscreen / Landscape Lock Button */}
            <button
              type="button"
              onClick={toggleAndroidLandscape}
              tabIndex={0}
              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 border shrink-0 transition-all tv-btn-focus focus:outline-none ${
                isLandscapeLocked
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-white/10 text-slate-200 border-white/15 hover:bg-white/20'
              }`}
              title={isLandscapeLocked ? t('rotateNormal') : t('rotateLandscape')}
            >
              <Smartphone
                className={`w-4 h-4 ${isLandscapeLocked ? 'rotate-90' : ''} transition-transform`}
              />
            </button>
          </div>
        </div>

        {/* Row 2: Multi-Server Switcher Carousel with Left/Right Scroll Buttons */}
        <div
          data-nav-row="player-servers"
          className="flex items-center gap-1.5 w-full min-w-0"
        >
          <span className="text-[10px] font-bold text-slate-400 uppercase hidden sm:flex items-center gap-1 shrink-0 mr-0.5">
            <Server className="w-3 h-3 text-red-500" /> {t('serverLabel')}
          </span>

          <button
            type="button"
            onClick={() => scrollServersRow('left')}
            tabIndex={0}
            className="p-1 rounded-lg bg-white/5 hover:bg-red-600 text-slate-300 hover:text-white shrink-0 transition-colors tv-btn-focus focus:outline-none border border-white/10"
            aria-label="Попередні сервери"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div
            ref={serversRowRef}
            onWheel={(e) => {
              if (serversRowRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                serversRowRef.current.scrollLeft += e.deltaY;
              }
            }}
            className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-none scroll-smooth py-0.5 px-0.5"
          >
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
                    type="button"
                    onClick={() => {
                      setSelectedServerId(srv.id);
                      if (srv.mode === 'torrent' && srv.magnet) {
                        setCurrentMagnet(srv.magnet);
                      }
                      showOsd(`📡 ${srv.name}`);
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
                type="button"
                onClick={() => setShowCustomUrlInput(!showCustomUrlInput)}
                tabIndex={0}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap flex items-center gap-1 shrink-0 tv-btn-focus focus:outline-none"
              >
                <Link2 className="w-3 h-3" /> {t('customStream')}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => scrollServersRow('right')}
            tabIndex={0}
            className="p-1 rounded-lg bg-white/5 hover:bg-red-600 text-slate-300 hover:text-white shrink-0 transition-colors tv-btn-focus focus:outline-none border border-white/10"
            aria-label="Наступні сервери"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
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
              type="button"
              onClick={() => setShowCustomUrlInput(false)}
              tabIndex={0}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold tv-btn-focus focus:outline-none"
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
          QUICK OVERLAY MENUS FOR TV REMOTE & MOUSE
          (Scoped with data-modal-scope="true" for 100% D-Pad focus lock)
          ======================================================== */}
      {activeMenu !== 'none' && (
        <div
          data-modal-scope="true"
          className="absolute inset-0 z-40 bg-black/85 flex items-center justify-center p-3 sm:p-5 animate-fadeIn"
          onClick={() => setActiveMenu('none')}
        >
          <div
            ref={modalBoxRef}
            className="bg-[#0b0f19] border border-white/20 rounded-2xl max-w-lg w-full p-4 sm:p-5 space-y-4 shadow-2xl text-left max-h-[86dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <h3 className="text-white text-sm sm:text-lg font-extrabold flex items-center gap-2">
                {activeMenu === 'audio' && (
                  <>
                    <Radio className="w-5 h-5 text-amber-400 shrink-0" />
                    <span>Вибір мови та озвучення</span>
                  </>
                )}
                {activeMenu === 'quality' && (
                  <>
                    <Settings className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span>Вибір якості відео та потоку</span>
                  </>
                )}
                {activeMenu === 'torrents' && (
                  <>
                    <HardDrive className="w-5 h-5 text-purple-400 shrink-0" />
                    <span>P2P Торренти онлайн ({torrentStreams.length})</span>
                  </>
                )}
                {activeMenu === 'episodes' && (
                  <>
                    <Layers className="w-5 h-5 text-red-500 shrink-0" />
                    <span>Вибір сезону та серії</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setActiveMenu('none')}
                tabIndex={0}
                className="p-2 rounded-xl bg-white/10 hover:bg-red-600 text-slate-200 hover:text-white transition-all tv-btn-focus focus:outline-none"
                aria-label="Закрити меню"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. AUDIO / LANGUAGE CHANNELS MENU */}
            {activeMenu === 'audio' && (
              <div className="space-y-3 overflow-y-auto custom-scrollbar pr-1">
                <div
                  data-nav-row="audio-lang-filters"
                  className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1"
                >
                  {[
                    { id: 'all', label: '🌐 Усі мови' },
                    { id: 'ua', label: '🇺🇦 Українська' },
                    { id: 'en', label: '🇬🇧 English' },
                    { id: 'pl', label: '🇵🇱 Polski' },
                    { id: 'es', label: '🇪🇸 Español' },
                    { id: 'multi', label: '🎭 Multi / Студії' },
                  ].map((lf) => (
                    <button
                      key={lf.id}
                      type="button"
                      onClick={() => setAudioLangFilter(lf.id)}
                      tabIndex={0}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all tv-btn-focus focus:outline-none ${
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
                  Оберіть бажаний мовний канал пультами або мишкою (спочатку українські канали, далі — усі світові мови):
                </p>

                <div className="space-y-2">
                  {availableServers
                    .filter((srv) => srv.mode !== 'torrent' || srv.id === activeServer?.id)
                    .filter((srv) => {
                      if (audioLangFilter === 'all') return true;
                      const idLow = srv.id.toLowerCase();
                      if (audioLangFilter === 'ua')
                        return idLow.startsWith('ua-') || idLow.includes('ashdi') || srv.langs?.includes('UA');
                      if (audioLangFilter === 'en')
                        return (
                          idLow.includes('vidlink') ||
                          idLow.includes('vidsrc') ||
                          idLow.includes('vidfast') ||
                          srv.langs?.includes('EN')
                        );
                      if (audioLangFilter === 'pl')
                        return idLow.startsWith('pl-') || srv.langs?.includes('PL');
                      if (audioLangFilter === 'es')
                        return idLow.startsWith('es-') || srv.langs?.includes('ES');
                      return srv.langs?.includes('MULTI') || srv.langs?.includes('RU') || idLow.includes('loadbox');
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
                        if (idLow.includes('ashdi'))
                          return '🇺🇦 Повний професійний український дубляж (UAKino / Ashdi)';
                        if (idLow.includes('ua-kino-rezka'))
                          return '🇺🇦 Українська озвучка та дубляж (КіноБаза UA)';
                        if (idLow.includes('ua-videasy'))
                          return '🇺🇦 Український потік 4K HDR + субтитри';
                        if (idLow.includes('ua-autoembed'))
                          return '🇺🇦 Український дубляж та багатоголосий переклад';
                        if (isPl) return '🇵🇱 Polski Lektor / Dubbing / Napisy PL';
                        if (isEs) return '🇪🇸 Español Latino / Castellano + Subtítulos';
                        if (isRezka)
                          return '🎭 Багатоголосе озвучення (UA / EN / Rezka / LostFilm)';
                        if (isTorrent)
                          return '⚡ P2P потік без стиснення з оригінальними доріжками';
                        return '🇬🇧 English Original 4K / 1080p + Multi Subtitles';
                      };

                      return (
                        <button
                          key={srv.id}
                          type="button"
                          data-menu-initial-focus={isCur ? 'true' : undefined}
                          onClick={() => {
                            setSelectedServerId(srv.id);
                            if (isTorrent && srv.magnet) setCurrentMagnet(srv.magnet);
                            setActiveMenu('none');
                            showOsd(`🔊 ${srv.name}`);
                          }}
                          tabIndex={0}
                          className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all tv-btn-focus focus:outline-none ${
                            isCur
                              ? 'bg-red-600 text-white border-red-400 shadow-md'
                              : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xl shrink-0">
                              {isUa
                                ? '🇺🇦'
                                : isPl
                                  ? '🇵🇱'
                                  : isEs
                                    ? '🇪🇸'
                                    : isRezka
                                      ? '🎭'
                                      : isTorrent
                                        ? '⚡'
                                        : '🇬🇧'}
                            </span>
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm truncate">{srv.name}</h4>
                              <p className="text-xs text-slate-300 line-clamp-1">{getDesc()}</p>
                            </div>
                          </div>
                          {isCur && <Check className="w-5 h-5 text-white shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* 2. QUALITY & STREAM RESOLUTION MENU */}
            {activeMenu === 'quality' && (
              <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    1. Роздільна здатність відео (для поточного каналу):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        q: '4K' as const,
                        label: '💎 4K Ultra HD (2160p HDR)',
                        desc: 'Максимальна чіткість для Smart TV та проєкторів',
                      },
                      {
                        q: '1080p' as const,
                        label: '📺 1080p Full HD',
                        desc: 'Оптимальна висока якість без затримок',
                      },
                      {
                        q: '720p' as const,
                        label: '⚡ 720p HD Ready',
                        desc: 'Швидка буферизація при середній мережі',
                      },
                      {
                        q: '480p' as const,
                        label: '📱 480p SD Економ',
                        desc: 'Стабільне відтворення при слабкому інтернеті',
                      },
                    ].map((res) => {
                      const isSelectedRes = preferredQuality === res.q;
                      return (
                        <button
                          key={res.q}
                          type="button"
                          data-menu-initial-focus={isSelectedRes ? 'true' : undefined}
                          onClick={() => {
                            setPreferredQuality(res.q);
                            if (hlsRef.current && hlsRef.current.levels.length > 0) {
                              const targetH =
                                res.q === '4K'
                                  ? 2160
                                  : res.q === '1080p'
                                    ? 1080
                                    : res.q === '720p'
                                      ? 720
                                      : 480;
                              let bestLevel = -1;
                              let minDiff = Infinity;
                              hlsRef.current.levels.forEach((lvl, idx) => {
                                const diff = Math.abs((lvl.height || 1080) - targetH);
                                if (diff < minDiff) {
                                  minDiff = diff;
                                  bestLevel = idx;
                                }
                              });
                              hlsRef.current.currentLevel = bestLevel;
                            }
                            setActiveMenu('none');
                            showOsd(`💎 Якість: ${res.label}`);
                          }}
                          tabIndex={0}
                          className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all tv-btn-focus focus:outline-none ${
                            isSelectedRes
                              ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg'
                              : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/15'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <h4 className="font-extrabold text-xs sm:text-sm">{res.label}</h4>
                            <p className="text-[11px] text-slate-300 line-clamp-1">{res.desc}</p>
                          </div>
                          {isSelectedRes && <Check className="w-5 h-5 text-white shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Direct Server + Quality Selection */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    2. Пряме перемикання серверів за якістю:
                  </p>
                  <div className="space-y-2">
                    {availableServers
                      .filter((s) => s.mode === 'embed')
                      .slice(0, 8)
                      .map((srv) => {
                        const isCur = activeServer?.id === srv.id;
                        return (
                          <button
                            key={srv.id}
                            type="button"
                            onClick={() => {
                              setSelectedServerId(srv.id);
                              if (srv.badge.includes('4K')) setPreferredQuality('4K');
                              else setPreferredQuality('1080p');
                              setActiveMenu('none');
                              showOsd(`📺 Сервер: ${srv.name}`);
                            }}
                            tabIndex={0}
                            className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all tv-btn-focus focus:outline-none ${
                              isCur
                                ? 'bg-red-600/90 text-white border-red-400 shadow'
                                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/15'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-black/40 text-amber-300 shrink-0">
                                {srv.badge}
                              </span>
                              <span className="font-bold text-xs sm:text-sm truncate">
                                {srv.name}
                              </span>
                            </div>
                            {isCur && <Check className="w-4 h-4 text-white shrink-0" />}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* 3. TORRENTS MENU */}
            {activeMenu === 'torrents' && (
              <div className="space-y-3 overflow-y-auto custom-scrollbar pr-1">
                <div
                  data-nav-row="torrent-lang-filters"
                  className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1"
                >
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
                      type="button"
                      onClick={() => setTorrentLangFilter(tf.id)}
                      tabIndex={0}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all tv-btn-focus focus:outline-none ${
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
                      if (torrentLangFilter === 'ua')
                        return c.includes('ua') || c.includes('укр') || c.includes('🇺🇦');
                      if (torrentLangFilter === '4k') return c.includes('4k') || c.includes('2160');
                      if (torrentLangFilter === 'en') return c.includes('en') || c.includes('eng');
                      if (torrentLangFilter === 'pl')
                        return c.includes('pl') || c.includes('pol') || c.includes('lektor');
                      if (torrentLangFilter === 'es')
                        return c.includes('es') || c.includes('esp') || c.includes('latino');
                      return true;
                    })
                    .map((tItem, idx) => (
                      <button
                        key={tItem.id}
                        type="button"
                        data-menu-initial-focus={idx === 0 ? 'true' : undefined}
                        onClick={() => {
                          setCurrentMagnet(tItem.magnet);
                          setSelectedServerId(`torrent-${tItem.id}`);
                          setActiveMenu('none');
                          showOsd(`⚡ P2P: ${tItem.quality}`);
                        }}
                        tabIndex={0}
                        className="w-full p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-purple-900/40 hover:border-purple-500/50 text-left flex items-center justify-between transition-all tv-btn-focus focus:outline-none"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600/30 text-purple-300 border border-purple-500/30">
                              {tItem.tracker}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {tItem.quality}
                            </span>
                            <span className="text-xs font-mono text-emerald-400 font-bold">
                              ▲ {tItem.seeds} seeds
                            </span>
                            <span className="text-xs font-mono text-slate-400">{tItem.size}</span>
                          </div>
                          <h4 className="font-semibold text-white text-xs sm:text-sm line-clamp-1">
                            {tItem.title}
                          </h4>
                          <p className="text-[11px] text-slate-400">{tItem.audio}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-purple-600 text-white shrink-0 ml-3 shadow-md">
                          <Play className="w-4 h-4 fill-white" />
                        </div>
                      </button>
                    ))
                )}
              </div>
            )}

            {/* 4. SEASONS & EPISODES SELECTOR MODAL (100% D-Pad & Mouse friendly!) */}
            {activeMenu === 'episodes' && (
              <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1">
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-amber-400 uppercase">Оберіть сезон:</p>
                  <div
                    data-nav-row="season-selector"
                    className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1"
                  >
                    {Array.from(
                      { length: Math.max(media.seasonsCount || 6, activeSeason) },
                      (_, i) => i + 1
                    ).map((sNum) => {
                      const isCurS = activeSeason === sNum;
                      return (
                        <button
                          key={sNum}
                          type="button"
                          onClick={() => {
                            setActiveSeason(sNum);
                            setActiveEpisode(1);
                          }}
                          tabIndex={0}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap border transition-all tv-btn-focus focus:outline-none ${
                            isCurS
                              ? 'bg-amber-500 text-slate-950 border-amber-300 shadow'
                              : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/15'
                          }`}
                        >
                          {t('seasonWord')} {sNum}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-300 uppercase">
                    Оберіть серію ({t('seasonWord')} {activeSeason}):
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((eNum) => {
                      const isCurE = activeEpisode === eNum;
                      return (
                        <button
                          key={eNum}
                          type="button"
                          data-menu-initial-focus={isCurE ? 'true' : undefined}
                          onClick={() => {
                            setActiveEpisode(eNum);
                            setActiveMenu('none');
                            showOsd(`📺 Сезон ${activeSeason} • Серія ${eNum}`);
                          }}
                          tabIndex={0}
                          className={`py-2.5 px-2 rounded-xl text-xs font-extrabold border text-center transition-all tv-btn-focus focus:outline-none ${
                            isCurE
                              ? 'bg-red-600 text-white border-red-400 shadow-lg'
                              : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/15'
                          }`}
                        >
                          Еп. {eNum}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          MAIN VIDEO VIEWPORT
          ======================================================== */}
      <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
        {/* Virtual Remote Mouse Cursor Overlay (when enabled for D-Pad remote) */}
        {isVirtualCursorActive && (
          <>
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-blue-950/90 border border-blue-400 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-2xl">
              <span>🖱️ Курсор пульта: Стрілки = рух, ОК = клік</span>
              <button
                type="button"
                onClick={() => setIsVirtualCursorActive(false)}
                className="px-2 py-0.5 rounded-full bg-red-600 text-[10px] font-black"
              >
                Вийти (Назад)
              </button>
            </div>
            <div
              style={{
                left: `${virtualCursorPos.x * 100}%`,
                top: `${virtualCursorPos.y * 100}%`,
              }}
              className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
            >
              <div className="relative flex items-center justify-center">
                <div className="w-7 h-7 rounded-full border-2 border-red-500 bg-red-500/25 shadow-[0_0_16px_rgba(239,68,68,0.95)] flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              </div>
            </div>
          </>
        )}

        {/* On-Screen Display (OSD) feedback for Remote Control and Mouse */}
        {osdMessage && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none bg-black/95 border border-white/25 text-white px-6 py-3.5 rounded-2xl text-sm sm:text-xl font-black shadow-2xl animate-fadeIn flex items-center gap-3">
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
                  Підключення до P2P-роздачі{' '}
                  <span className="text-purple-400 font-bold">{activeServer.name}</span>...
                </p>
                <p className="text-[11px] text-slate-500 px-6 text-center pt-1">
                  Буферизація відеопотоку безпосередньо з мережі торент-пірів.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={switchToNextServer}
                    tabIndex={0}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-red-600 text-white text-xs font-bold border border-white/15 transition-all tv-btn-focus focus:outline-none"
                  >
                    Перемкнути на звичайний сервер
                  </button>
                </div>
              </div>
            )}
            <div
              id="webtor-torrent-target"
              className="w-full h-full flex items-center justify-center"
            />
          </div>
        ) : activeServer && activeServer.mode !== 'native' ? (
          /* 2. EMBED / IFRAME STREAMING VIEWPORT */
          <>
            {iframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#05070c] z-10">
                <div className="w-11 h-11 rounded-full border-4 border-red-600/30 border-t-red-600 animate-spin" />
                <p className="text-xs text-slate-300 font-medium">
                  {t('connectingTo')}{' '}
                  <span className="text-amber-400 font-bold">{activeServer.name}</span> (
                  {preferredQuality})...
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={switchToNextServer}
                    tabIndex={0}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-red-600 text-white text-xs font-bold border border-white/15 transition-all tv-btn-focus focus:outline-none"
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
              key={effectiveEmbedUrl}
              src={effectiveEmbedUrl}
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
                  type="button"
                  tabIndex={0}
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
                  type="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (nonEmbedQualities.length > 1) {
                      const curIdx = nonEmbedQualities.findIndex(
                        (q) => q.url === selectedQuality.url
                      );
                      const next = nonEmbedQualities[(curIdx + 1) % nonEmbedQualities.length];
                      if (next) setSelectedQuality(next);
                    }
                    setActiveMenu(activeMenu === 'quality' ? 'none' : 'quality');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-black/80 text-xs font-bold text-emerald-400 border border-white/15 flex items-center gap-1.5 tv-btn-focus focus:outline-none"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{preferredQuality}</span>
                </button>
              </div>

              {/* Center Play/Seek Touch & Remote Controls */}
              <div
                data-nav-row="native-center-controls"
                className="flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto"
              >
                <button
                  type="button"
                  onClick={() => seek(-10)}
                  tabIndex={0}
                  className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 text-white active:scale-90 transition-transform tv-btn-focus focus:outline-none"
                  aria-label="Перемотати назад 10 сек"
                >
                  <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  tabIndex={0}
                  className="p-5 sm:p-6 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-600/40 active:scale-95 transition-all tv-btn-focus focus:outline-none"
                  aria-label={isPlaying ? 'Пауза' : 'Відтворення'}
                >
                  {isPlaying ? (
                    <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-white" />
                  ) : (
                    <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-white ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
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
                  className="relative w-full h-2.5 bg-white/20 rounded-full cursor-pointer overflow-hidden"
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
                      type="button"
                      onClick={toggleMute}
                      tabIndex={0}
                      className="p-1.5 rounded-lg hover:text-white tv-btn-focus focus:outline-none"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      tabIndex={0}
                      className="p-1.5 rounded-lg hover:text-white tv-btn-focus focus:outline-none"
                    >
                      {isFullscreen ? (
                        <Minimize className="w-4 h-4" />
                      ) : (
                        <Maximize className="w-4 h-4" />
                      )}
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
