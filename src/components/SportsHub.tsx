import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Radio,
  RefreshCw,
  Tv,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  Signal,
  CheckCircle2,
  Zap,
  Clock,
  Eye,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import {
  SportCategory,
  SportChannel,
  SportEvent,
  SportScannerStats,
  SportStreamNode,
} from '../types/sports';
import { sportsService, resolveTeamLogo } from '../services/sports';

interface SportsHubProps {
  onBackHome: () => void;
}

const TeamLogo: React.FC<{
  team: NonNullable<SportEvent['homeTeam']>;
  sport?: SportCategory;
  size?: 'sm' | 'lg';
}> = ({ team, sport = 'all', size = 'sm' }) => {
  const resolvedSrc = resolveTeamLogo(team.name, team.logo, sport);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedSrc, team.name]);

  const abbr = (team.shortName || team.name || 'TM').slice(0, 3).toUpperCase();

  if (!resolvedSrc || imgFailed) {
    return (
      <div
        className={
          size === 'lg'
            ? 'w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-emerald-600/30 via-slate-800 to-slate-900 border border-emerald-400/40 flex items-center justify-center font-black text-base sm:text-lg text-emerald-300 shadow-inner shrink-0'
            : 'w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600/25 via-slate-800 to-slate-900 border border-white/15 flex items-center justify-center text-xs font-black text-emerald-300 shrink-0'
        }
      >
        {abbr}
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={team.name}
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className={
        size === 'lg'
          ? 'w-14 h-14 sm:w-16 sm:h-16 object-contain drop-shadow-lg shrink-0'
          : 'w-9 h-9 object-contain drop-shadow shrink-0'
      }
    />
  );
};

const SPORT_TABS: Array<{ id: SportCategory; label: string; icon: string }> = [
  { id: 'all', label: 'Усі події Live', icon: '🔥' },
  { id: 'nba', label: 'НБА (NBA Live Scanner)', icon: '🏀' },
  { id: 'ucl', label: 'Ліга Чемпіонів', icon: '🏆' },
  { id: 'football', label: 'Футбол (Топ-ліги)', icon: '⚽' },
  { id: 'nfl', label: 'НФЛ (NFL & RedZone)', icon: '🏈' },
  { id: 'boxing', label: 'Бокс & UFC / MMA', icon: '🥊' },
  { id: 'f1', label: 'Формула 1 & Мото', icon: '🏎️' },
  { id: 'tennis', label: 'Теніс (ATP / WTA)', icon: '🎾' },
  { id: 'nhl', label: 'Хокей (NHL)', icon: '🏒' },
];

export const SportsHub: React.FC<SportsHubProps> = ({ onBackHome }) => {
  const [selectedSport, setSelectedSport] = useState<SportCategory>('all');
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [channels, setChannels] = useState<SportChannel[]>(() => sportsService.getChannels('all'));
  const [scannerStats, setScannerStats] = useState<SportScannerStats>(() =>
    sportsService.getScannerStats()
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [scanStageText, setScanStageText] = useState<string>(
    'Автономний сканер вільних потоків (StreamFree 1080p + Vinegret NBA + Free HLS)...'
  );

  // Active playback inside Sports Hub
  const [activePlayback, setActivePlayback] = useState<{
    id: string;
    title: string;
    subtitle: string;
    badge: string;
    homeTeam?: SportEvent['homeTeam'];
    awayTeam?: SportEvent['awayTeam'];
    statusText?: string;
    viewers?: number;
    streams: SportStreamNode[];
    activeIndex: number;
  } | null>(null);

  const [streamHuntingMsg, setStreamHuntingMsg] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const channelsRowRef = useRef<HTMLDivElement>(null);
  const tabsRowRef = useRef<HTMLDivElement>(null);

  // Load & auto-refresh live events every 60 seconds (localized silent updates)
  const loadSportsData = async (force = false, isSilent = false) => {
    if (force && !isSilent) setIsRefreshing(true);
    setScanStageText('Сканування безкоштовних live-потоків (1080p FHD / HLS / Повні матчі)...');
    try {
      const list = await sportsService.getEvents(force);
      const updatedChannels = sportsService.getChannels('all');
      const stats = sportsService.getScannerStats();
      setEvents(list);
      setChannels([...updatedChannels]);
      setScannerStats(stats);
      setScanStageText(
        `Сканер активний: ${stats.totalFreeStreams} безкоштовних потоків • ${stats.liveMatchesCount} LIVE матчів • 100% Free`
      );

      // Localized background update: silently sync metadata on active playback WITHOUT interrupting stream
      setActivePlayback((prev) => {
        if (!prev) return null;
        const fresh = list.find((e) => e.id === prev.id);
        if (fresh) {
          return {
            ...prev,
            homeTeam: fresh.homeTeam || prev.homeTeam,
            awayTeam: fresh.awayTeam || prev.awayTeam,
            statusText: fresh.statusText || prev.statusText,
            viewers: fresh.viewers !== undefined ? fresh.viewers : prev.viewers,
          };
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
      if (!isSilent) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadSportsData(false, false);
    const interval = setInterval(() => {
      // Localized background updates without blinking or stream interruptions!
      loadSportsData(true, true);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const activeNode = activePlayback
    ? activePlayback.streams[activePlayback.activeIndex] || activePlayback.streams[0]
    : null;

  const isHls = activeNode?.mode === 'hls';
  const failedIndicesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    failedIndicesRef.current.clear();
  }, [activePlayback?.id]);

  // Smooth iframe stream switching without DOM unmounting or page reloads!
  useEffect(() => {
    if (!activeNode) {
      if (iframeRef.current && iframeRef.current.src !== 'about:blank') {
        iframeRef.current.src = 'about:blank';
      }
      return;
    }
    if (activeNode.mode === 'embed') {
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {}
      }
      if (iframeRef.current && iframeRef.current.src !== activeNode.url) {
        setIframeLoading(true);
        iframeRef.current.src = activeNode.url;
      }
    } else if (iframeRef.current && iframeRef.current.src !== 'about:blank') {
      // Silence previous embed when switching to native HLS
      iframeRef.current.src = 'about:blank';
    }
  }, [activeNode?.url, activeNode?.mode]);

  // Trigger failover to the next working stream ("до переможного!") without infinite loops
  const switchToNextStreamNode = (reason?: string, isManual: boolean = false) => {
    if (!activePlayback || activePlayback.streams.length <= 1) return;
    if (!isManual) {
      failedIndicesRef.current.add(activePlayback.activeIndex);
    } else {
      failedIndicesRef.current.clear();
    }

    let nextIdx = -1;
    for (let step = 1; step < activePlayback.streams.length; step++) {
      const candIdx = (activePlayback.activeIndex + step) % activePlayback.streams.length;
      if (isManual || !failedIndicesRef.current.has(candIdx)) {
        nextIdx = candIdx;
        break;
      }
    }
    if (nextIdx === -1) return;

    const nextNode = activePlayback.streams[nextIdx];
    setIframeLoading(true);
    setActivePlayback((prev) => (prev ? { ...prev, activeIndex: nextIdx } : null));
    setStreamHuntingMsg(
      reason
        ? `${reason} → Автоперемикання на ${nextNode.name}...`
        : `Активовано потік: ${nextNode.name}`
    );
    setTimeout(() => setStreamHuntingMsg(null), 3500);
  };

  // Listen for Subframe Fatal Errors (e.g. JWPlayer Error Code: 233011) and auto-switch stream node!
  useEffect(() => {
    if (!activePlayback) return;
    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== 'object' || !data.__cinemaPlayerBridge) return;
      if (data.type === 'videoState') {
        setIframeLoading(false);
      } else if (data.type === 'subframeFatalError') {
        switchToNextStreamNode('Потік зайнятий або недоступний', false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activePlayback]);

  // Connection watchdog: if an embed stream hangs on loading for >7.5s, auto-switch to next slot
  useEffect(() => {
    if (!activePlayback || !activeNode || !iframeLoading) return;
    const timer = setTimeout(() => {
      setIframeLoading(false);
    }, 6500);
    return () => clearTimeout(timer);
  }, [activePlayback?.id, activeNode?.id, iframeLoading]);

  // Native HLS (.m3u8) stream lifecycle with high-resilience buffer & self-healing recovery
  useEffect(() => {
    if (!activeNode || activeNode.mode !== 'hls') return;
    const video = videoRef.current;
    if (!video || !activeNode.url) return;

    setIframeLoading(true);
    let hasStartedPlayback = false;
    let networkRetryCount = 0;

    if (Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        manifestLoadingTimeOut: 4500,
        manifestLoadingMaxRetry: 2,
        levelLoadingTimeOut: 5000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 8000,
        fragLoadingMaxRetry: 4,
      });
      hlsRef.current = hls;
      hls.loadSource(activeNode.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hasStartedPlayback = true;
        networkRetryCount = 0;
        setIframeLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        hasStartedPlayback = true;
        networkRetryCount = 0;
        setIframeLoading(false);
      });
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            hasStartedPlayback &&
            networkRetryCount < 4
          ) {
            // Hold live stream without dropping on transient CDN hiccups
            networkRetryCount += 1;
            setTimeout(() => {
              try {
                hls.startLoad();
                video.play().catch(() => {});
              } catch {
                // Ignore
              }
            }, 600);
          } else {
            // Auto-hunt next stream node ("до переможного!")
            switchToNextStreamNode('Потік зайнятий');
          }
        }
      });
    } else {
      video.src = activeNode.url;
      video.onloadedmetadata = () => {
        setIframeLoading(false);
        video.play().catch(() => {});
      };
      video.onerror = () => {
        switchToNextStreamNode('Помилка HLS потоку');
      };
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeNode?.id, activeNode?.url, activeNode?.mode]);

  // Escape key closes active sports player first, then returns to Home
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activePlayback) {
          setActivePlayback(null);
        } else {
          onBackHome();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activePlayback, onBackHome]);

  const openEventPlayer = (ev: SportEvent, initialIdx = 0) => {
    setIframeLoading(true);
    setActivePlayback({
      id: ev.id,
      title: ev.title.toUpperCase(),
      subtitle: `${ev.league}${ev.venue ? ` • ${ev.venue}` : ''}`,
      badge: ev.leagueBadge,
      homeTeam: ev.homeTeam,
      awayTeam: ev.awayTeam,
      statusText: ev.statusText,
      viewers: ev.viewers,
      streams: ev.streams,
      activeIndex: initialIdx,
    });
  };

  const openChannelPlayer = (ch: SportChannel, initialIdx = 0) => {
    setIframeLoading(true);
    setActivePlayback({
      id: ch.id,
      title: `${ch.icon} ${ch.name}`,
      subtitle: ch.currentProgram,
      badge: ch.badge,
      statusText: '🔴 FREE LIVE 24/7',
      streams: ch.streams,
      activeIndex: initialIdx,
    });
  };

  // Switch match or channel directly inside the player dropdown (like vinegret.net/nba-na-vinegret/)
  const handleQuickSwitchInsidePlayer = (targetId: string) => {
    const foundEv = events.find((e) => e.id === targetId);
    if (foundEv) {
      openEventPlayer(foundEv, 0);
      return;
    }
    const foundCh = channels.find((c) => c.id === targetId);
    if (foundCh) {
      openChannelPlayer(foundCh, 0);
    }
  };

  const scrollChannels = (dir: 'left' | 'right') => {
    if (!channelsRowRef.current) return;
    const first = channelsRowRef.current.firstElementChild as HTMLElement | null;
    if (first) {
      const gap = 14;
      const step = first.offsetWidth + gap;
      const visible = Math.max(1, Math.round(channelsRowRef.current.clientWidth / step));
      const amount = visible * step;
      channelsRowRef.current.scrollBy({
        left: dir === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
    } else {
      const amount = channelsRowRef.current.clientWidth;
      channelsRowRef.current.scrollBy({
        left: dir === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
    }
  };

  const scrollTabs = (dir: 'left' | 'right') => {
    if (!tabsRowRef.current) return;
    const amount = Math.max(160, tabsRowRef.current.clientWidth * 0.65);
    tabsRowRef.current.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  const filteredEvents =
    selectedSport === 'all'
      ? events
      : events.filter(
          (e) =>
            e.sport === selectedSport ||
            (selectedSport === 'football' && e.sport === 'ucl') ||
            (selectedSport === 'ucl' && e.sport === 'football' && /champions|uefa/i.test(e.league))
        );

  const filteredChannels =
    selectedSport === 'all'
      ? channels
      : channels.filter(
          (c) =>
            c.sport === selectedSport ||
            c.sport === 'all' ||
            (selectedSport === 'football' && c.sport === 'ucl') ||
            (selectedSport === 'ucl' && c.sport === 'football')
        );

  // Strict 3-Way Partition:
  // 1. LIVE matches currently underway
  // 2. UPCOMING announcements (scheduled for later)
  // 3. FINISHED match results (retained up to 48h)
  const liveEvents = filteredEvents.filter((e) => e.status === 'live');
  const upcomingEvents = filteredEvents.filter((e) => e.status === 'upcoming');
  const finishedEvents = filteredEvents.filter((e) => e.status === 'finished');
  const heroEvent = liveEvents[0] || upcomingEvents[0] || filteredEvents[0] || events[0];

  const handleScanStreams = async () => {
    setIsRefreshing(true);
    setScanStageText('Глибоке live-сканування потоків (ESPN • StreamFree FHD • Direct HLS)...');
    try {
      const freshEvents = await sportsService.scanAllSourcesLive((stage) => {
        setScanStageText(stage);
      });
      const stats = sportsService.getScannerStats();
      setEvents(freshEvents);
      setChannels([...sportsService.getChannels('all')]);
      setScannerStats(stats);
      setScanStageText(
        `Сканер оновлено: ${stats.liveMatchesCount} LIVE • ${stats.upcomingMatchesCount ?? freshEvents.filter((ev: SportEvent) => ev.status === 'upcoming').length} анонсів • ${stats.finishedMatchesCount ?? freshEvents.filter((ev: SportEvent) => ev.status === 'finished').length} завершених (48г) • ${stats.totalFreeStreams} потоків`
      );
    } catch {
      setScanStageText('Помилка оновлення потоків. Спробуйте ще раз.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#07090e] text-slate-100 pb-16">
      {/* Top Autonomous Free Stream Scanner Bar */}
      <div className="bg-gradient-to-r from-[#0b1322] via-[#0f172a] to-[#0b1322] border-b border-emerald-500/20 px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackHome}
              tabIndex={0}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 border border-white/15 transition-all tv-btn-focus focus:outline-none"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Кінозал</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
              </span>
              <h1 className="text-base sm:text-xl font-black tracking-tight text-white uppercase flex items-center gap-2">
                <span>СПОРТ</span>
                <span className="text-emerald-400">FREE LIVE SCANNER</span>
              </h1>
            </div>
          </div>

          {/* Live Scanner Telemetry Pills */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <Signal className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>{scanStageText}</span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>100% Безкоштовно • Без підписок</span>
            </div>

            <button
              onClick={handleScanStreams}
              disabled={isRefreshing}
              tabIndex={0}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-emerald-600/25 active:scale-95 transition-all tv-btn-focus focus:outline-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Сканувати потоки</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Free Stream Scanner Telemetry Strip */}
      <div className="bg-[#090e1a] border-b border-white/10 px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <span className="flex items-center gap-1.5 font-extrabold text-emerald-400">
              <Activity className="w-4 h-4" />
              <span>СКАНЕР ВІЛЬНИХ ПОТОКІВ:</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 font-bold">
              🔴 LIVE: {scannerStats.liveMatchesCount}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 font-bold">
              📅 Анонси: {scannerStats.upcomingMatchesCount ?? upcomingEvents.length}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
              🏁 Завершені (&lt;48г): {scannerStats.finishedMatchesCount ?? finishedEvents.length}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
              ⚡ Всі потоки: {scannerStats.totalFreeStreams}
            </span>
            <span className="hidden md:inline-block px-2.5 py-0.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 font-bold">
              📡 StreamFree 1080p: {scannerStats.streamFreeNodes}
            </span>
            <span className="hidden lg:inline-block px-2.5 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold">
              📺 Direct HLS (.m3u8): {scannerStats.directHlsNodes}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Оновлено о {scannerStats.lastScanTime}
          </span>
        </div>
      </div>

      {/* Hero Featured Live Match Arena */}
      {heroEvent && (
        <div className="relative w-full overflow-hidden border-b border-white/10 bg-[#080d18]">
          <img
            src={heroEvent.poster}
            alt={heroEvent.title}
            className="absolute inset-0 w-full h-full object-cover object-center opacity-35 filter brightness-75 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07090e] via-[#07090e]/75 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07090e] via-[#07090e]/85 to-transparent" />

          <div className="relative max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-10 z-10">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Left Info */}
              <div className="space-y-3 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-red-600 text-white uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-red-600/40">
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    {heroEvent.statusText}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {heroEvent.leagueBadge} • {heroEvent.league}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    🔓 100% Free Multi-Stream (1080p FHD)
                  </span>
                  {heroEvent.viewers && heroEvent.viewers > 0 ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      <span>{heroEvent.viewers.toLocaleString()} глядачів</span>
                    </span>
                  ) : null}
                </div>

                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight uppercase">
                  {heroEvent.title}
                </h2>

                <p className="text-xs sm:text-sm text-slate-300">
                  {heroEvent.subtitle} • Доступно {heroEvent.streams.length} безкоштовних потоків
                  (Потік A 1080p / Потік B 540p / Прямий HLS / Хайлайти / Повний запис)
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  <button
                    onClick={() => openEventPlayer(heroEvent, 0)}
                    tabIndex={0}
                    className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-xl shadow-red-600/40 active:scale-95 transition-all tv-btn-focus focus:outline-none"
                  >
                    <Play className="w-5 h-5 fill-white" />
                    <span>Увімкнути Потік A (1080p Live)</span>
                  </button>

                  {heroEvent.streams.slice(1, 5).map((node, idx) => (
                    <button
                      key={node.id}
                      onClick={() => openEventPlayer(heroEvent, idx + 1)}
                      tabIndex={0}
                      className="px-3.5 py-3 rounded-2xl bg-white/10 hover:bg-emerald-600/30 text-white font-bold text-xs flex items-center gap-1.5 border border-white/15 hover:border-emerald-400/50 transition-all tv-btn-focus focus:outline-none"
                    >
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        {node.slot ? `Потік ${node.slot}` : node.badge} • {node.quality}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Live Scoreboard Card */}
              {heroEvent.homeTeam && heroEvent.awayTeam && (
                <div className="bg-[#0d1424]/95 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-2xl flex items-center justify-around gap-4 sm:gap-6 w-full lg:w-auto sm:min-w-[360px]">
                  <div className="flex flex-col items-center text-center gap-2 flex-1">
                    <TeamLogo team={heroEvent.homeTeam} sport={heroEvent.sport} size="lg" />
                    <span className="text-xs sm:text-sm font-black text-white line-clamp-1 uppercase tracking-wider">
                      {heroEvent.homeTeam.name.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1 px-3">
                    {heroEvent.homeTeam.score !== undefined &&
                    heroEvent.awayTeam.score !== undefined ? (
                      <div className="text-3xl sm:text-4xl font-black text-amber-400 tracking-wider font-mono">
                        {heroEvent.homeTeam.score} : {heroEvent.awayTeam.score}
                      </div>
                    ) : (
                      <div className="text-xl sm:text-2xl font-black text-slate-400">VS</div>
                    )}
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-500/30 uppercase">
                      {heroEvent.status === 'live' ? 'LIVE ARENA' : heroEvent.status === 'finished' ? 'FINAL' : 'UPCOMING'}
                    </span>
                  </div>

                  <div className="flex flex-col items-center text-center gap-2 flex-1">
                    <TeamLogo team={heroEvent.awayTeam} sport={heroEvent.sport} size="lg" />
                    <span className="text-xs sm:text-sm font-black text-white line-clamp-1 uppercase tracking-wider">
                      {heroEvent.awayTeam.name.toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-[1700px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-6 space-y-8 tv-safe-container">
        {/* Sport Disciplines Filter Carousel with Arrows & Snap */}
        <div data-nav-row="sports-tabs" className="flex items-center gap-1.5 w-full min-w-0">
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            tabIndex={0}
            aria-label="Попередні види спорту"
            className="p-2 rounded-xl bg-white/5 hover:bg-emerald-600 active:bg-emerald-600 text-slate-300 hover:text-white shrink-0 transition-all tv-btn-focus focus:outline-none border border-white/10"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div
            ref={tabsRowRef}
            onWheel={(e) => {
              if (tabsRowRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                tabsRowRef.current.scrollLeft += e.deltaY;
              }
            }}
            className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth pb-1"
          >
            {SPORT_TABS.map((tab) => {
              const active = selectedSport === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={(e) => {
                    if (tabsRowRef.current) {
                      const cRect = tabsRowRef.current.getBoundingClientRect();
                      const bRect = e.currentTarget.getBoundingClientRect();
                      const offset = bRect.left - cRect.left + tabsRowRef.current.scrollLeft;
                      tabsRowRef.current.scrollTo({
                        left: Math.max(0, offset - tabsRowRef.current.clientWidth / 2 + bRect.width / 2),
                        behavior: 'smooth',
                      });
                    }
                    setSelectedSport(tab.id);
                  }}
                  tabIndex={0}
                  className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold whitespace-nowrap flex items-center gap-2 border transition-all shrink-0 snap-start tv-btn-focus focus:outline-none ${
                    active
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/30'
                      : 'bg-[#0e1525] text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="text-base">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollTabs('right')}
            tabIndex={0}
            aria-label="Наступні види спорту"
            className="p-2 rounded-xl bg-white/5 hover:bg-emerald-600 active:bg-emerald-600 text-slate-300 hover:text-white shrink-0 transition-all tv-btn-focus focus:outline-none border border-white/10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================================
            1. 24/7 FREE LIVE SPORTS ARENA CHANNELS CAROUSEL
            ======================================================== */}
        <section className="space-y-3.5 w-full min-w-0">
          <div className="flex items-center justify-between gap-2 w-full min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Tv className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="text-base sm:text-2xl font-black text-white truncate">
                📡 Безкоштовні спортивні канали 24/7
              </h2>
              <span className="hidden md:inline-block shrink-0 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                100% Free • Direct HLS & Live
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => scrollChannels('left')}
                tabIndex={0}
                className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-emerald-600 text-slate-300 hover:text-white transition-all tv-btn-focus focus:outline-none border border-white/10"
                aria-label="Попередні канали"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                onClick={() => scrollChannels('right')}
                tabIndex={0}
                className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-emerald-600 text-slate-300 hover:text-white transition-all tv-btn-focus focus:outline-none border border-white/10"
                aria-label="Наступні канали"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>

          <div
            ref={channelsRowRef}
            data-nav-row="sports-channels"
            style={{ overflowAnchor: 'none' }}
            onWheel={(e) => {
              if (channelsRowRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                channelsRowRef.current.scrollLeft += e.deltaY;
              }
            }}
            className="flex items-stretch gap-3 sm:gap-3.5 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth pb-2"
          >
            {filteredChannels.map((ch) => (
              <div
                key={ch.id}
                tabIndex={0}
                role="button"
                onClick={() => openChannelPlayer(ch, 0)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openChannelPlayer(ch, 0);
                  }
                }}
                className="w-[calc((100%-12px)/2)] sm:w-[calc((100%-28px)/3)] lg:w-[calc((100%-42px)/4)] xl:w-[calc((100%-56px)/5)] shrink-0 snap-start rounded-2xl bg-[#0d1322] border border-white/10 hover:border-emerald-500/60 p-3 sm:p-4 flex flex-col justify-between gap-2.5 sm:gap-3 cursor-pointer group transition-all tv-card-focus focus:outline-none shadow-lg"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-white/10 text-white flex items-center gap-1">
                      <span>{ch.icon}</span>
                      <span>{ch.badge}</span>
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      FREE LIVE
                    </span>
                  </div>

                  {/* Channel Logo Banner */}
                  <div
                    className={`h-20 rounded-xl bg-gradient-to-br ${ch.accentColor} flex items-center justify-center p-3 shadow-inner relative overflow-hidden`}
                  >
                    <span className="text-base sm:text-lg font-black text-white tracking-wider text-center drop-shadow">
                      {ch.logoText}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-extrabold text-sm text-white group-hover:text-emerald-400 transition-colors truncate">
                      {ch.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                      {ch.currentProgram}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-400">
                    {ch.streams.length} незалежні потоки • 1080p
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-emerald-600 group-hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow">
                    <Play className="w-3 h-3 fill-white" />
                    <span>Дивитись</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================
            2. LIVE MATCHES HAPPENING RIGHT NOW
            ======================================================== */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-red-600 animate-ping" />
              <h2 className="text-lg sm:text-2xl font-black text-white">
                🔴 Зараз у прямому ефірі ({liveEvents.length})
              </h2>
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline">
              Прямі трансляції • Оновлення статусу в реальному часі
            </span>
          </div>

          {isLoading ? (
            <div
              data-nav-row="sports-live-events"
              style={{ overflowAnchor: 'none' }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-48 rounded-2xl bg-white/5 border border-white/10 animate-pulse p-5"
                />
              ))}
            </div>
          ) : liveEvents.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#0c1220]/70 border border-white/10 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Radio className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Наразі немає активних прямих матчів у вибраній категорії
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Матчі, які вже завершилися, переміщено до розділу результатів нижче. Перегляньте анонси найближчих трансляцій або скористайтесь 24/7 спортивними каналами вгорі.
                </p>
              </div>
              <button
                type="button"
                onClick={handleScanStreams}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-emerald-600 text-white text-xs font-bold border border-white/15 transition-all shrink-0"
              >
                Оновити розклад
              </button>
            </div>
          ) : (
            <div
              data-nav-row="sports-live-events"
              style={{ overflowAnchor: 'none' }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {liveEvents.map((ev) => (
                <div
                  key={ev.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => openEventPlayer(ev, 0)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEventPlayer(ev, 0);
                    }
                  }}
                  className="group relative rounded-2xl bg-[#0c1220] border border-white/15 hover:border-red-500/60 overflow-hidden shadow-xl flex flex-col justify-between p-4 sm:p-5 cursor-pointer transition-all tv-card-focus focus:outline-none"
                >
                  {/* Top League & Live Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold bg-white/10 text-amber-300 truncate">
                      {ev.leagueBadge} • {ev.league}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {ev.viewers && ev.viewers > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {ev.viewers}
                        </span>
                      ) : null}
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-red-600/25 text-red-400 border border-red-500/40 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                        {ev.statusText}
                      </span>
                    </div>
                  </div>

                  {/* Teams & Scoreboard */}
                  {ev.homeTeam && ev.awayTeam ? (
                    <div className="my-2 py-3 px-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <TeamLogo team={ev.homeTeam} sport={ev.sport} size="sm" />
                        <span className="text-xs sm:text-sm font-black text-white truncate uppercase tracking-wide">
                          {ev.homeTeam.name.toUpperCase()}
                        </span>
                      </div>

                      <div className="px-3 py-1 rounded-lg bg-white/10 text-amber-400 font-black text-base sm:text-lg font-mono shrink-0">
                        {ev.homeTeam.score !== undefined && ev.awayTeam.score !== undefined
                          ? `${ev.homeTeam.score} : ${ev.awayTeam.score}`
                          : 'LIVE'}
                      </div>

                      <div className="flex items-center justify-end gap-2.5 min-w-0 flex-1 text-right">
                        <span className="text-xs sm:text-sm font-black text-white truncate uppercase tracking-wide">
                          {ev.awayTeam.name.toUpperCase()}
                        </span>
                        <TeamLogo team={ev.awayTeam} sport={ev.sport} size="sm" />
                      </div>
                    </div>
                  ) : (
                    <div className="my-2">
                      <h3 className="text-base sm:text-lg font-black text-white line-clamp-2 uppercase tracking-wide">
                        {ev.title.toUpperCase()}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">{ev.subtitle}</p>
                    </div>
                  )}

                  {/* Stream Nodes Footer (Потік A / B / C / D) */}
                  <div className="pt-3 mt-2 border-t border-white/10 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                      {ev.streams.slice(0, 4).map((node, idx) => (
                        <button
                          key={node.id}
                          type="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEventPlayer(ev, idx);
                          }}
                          className="px-2 py-1 rounded-md bg-white/5 hover:bg-emerald-600/30 text-[10px] font-bold text-slate-200 border border-white/10 hover:border-emerald-400/50 whitespace-nowrap transition-colors tv-btn-focus focus:outline-none"
                        >
                          {node.slot ? `Потік ${node.slot}` : node.badge}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEventPlayer(ev, 0);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-red-600 group-hover:bg-red-500 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-md shadow-red-600/30 tv-btn-focus focus:outline-none"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Потік A</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ========================================================
            3. UPCOMING SCHEDULE & ANNOUNCEMENTS (STRICTLY AFTER LIVE)
            ======================================================== */}
        {upcomingEvents.length > 0 && (
          <section className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg sm:text-2xl font-black text-white">
                  📅 Анонси майбутніх трансляцій ({upcomingEvents.length})
                </h2>
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline">
                Розклад майбутніх матчів • Прямі ефіри відкриються перед початком
              </span>
            </div>

            <div
              data-nav-row="sports-upcoming-events"
              style={{ overflowAnchor: 'none' }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {upcomingEvents.map((ev) => (
                <div
                  key={ev.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => openEventPlayer(ev, 0)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEventPlayer(ev, 0);
                    }
                  }}
                  className="group rounded-2xl bg-[#0b101c] border border-white/10 hover:border-blue-500/50 p-4 sm:p-5 flex flex-col justify-between gap-3 cursor-pointer transition-all tv-card-focus focus:outline-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-white/5 text-slate-300">
                      {ev.leagueBadge} • {ev.league}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {ev.statusText}
                    </span>
                  </div>

                  {ev.homeTeam && ev.awayTeam ? (
                    <div className="py-2.5 px-3 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <TeamLogo team={ev.homeTeam} sport={ev.sport} size="sm" />
                        <span className="text-xs sm:text-sm font-black text-white truncate uppercase tracking-wide">
                          {ev.homeTeam.name.toUpperCase()}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-white/5 text-[11px] font-black text-slate-400 shrink-0">
                        VS
                      </span>
                      <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
                        <span className="text-xs sm:text-sm font-black text-white truncate uppercase tracking-wide">
                          {ev.awayTeam.name.toUpperCase()}
                        </span>
                        <TeamLogo team={ev.awayTeam} sport={ev.sport} size="sm" />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-white group-hover:text-blue-400 transition-colors uppercase tracking-wide">
                        {ev.title.toUpperCase()}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">{ev.subtitle}</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                      {ev.streams.slice(0, 3).map((node, idx) => (
                        <button
                          key={node.id}
                          type="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEventPlayer(ev, idx);
                          }}
                          className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[10px] font-bold text-slate-300 border border-white/10 whitespace-nowrap tv-btn-focus focus:outline-none"
                        >
                          {node.slot ? `Потік ${node.slot}` : node.badge}
                        </button>
                      ))}
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-white/10 group-hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors">
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Анонс</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ========================================================
            4. FINISHED MATCH RESULTS (RETAINED UP TO 48 HOURS)
            ======================================================== */}
        {finishedEvents.length > 0 && (
          <section className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg sm:text-2xl font-black text-white">
                  🏁 Результати завершених матчів ({finishedEvents.length})
                </h2>
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline">
                Історія за останні 48 годин • Фінальні рахунки та хайлайти
              </span>
            </div>

            <div
              data-nav-row="sports-finished-events"
              style={{ overflowAnchor: 'none' }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {finishedEvents.map((ev) => (
                <div
                  key={ev.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => openEventPlayer(ev, 0)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEventPlayer(ev, 0);
                    }
                  }}
                  className="group rounded-2xl bg-[#090d16] border border-white/10 hover:border-emerald-500/50 p-4 sm:p-5 flex flex-col justify-between gap-3 cursor-pointer transition-all tv-card-focus focus:outline-none opacity-90 hover:opacity-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-white/5 text-slate-300">
                      {ev.leagueBadge} • {ev.league}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      {ev.statusText || 'Фінальний рахунок'}
                    </span>
                  </div>

                  {ev.homeTeam && ev.awayTeam ? (
                    <div className="py-2.5 px-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <TeamLogo team={ev.homeTeam} sport={ev.sport} size="sm" />
                        <span className="text-xs sm:text-sm font-black text-white truncate uppercase tracking-wide">
                          {ev.homeTeam.name.toUpperCase()}
                        </span>
                      </div>

                      <div className="px-3 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 font-mono font-black text-base sm:text-lg shrink-0">
                        {ev.homeTeam.score !== undefined && ev.awayTeam.score !== undefined
                          ? `${ev.homeTeam.score} : ${ev.awayTeam.score}`
                          : 'FT'}
                      </div>

                      <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
                        <span className="text-xs sm:text-sm font-black text-white truncate uppercase tracking-wide">
                          {ev.awayTeam.name.toUpperCase()}
                        </span>
                        <TeamLogo team={ev.awayTeam} sport={ev.sport} size="sm" />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                        {ev.title.toUpperCase()}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">{ev.subtitle}</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400">
                      Зберігається до 48 год
                    </span>
                    <span className="px-3 py-1.5 rounded-xl bg-white/10 group-hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors">
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{ev.streams.length > 0 ? 'Запис / Огляд' : 'Огляд матчу'}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ========================================================
          FULLSCREEN SPORTS STREAM PLAYER MODAL ("ДО ПЕРЕМОЖНОГО")
          Modeled after vinegret.net/nba-na-vinegret/
          ======================================================== */}
      {activePlayback && activeNode && (
        <div
          data-cinema-player-fullscreen="true"
          className="fixed inset-0 z-50 bg-black flex flex-col select-none overflow-hidden animate-fadeIn"
        >
          {/* Top Control, Quick Match Selector & Stream Switcher Bar */}
          <div className="shrink-0 bg-[#070a12] border-b border-white/15 px-3 sm:px-5 py-2.5 space-y-2 z-30">
            <div
              data-nav-row="sports-player-top"
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={() => setActivePlayback(null)}
                  tabIndex={0}
                  className="p-2 rounded-xl bg-white/10 hover:bg-red-600 text-white transition-all tv-btn-focus focus:outline-none"
                  title="Повернутися до Спорт-Хабу (ESC)"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-600 text-white shrink-0">
                      {activePlayback.statusText || 'LIVE'}
                    </span>
                    <h2 className="text-white font-extrabold text-xs sm:text-base truncate">
                      {activePlayback.title}
                    </h2>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{activePlayback.subtitle}</p>
                </div>
              </div>

              {/* Quick Match & Channel Selector Dropdown (like vinegret.net/nba-na-vinegret/) */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={activePlayback.id}
                  onChange={(e) => handleQuickSwitchInsidePlayer(e.target.value)}
                  className="bg-[#111827] text-white text-xs font-bold px-3 py-2 rounded-xl border border-emerald-500/40 focus:outline-none focus:border-emerald-400 max-w-[230px] sm:max-w-[320px] truncate"
                  title="Швидкий вибір матчу або спортивного каналу"
                >
                  <optgroup label="🔴 Зараз у прямому ефірі">
                    {events.filter(e => e.status === 'live').map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        🔴 {ev.leagueBadge}: {ev.title.toUpperCase()}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="📅 Анонси майбутніх трансляцій">
                    {events.filter(e => e.status === 'upcoming').map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        📅 {ev.leagueBadge}: {ev.title.toUpperCase()} ({ev.statusText})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🏁 Результати (останні 48 годин)">
                    {events.filter(e => e.status === 'finished').map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        🏁 {ev.leagueBadge}: {ev.title.toUpperCase()} ({ev.homeTeam?.score ?? '-'}:{ev.awayTeam?.score ?? '-'})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="📡 Спортивні канали 24/7 (Free)">
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.icon} {ch.name}
                      </option>
                    ))}
                  </optgroup>
                </select>

                {/* Live Score Pill in Player Header */}
                {activePlayback.homeTeam &&
                  activePlayback.awayTeam &&
                  activePlayback.homeTeam.score !== undefined && (
                    <div className="hidden lg:flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-xs font-bold text-white">
                        {activePlayback.homeTeam.shortName}
                      </span>
                      <span className="text-sm font-black text-amber-400 font-mono">
                        {activePlayback.homeTeam.score} : {activePlayback.awayTeam.score}
                      </span>
                      <span className="text-xs font-bold text-white">
                        {activePlayback.awayTeam.shortName}
                      </span>
                    </div>
                  )}

                {/* Auto-Hunt Next Stream Button ("До переможного!") */}
                <button
                  onClick={() => switchToNextStreamNode(undefined, true)}
                  tabIndex={0}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 active:scale-95 transition-all tv-btn-focus focus:outline-none shrink-0"
                  title="Знайти наступний стабільний безкоштовний потік"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>
                    До переможного ({activePlayback.activeIndex + 1}/{activePlayback.streams.length})
                  </span>
                </button>
              </div>
            </div>

            {/* Stream Nodes Carousel Bar (Потік A / B / C / D / E) */}
            <div
              data-nav-row="sports-player-streams"
              className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5"
            >
              <span className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1 shrink-0 mr-1">
                <Sparkles className="w-3 h-3" /> Вільні потоки:
              </span>
              {activePlayback.streams.map((node, idx) => {
                const isCur = idx === activePlayback.activeIndex;
                return (
                  <button
                    key={node.id}
                    onClick={() => {
                      failedIndicesRef.current.clear();
                      setIframeLoading(true);
                      setActivePlayback((prev) => (prev ? { ...prev, activeIndex: idx } : null));
                    }}
                    tabIndex={0}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 border transition-all shrink-0 tv-btn-focus focus:outline-none ${
                      isCur
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {isCur && <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />}
                    <span>{node.name}</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-black/30 text-amber-300">
                      {node.quality}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stream Hunter Toast */}
          {streamHuntingMsg && (
            <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 bg-black/95 border border-emerald-500 text-emerald-300 px-4 py-2 rounded-xl text-xs font-bold shadow-2xl flex items-center gap-2 animate-fadeIn">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              <span>{streamHuntingMsg}</span>
            </div>
          )}

          {/* Video / Stream Viewport (NO sandbox on iframe so strmfree.st 1080p embeds play cleanly!) */}
          <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
            {iframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#050811] z-10">
                <div className="w-12 h-12 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                <p className="text-xs sm:text-sm text-slate-200 font-bold text-center px-4">
                  Підключення до безкоштовного потоку:{' '}
                  <span className="text-emerald-400">{activeNode.name}</span>
                </p>
                <button
                  type="button"
                  tabIndex={0}
                  onClick={() => switchToNextStreamNode('Швидке перемикання', true)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-emerald-600 text-white text-xs font-bold border border-white/15 transition-all tv-btn-focus focus:outline-none"
                >
                  Увімкнути наступний потік (Потік B / C / D)
                </button>
              </div>
            )}

            {/* Native HLS Video: permanently mounted, toggled by display to eliminate DOM teardown */}
            <video
              ref={videoRef}
              controls
              autoPlay
              playsInline
              style={{ display: isHls ? 'block' : 'none' }}
              className="w-full h-full object-contain bg-black"
            />

            {/* Seamless Embed Stream Frame: permanently mounted, NO key to prevent DOM unmounts/blinking! */}
            <iframe
              ref={iframeRef}
              title={activePlayback.title}
              scrolling="no"
              style={{ display: !isHls ? 'block' : 'none', overflow: 'hidden' }}
              onLoad={() => setIframeLoading(false)}
              referrerPolicy="origin"
              className="w-full h-full border-0 bg-black overflow-hidden"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  );
};
