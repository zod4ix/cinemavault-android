import React, { useState, useEffect } from 'react';
import { 
  X, Play, Heart, Download, Check, Star, Wifi, HardDrive, 
  Layers, Clock, Copy, Sparkles, Globe, Youtube, Loader2, Users
} from 'lucide-react';
import { MediaItem, Season, Episode, MediaSource, TorrentItem } from '../types/movie';
import { tmdbService, createPosterFallback } from '../services/tmdb';
import { rezkaService } from '../services/rezka';
import { torrentService } from '../services/torrent';
import { useLanguage } from '../i18n/LanguageContext';

interface MediaModalProps {
  media: MediaItem | null;
  onClose: () => void;
  onPlayOnline: (media: MediaItem, source: MediaSource, episode?: Episode) => void;
  isFavorite: boolean;
  onToggleFavorite: (media: MediaItem) => void;
}

export const MediaModal: React.FC<MediaModalProps> = ({
  media,
  onClose,
  onPlayOnline,
  isFavorite,
  onToggleFavorite,
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'online' | 'torrents' | 'episodes'>('online');
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [torrents, setTorrents] = useState<TorrentItem[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState<boolean>(false);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | undefined>();
  const [copiedMagnet, setCopiedMagnet] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: number }>({});
  const [backdropSrc, setBackdropSrc] = useState<string>('');

  useEffect(() => {
    if (!media) return;
    setBackdropSrc(media.backdropPath || media.posterPath || createPosterFallback(media.title, media.year, media.rating));

    // Resolve sources & torrents
    rezkaService.resolveSources(media, 1, 1).then(setSources);
    torrentService.searchTorrents(media).then(setTorrents);

    // Load seasons & real episodes from TVMaze / API
    if (media.mediaType === 'tv' || media.mediaType === 'anime') {
      setActiveTab('episodes');
      setLoadingEpisodes(true);
      tmdbService.getSeasonsLive(media).then((s) => {
        setSeasons(s);
        if (s.length > 0) {
          setSelectedSeason(s[0].seasonNumber);
          setSelectedEpisode(s[0].episodes[0]);
        }
        setLoadingEpisodes(false);
      });
    } else {
      setSeasons([]);
      setSelectedEpisode(undefined);
      setActiveTab('online');
    }
  }, [media]);

  // Update sources when selected episode changes
  useEffect(() => {
    if (!media || !selectedEpisode) return;
    rezkaService.resolveSources(media, selectedEpisode.seasonNumber, selectedEpisode.episodeNumber).then(setSources);
  }, [media, selectedEpisode]);

  if (!media) return null;

  const handleCopyMagnet = (magnet: string, id: string) => {
    navigator.clipboard.writeText(magnet);
    setCopiedMagnet(id);
    setTimeout(() => setCopiedMagnet(null), 2500);
  };

  const handleFakeDownload = (name: string) => {
    setDownloadProgress((prev) => ({ ...prev, [name]: 5 }));
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        const curr = prev[name] || 0;
        if (curr >= 100) {
          clearInterval(interval);
          return { ...prev, [name]: 100 };
        }
        return { ...prev, [name]: curr + 15 };
      });
    }, 400);
  };

  const getMediaLabel = () => {
    switch (media.mediaType) {
      case 'tv': return t('tvSeries');
      case 'cartoon': return t('cartoon');
      case 'anime': return t('animeLabel');
      default: return t('movie');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl bg-[#0c101a] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Backdrop Banner Header */}
        <div className="relative h-52 sm:h-72 w-full shrink-0 overflow-hidden bg-slate-900">
          <img
            src={backdropSrc}
            alt={media.title}
            onError={() => setBackdropSrc(createPosterFallback(media.title, media.year, media.rating))}
            className="w-full h-full object-cover object-center filter brightness-75"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c101a] via-[#0c101a]/50 to-transparent" />
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-black/60 hover:bg-red-600 text-white backdrop-blur-md border border-white/15 transition-all z-20"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Quick Header Overlay */}
          <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-red-600 text-white uppercase">
                  {getMediaLabel()}
                </span>
                {media.quality && (
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {media.quality}
                  </span>
                )}
                {media.hasUkrainianAudio && (
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    🇺🇦 {t('voiced')}
                  </span>
                )}
                {media.imdbId && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/10 text-slate-300">
                    IMDb: {media.imdbId}
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-3xl font-black text-white drop-shadow-md leading-tight">
                {media.title}
              </h2>
              {media.originalTitle && media.originalTitle !== media.title && (
                <p className="text-xs text-slate-400 font-medium">{media.originalTitle}</p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  if (sources[0]) onPlayOnline(media, sources[0], selectedEpisode);
                }}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xl shadow-red-600/40 active:scale-95 transition-all"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{t('watchNow')}</span>
              </button>

              <button
                onClick={() => onToggleFavorite(media)}
                className={`p-2.5 rounded-xl border backdrop-blur-md transition-all shrink-0 ${
                  isFavorite 
                    ? 'bg-red-600 text-white border-red-500' 
                    : 'bg-black/60 text-slate-300 hover:text-white border-white/20'
                }`}
              >
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-white' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-4 sm:px-6 pt-3 border-b border-white/10 bg-[#0c101a] shrink-0 overflow-x-auto scrollbar-none">
          {(media.mediaType === 'tv' || media.mediaType === 'anime') && (
            <button
              onClick={() => setActiveTab('episodes')}
              className={`flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'episodes'
                  ? 'border-red-500 text-red-500'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>{t('tabEpisodes')} ({seasons.reduce((acc, s) => acc + s.episodes.length, 0)})</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('online')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'online'
                ? 'border-red-500 text-red-500'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>{t('tabOnline')} ({sources.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('torrents')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'torrents'
                ? 'border-red-500 text-red-500'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>{t('tabTorrents')} ({torrents.length})</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar">
          {/* Metadata info */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-slate-400">
            <div className="flex items-center gap-1 text-amber-400 font-bold">
              <Star className="w-4 h-4 fill-amber-400" />
              <span>{media.rating.toFixed(1)} / 10 ({media.voteCount} {t('votes')})</span>
            </div>
            <span>•</span>
            <span className="text-slate-200 font-semibold">{media.year} {t('year')}</span>
            <span>•</span>
            <span className="text-slate-300">{media.genres.join(', ')}</span>
            {media.duration && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {media.duration} {t('min')}
                </span>
              </>
            )}
          </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {media.overview}
          </p>

          {(media.director || (media.cast && media.cast.length > 0)) && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1 text-slate-300">
              {media.director && (
                <div><span className="text-slate-400 font-semibold">Режисер:</span> {media.director}</div>
              )}
              {media.cast && media.cast.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-slate-400 font-semibold">У ролях:</span>
                  <span>{media.cast.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: EPISODES SELECTOR */}
          {activeTab === 'episodes' && (
            <div className="space-y-4">
              {loadingEpisodes ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                  <span className="text-xs">Завантаження списку сезонів та серій з бази...</span>
                </div>
              ) : (
                <>
                  {/* Season Selector */}
                  {seasons.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                      {seasons.map((s) => (
                        <button
                          key={s.seasonNumber}
                          onClick={() => {
                            setSelectedSeason(s.seasonNumber);
                            setSelectedEpisode(s.episodes[0]);
                          }}
                          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                            selectedSeason === s.seasonNumber
                              ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                              : 'bg-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {s.name} ({s.episodes.length} сер.)
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Episodes List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                    {seasons
                      .find((s) => s.seasonNumber === selectedSeason)
                      ?.episodes.map((ep) => {
                        const isSelected = selectedEpisode?.id === ep.id;
                        return (
                          <div
                            key={ep.id}
                            onClick={() => setSelectedEpisode(ep)}
                            className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between gap-3 transition-all ${
                              isSelected
                                ? 'bg-red-600/15 border-red-500 shadow-md shadow-red-600/10'
                                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                            }`}
                          >
                            <div className="space-y-1 min-w-0">
                              <span className="text-xs font-bold text-white block truncate">
                                С{ep.seasonNumber}:Е{ep.episodeNumber.toString().padStart(2, '0')} — {ep.title}
                              </span>
                              <span className="text-[11px] text-slate-400 block line-clamp-1">{ep.overview}</span>
                              {ep.airDate && (
                                <span className="text-[10px] text-amber-400/80 block">{ep.airDate}</span>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEpisode(ep);
                                if (sources[0]) onPlayOnline(media, sources[0], ep);
                              }}
                              className="p-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white shrink-0 active:scale-95 transition-transform shadow-md shadow-red-600/30"
                              title={t('watchNow')}
                            >
                              <Play className="w-4 h-4 fill-white ml-0.5" />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: ONLINE SOURCES */}
          {activeTab === 'online' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>{t('autoSearchNotice')}</span>
              </div>

              <div className="space-y-3">
                {sources.map((src) => (
                  <div
                    key={src.id}
                    className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/25 transition-all space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        {src.type === 'embed' ? (
                          <Globe className="w-5 h-5 text-amber-400 shrink-0" />
                        ) : src.type === 'trailer' ? (
                          <Youtube className="w-5 h-5 text-red-500 shrink-0" />
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        )}
                        <div>
                          <h4 className="font-bold text-white text-sm sm:text-base">{src.title}</h4>
                          <span className="text-xs text-slate-400">{t('ping')}: {src.pingMs} ms • {t('working100')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {src.type === 'online' && (
                          <button
                            onClick={() => handleFakeDownload(src.id)}
                            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>
                              {downloadProgress[src.id] !== undefined
                                ? downloadProgress[src.id] >= 100
                                  ? t('downloaded')
                                  : `${downloadProgress[src.id]}%`
                                : t('download')}
                            </span>
                          </button>
                        )}

                        <button
                          onClick={() => onPlayOnline(media, src, selectedEpisode)}
                          className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-red-600/30 active:scale-95 transition-all"
                        >
                          <Play className="w-4 h-4 fill-white" />
                          <span>{t('watchNow')}</span>
                        </button>
                      </div>
                    </div>

                    {/* Audio tracks tags */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-slate-400 mr-1">{t('audioTracks')}</span>
                      {src.audioTracks.map((a) => (
                        <span
                          key={a.id}
                          className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-black/40 border border-white/10 text-slate-300"
                        >
                          {a.name}
                        </span>
                      ))}
                    </div>

                    {/* Qualities */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-400 mr-1">{t('availableQuality')}</span>
                      {src.qualities.map((q) => (
                        <span
                          key={q.label}
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20"
                        >
                          {q.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: TORRENTS */}
          {activeTab === 'torrents' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200">
                💡 {t('torrentsTip')}
              </div>

              <div className="space-y-3">
                {torrents.map((tItem) => (
                  <div
                    key={tItem.id}
                    className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600/20 text-red-400 border border-red-600/30">
                            {tItem.tracker}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {tItem.quality}
                          </span>
                          <span className="text-xs font-mono text-emerald-400 font-bold">
                            ▲ {tItem.seeds} {t('seeds')}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            {t('size')} {tItem.size}
                          </span>
                        </div>
                        <h4 className="font-semibold text-white text-xs sm:text-sm line-clamp-2">{tItem.title}</h4>
                        <p className="text-xs text-slate-400">{tItem.audio}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                        <button
                          onClick={() => handleCopyMagnet(tItem.magnet, tItem.id)}
                          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          title="Скопіювати Magnet-посилання"
                        >
                          {copiedMagnet === tItem.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">{t('copied')}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Magnet</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            if (sources[0]) onPlayOnline(media, sources[0], selectedEpisode);
                          }}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-red-600/30 active:scale-95 transition-all"
                        >
                          <Play className="w-4 h-4 fill-white" />
                          <span>{t('streaming')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
