import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { MediaRow } from './components/MediaRow';
import { MediaModal } from './components/MediaModal';
import { VideoPlayer } from './components/VideoPlayer';
import { DonateModal } from './components/DonateModal';
import { WatchHistory } from './components/WatchHistory';
import { MediaCard } from './components/MediaCard';
import { FilterBar } from './components/FilterBar';
import { BottomNav } from './components/BottomNav';
import { tmdbService, CURATED_CATALOG } from './services/tmdb';
import { rezkaService } from './services/rezka';
import { storageService } from './services/storage';
import { MediaItem, MediaSource, Episode, PlaybackProgress, CatalogFilter } from './types/movie';
import { Film, Heart, Loader2, PlusCircle, Sparkles } from 'lucide-react';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { SplashScreen } from './components/SplashScreen';

declare global {
  interface Window {
    __cinemaHandleBack?: () => boolean;
  }
}

const MainAppContent: React.FC = () => {
  const { t } = useLanguage();
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState<boolean>(false);
  const [searchFocusTrigger, setSearchFocusTrigger] = useState<number>(0);

  const [filter, setFilter] = useState<CatalogFilter>({
    category: 'trending',
    genre: 'all',
    year: 'all',
    sortBy: 'popularity',
  });

  const [liveCatalogPool, setLiveCatalogPool] = useState<MediaItem[]>(CURATED_CATALOG);
  const [catalogPage, setCatalogPage] = useState<number>(1);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const [isFavoritesActive, setIsFavoritesActive] = useState<boolean>(false);
  const [isDonateOpen, setIsDonateOpen] = useState<boolean>(false);
  const [heroIndex, setHeroIndex] = useState<number>(0);

  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [activePlayback, setActivePlayback] = useState<{
    media: MediaItem;
    source: MediaSource;
    episode?: Episode;
  } | null>(null);

  const [favorites, setFavorites] = useState<MediaItem[]>([]);
  const [history, setHistory] = useState<PlaybackProgress[]>([]);
  const latestSearchReqRef = useRef<number>(0);

  // Register native Android hardware/gesture Back Button handler!
  useEffect(() => {
    window.__cinemaHandleBack = () => {
      if (activePlayback) {
        setActivePlayback(null);
        return true;
      }
      if (selectedMedia) {
        setSelectedMedia(null);
        return true;
      }
      if (isDonateOpen) {
        setIsDonateOpen(false);
        return true;
      }
      if (searchQuery.trim()) {
        setSearchQuery('');
        return true;
      }
      if (isFavoritesActive) {
        setIsFavoritesActive(false);
        return true;
      }
      if (filter.category !== 'trending' || filter.genre !== 'all' || filter.year !== 'all') {
        setFilter({ category: 'trending', genre: 'all', year: 'all', sortBy: 'popularity' });
        return true;
      }
      return false;
    };
    return () => {
      delete window.__cinemaHandleBack;
    };
  }, [activePlayback, selectedMedia, isDonateOpen, searchQuery, isFavoritesActive, filter]);

  // Rotate Hero Banner every 9 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % Math.min(8, CURATED_CATALOG.length));
    }, 9000);
    return () => clearInterval(timer);
  }, []);

  // Load favorites & history
  useEffect(() => {
    setFavorites(storageService.getFavorites());
    setHistory(storageService.getHistory());
  }, [activePlayback]);

  // Initial background fetch of extra live catalog items so rows & categories are rich
  useEffect(() => {
    let active = true;
    Promise.all([
      tmdbService.fetchLiveCategory('movies', 1),
      tmdbService.fetchLiveCategory('series', 1),
      tmdbService.fetchLiveCategory('anime', 1),
    ]).then(([movies, series, anime]) => {
      if (!active) return;
      setLiveCatalogPool((prev) => {
        const map = new Map<string, MediaItem>();
        [...prev, ...movies, ...series, ...anime].forEach((item) => {
          map.set(item.id.toString(), item);
        });
        return Array.from(map.values());
      });
    });
    return () => {
      active = false;
    };
  }, []);

  // Live Global Search with race-safe request ID & debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    const reqId = ++latestSearchReqRef.current;
    const local = tmdbService.search(q);
    setSearchResults(local);
    setIsSearchingLive(true);

    const timer = setTimeout(async () => {
      const globalRes = await tmdbService.searchGlobal(q);
      if (latestSearchReqRef.current === reqId) {
        setSearchResults(globalRes);
        setIsSearchingLive(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = async (q: string) => {
    const clean = q.trim();
    if (!clean) return;
    const reqId = ++latestSearchReqRef.current;
    setIsSearchingLive(true);
    const globalRes = await tmdbService.searchGlobal(clean);
    if (latestSearchReqRef.current === reqId) {
      setSearchResults(globalRes);
      setIsSearchingLive(false);
    }
  };

  const handleLoadMoreCatalog = async () => {
    setIsLoadingMore(true);
    const nextPage = catalogPage + 1;
    const moreItems = await tmdbService.fetchLiveCategory(filter.category, nextPage);
    setLiveCatalogPool((prev) => {
      const map = new Map<string, MediaItem>();
      [...prev, ...moreItems].forEach((item) => {
        map.set(item.id.toString(), item);
      });
      return Array.from(map.values());
    });
    setCatalogPage(nextPage);
    setIsLoadingMore(false);
  };

  const handleToggleFavorite = (media: MediaItem) => {
    storageService.toggleFavorite(media);
    setFavorites(storageService.getFavorites());
  };

  const handlePlayMedia = async (media: MediaItem, episode?: Episode) => {
    const sources = await rezkaService.resolveSources(
      media,
      episode?.seasonNumber,
      episode?.episodeNumber
    );
    if (sources.length > 0) {
      setActivePlayback({
        media,
        source: sources[0],
        episode,
      });
    }
  };

  const handleResumePlayback = async (prog: PlaybackProgress) => {
    const media = tmdbService.getItemById(prog.mediaId) || prog.mediaSnapshot;
    if (media) {
      const sources = await rezkaService.resolveSources(
        media,
        prog.seasonNumber,
        prog.episodeNumber
      );
      if (sources.length > 0) {
        setActivePlayback({
          media,
          source: sources[0],
          episode: prog.episodeNumber
            ? {
                id:
                  prog.episodeId ||
                  `${prog.mediaId}-s${prog.seasonNumber}e${prog.episodeNumber}`,
                seasonNumber: prog.seasonNumber || 1,
                episodeNumber: prog.episodeNumber,
                title: `Епізод ${prog.episodeNumber}`,
              }
            : undefined,
        });
      }
    }
  };

  const featured = CURATED_CATALOG[heroIndex] || CURATED_CATALOG[0];
  const filteredCatalog = tmdbService.filterAndSort(liveCatalogPool, filter);
  const isCustomFilterActive =
    filter.category !== 'trending' ||
    filter.genre !== 'all' ||
    filter.year !== 'all' ||
    filter.sortBy !== 'popularity';

  return (
    <div className="min-h-dvh bg-[#07090e] text-slate-100 flex flex-col selection:bg-red-600 selection:text-white pb-20 md:pb-0">
      {/* Animated Startup Splash Screen */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {/* Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          if (isFavoritesActive) setIsFavoritesActive(false);
        }}
        onSearchSubmit={handleSearchSubmit}
        isSearchingLive={isSearchingLive}
        quickSuggestions={searchResults}
        onSelectMedia={setSelectedMedia}
        selectedCategory={filter.category}
        onSelectCategory={(cat) => {
          setFilter((prev) => ({ ...prev, category: cat }));
          setSearchQuery('');
          setIsFavoritesActive(false);
        }}
        onOpenDonate={() => setIsDonateOpen(true)}
        favoritesCount={favorites.length}
        onOpenFavorites={() => {
          setIsFavoritesActive(!isFavoritesActive);
          setSearchQuery('');
        }}
        isFavoritesActive={isFavoritesActive}
        focusTrigger={searchFocusTrigger}
      />

      {/* Main Content */}
      <main className="flex-1 pb-10">
        {/* 1. LIVE SEARCH VIEW */}
        {searchQuery.trim() ? (
          <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-5">
            <FilterBar
              filter={filter}
              onChange={(upd) => setFilter((prev) => ({ ...prev, ...upd }))}
              totalCount={searchResults.length}
              onQuickSearch={(term) => setSearchQuery(term)}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base sm:text-2xl font-bold text-white">
                  {t('searchResultsFor')}{' '}
                  <span className="text-red-500 font-extrabold">«{searchQuery}»</span>
                </h2>
                {isSearchingLive && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Пошук по всіх базах...
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400">
                {searchResults.length} {t('found')}
              </span>
            </div>

            {searchResults.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5">
                {searchResults.map((item) => (
                  <MediaCard
                    key={item.id}
                    media={item}
                    onClick={setSelectedMedia}
                    onPlay={handlePlayMedia}
                    isFavorite={favorites.some((f) => f.id.toString() === item.id.toString())}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            ) : isSearchingLive ? (
              <div className="py-20 text-center space-y-3">
                <Loader2 className="w-10 h-10 text-red-500 animate-spin mx-auto" />
                <p className="text-slate-300 text-sm font-medium px-4">
                  Шукаємо «{searchQuery}» у світових каталогах (IMDb, Wikidata UA, TVMaze, Anime)...
                </p>
              </div>
            ) : (
              <div className="py-16 text-center space-y-3">
                <Film className="w-12 h-12 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-sm">{t('nothingFound')}</p>
              </div>
            )}
          </div>
        ) : isFavoritesActive ? (
          /* 2. FAVORITES VIEW */
          <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-6">
            <div className="flex items-center gap-2 mb-5">
              <Heart className="w-6 h-6 text-red-500 fill-red-500" />
              <h2 className="text-xl sm:text-2xl font-bold text-white">{t('savedTitle')}</h2>
            </div>

            {favorites.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5">
                {favorites.map((item) => (
                  <MediaCard
                    key={item.id}
                    media={item}
                    onClick={setSelectedMedia}
                    onPlay={handlePlayMedia}
                    isFavorite={true}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            ) : (
              <div className="py-20 text-center space-y-3">
                <Heart className="w-12 h-12 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-sm">{t('emptyFavorites')}</p>
              </div>
            )}
          </div>
        ) : isCustomFilterActive ? (
          /* 3. CATEGORY / FILTERED CATALOG GRID VIEW */
          <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-5 space-y-5">
            <FilterBar
              filter={filter}
              onChange={(upd) => setFilter((prev) => ({ ...prev, ...upd }))}
              totalCount={filteredCatalog.length}
              onQuickSearch={(term) => setSearchQuery(term)}
            />

            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg sm:text-2xl font-extrabold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  {filter.category === 'movies'
                    ? t('movies')
                    : filter.category === 'series'
                      ? t('series')
                      : filter.category === 'cartoons'
                        ? t('cartoons')
                        : filter.category === 'anime'
                          ? t('anime')
                          : filter.category === '4k'
                            ? t('hdr4k')
                            : filter.category === 'ukrainian'
                              ? t('ukrainianRow')
                              : t('allTrends')}
                </span>
                {filter.genre !== 'all' && (
                  <span className="text-red-500 text-sm sm:text-xl">• {filter.genre}</span>
                )}
              </h2>

              <button
                onClick={() =>
                  setFilter({
                    category: 'trending',
                    genre: 'all',
                    year: 'all',
                    sortBy: 'popularity',
                  })
                }
                className="text-xs text-slate-400 hover:text-white underline shrink-0"
              >
                Скинути фільтри
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5">
              {filteredCatalog.map((item) => (
                <MediaCard
                  key={item.id}
                  media={item}
                  onClick={setSelectedMedia}
                  onPlay={handlePlayMedia}
                  isFavorite={favorites.some((f) => f.id.toString() === item.id.toString())}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>

            {/* Load More from Live Database */}
            <div className="pt-4 flex justify-center">
              <button
                onClick={handleLoadMoreCatalog}
                disabled={isLoadingMore}
                className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-red-600 text-white font-bold text-xs sm:text-sm flex items-center gap-2 border border-white/15 transition-all active:scale-95"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Підвантаження з онлайн-бази...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Завантажити більше контенту з бази</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* 4. HOME DISCOVERY VIEW */
          <>
            {/* Hero Banner */}
            <div className="relative">
              <HeroBanner
                media={featured}
                onPlay={handlePlayMedia}
                onOpenDetails={setSelectedMedia}
                isFavorite={favorites.some((f) => f.id.toString() === featured.id.toString())}
                onToggleFavorite={handleToggleFavorite}
              />
              {/* Hero Slide Dots */}
              <div className="absolute bottom-3 right-4 sm:right-6 z-20 flex items-center gap-1.5">
                {CURATED_CATALOG.slice(0, 8).map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => setHeroIndex(idx)}
                    className={`h-1.5 rounded-full transition-all ${
                      heroIndex === idx
                        ? 'w-5 bg-red-500'
                        : 'w-1.5 bg-white/35 hover:bg-white/60'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Interactive Filter & Quick Search Bar right on Home Page */}
            <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 mt-4 sm:mt-6">
              <FilterBar
                filter={filter}
                onChange={(upd) => setFilter((prev) => ({ ...prev, ...upd }))}
                totalCount={liveCatalogPool.length}
                onQuickSearch={(term) => setSearchQuery(term)}
              />
            </div>

            {/* Watch History */}
            <WatchHistory history={history} onPlayItem={handleResumePlayback} />

            {/* Curated + Live Media Rows */}
            <div className="space-y-3 sm:space-y-4">
              <MediaRow
                title={t('trendingRow')}
                badge={t('trendingBadge')}
                items={liveCatalogPool.slice(0, 18)}
                onSelectMedia={setSelectedMedia}
                onPlayMedia={handlePlayMedia}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
              />

              <MediaRow
                title="🇺🇦 Українське кіно та дубляж"
                badge="UA ТОП"
                items={liveCatalogPool
                  .filter(
                    (i) =>
                      i.genres.includes('Українське кіно') || i.hasUkrainianAudio
                  )
                  .slice(0, 18)}
                onSelectMedia={setSelectedMedia}
                onPlayMedia={handlePlayMedia}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
              />

              <MediaRow
                title={t('seriesRow')}
                badge={t('seriesBadge')}
                items={liveCatalogPool.filter((i) => i.mediaType === 'tv').slice(0, 18)}
                onSelectMedia={setSelectedMedia}
                onPlayMedia={handlePlayMedia}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
              />

              <MediaRow
                title={t('hdrRow')}
                badge={t('hdrBadge')}
                items={liveCatalogPool.filter((i) => i.quality === '4K HDR').slice(0, 18)}
                onSelectMedia={setSelectedMedia}
                onPlayMedia={handlePlayMedia}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
              />

              <MediaRow
                title={t('cartoonsRow')}
                badge={t('cartoonsBadge')}
                items={liveCatalogPool.filter((i) => i.mediaType === 'cartoon').slice(0, 18)}
                onSelectMedia={setSelectedMedia}
                onPlayMedia={handlePlayMedia}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
              />

              <MediaRow
                title={t('animeRow')}
                badge={t('animeBadge')}
                items={liveCatalogPool.filter((i) => i.mediaType === 'anime').slice(0, 18)}
                onSelectMedia={setSelectedMedia}
                onPlayMedia={handlePlayMedia}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
              />
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#05070a] py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          <p className="flex flex-wrap items-center justify-center gap-1.5 font-medium text-slate-400">
            <span>CinemaVault PRO v3.0</span> •{' '}
            <span>Multi-Server (VidSrc / Ashdi UA / HDRezka / IMDb)</span> • <span>🍿 4K HDR</span>
          </p>
        </div>
      </footer>

      {/* Mobile & Small Tablet Bottom Navigation */}
      <BottomNav
        selectedCategory={filter.category}
        isFavoritesActive={isFavoritesActive}
        isSearchActive={Boolean(searchQuery.trim())}
        favoritesCount={favorites.length}
        onSelectCategory={(cat) => {
          setFilter((prev) => ({ ...prev, category: cat }));
          setSearchQuery('');
          setIsFavoritesActive(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenSearch={() => {
          setIsFavoritesActive(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setSearchFocusTrigger((c) => c + 1);
        }}
        onOpenFavorites={() => {
          setIsFavoritesActive(!isFavoritesActive);
          setSearchQuery('');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenDonate={() => setIsDonateOpen(true)}
      />

      {/* Modals & Fullscreen Player */}
      <MediaModal
        media={selectedMedia}
        onClose={() => setSelectedMedia(null)}
        onPlayOnline={(media, src, ep) => {
          setSelectedMedia(null);
          setActivePlayback({ media, source: src, episode: ep });
        }}
        isFavorite={
          selectedMedia
            ? favorites.some((f) => f.id.toString() === selectedMedia.id.toString())
            : false
        }
        onToggleFavorite={handleToggleFavorite}
      />

      {activePlayback && (
        <VideoPlayer
          media={activePlayback.media}
          title={activePlayback.media.title}
          subtitle={
            activePlayback.episode
              ? `${activePlayback.episode.seasonNumber} ${t('seasonAbbr')} • ${activePlayback.episode.episodeNumber} ${t('episodeAbbr')}: ${activePlayback.episode.title}`
              : undefined
          }
          qualities={activePlayback.source.qualities}
          audioTracks={activePlayback.source.audioTracks}
          embedUrl={activePlayback.source.embedUrl}
          servers={activePlayback.source.servers}
          initialMode={
            activePlayback.source.type === 'online'
              ? 'native'
              : activePlayback.source.type === 'trailer'
                ? 'trailer'
                : 'embed'
          }
          onClose={() => setActivePlayback(null)}
          episodeId={activePlayback.episode?.id}
          seasonNumber={activePlayback.episode?.seasonNumber}
          episodeNumber={activePlayback.episode?.episodeNumber}
        />
      )}

      <DonateModal isOpen={isDonateOpen} onClose={() => setIsDonateOpen(false)} />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <MainAppContent />
    </LanguageProvider>
  );
};
