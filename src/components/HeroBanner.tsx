import React, { useState, useEffect, useRef } from 'react';
import { Play, Info, Heart, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem } from '../types/movie';
import { useLanguage } from '../i18n/LanguageContext';
import { useOverview } from '../i18n/useOverview';
import { createPosterFallback } from '../services/tmdb';
import { formatRating } from '../services/rating';

interface HeroBannerProps {
  items: MediaItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  isFavorite: boolean;
  onToggleFavorite: (media: MediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  items,
  currentIndex,
  onIndexChange,
  onPlay,
  onOpenDetails,
  isFavorite,
  onToggleFavorite,
}) => {
  const { t, tg, title } = useLanguage();
  const safeItems = items && items.length > 0 ? items : [];
  const activeMedia = safeItems[currentIndex] || safeItems[0];
  const overview = useOverview(activeMedia);

  const [bgSrc, setBgSrc] = useState<string>('');
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeMedia) return;
    setIsTransitioning(true);
    setBgSrc(
      activeMedia.backdropPath ||
        activeMedia.posterPath ||
        createPosterFallback(activeMedia.title, activeMedia.year, activeMedia.rating)
    );
    const tId = setTimeout(() => setIsTransitioning(false), 300);
    return () => clearTimeout(tId);
  }, [activeMedia]);

  useEffect(() => {
    if (safeItems.length <= 1 || isHovered) return;
    const interval = setInterval(() => {
      onIndexChange((currentIndex + 1) % safeItems.length);
    }, 7500);
    return () => clearInterval(interval);
  }, [safeItems.length, currentIndex, isHovered, onIndexChange]);

  const handlePrev = () => {
    if (safeItems.length <= 1) return;
    onIndexChange((currentIndex - 1 + safeItems.length) % safeItems.length);
  };

  const handleNext = () => {
    if (safeItems.length <= 1) return;
    onIndexChange((currentIndex + 1) % safeItems.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    setIsHovered(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsHovered(false);
    if (touchStartXRef.current === null) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
    touchStartXRef.current = null;
  };

  if (!activeMedia) return null;

  const displayTitle = title(activeMedia);
  const localizedGenres =
    activeMedia.genres && activeMedia.genres.length > 0
      ? activeMedia.genres.map(tg).join(' • ')
      : t('genreFilm');

  return (
    <div
      className="group relative w-full max-w-full min-h-[340px] sm:min-h-[450px] lg:min-h-[530px] overflow-hidden select-none bg-[#07090e] flex flex-col justify-end"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background Image with Smooth Cross-Fade & Vignette */}
      <img
        key={activeMedia.id}
        src={bgSrc}
        alt={displayTitle}
        onError={() =>
          setBgSrc(createPosterFallback(activeMedia.title, activeMedia.year, activeMedia.rating))
        }
        className={`absolute inset-0 w-full h-full object-cover object-center transform filter brightness-90 transition-all duration-700 ease-out ${
          isTransitioning ? 'scale-100 opacity-60' : 'scale-105 opacity-100'
        }`}
      />

      {/* Cinematic Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07090e] via-[#07090e]/65 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#07090e] via-[#07090e]/80 to-transparent w-full lg:w-3/4" />
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#07090e]/80 to-transparent pointer-events-none" />

      {/* Hero Content Container (Zero-overlap flex layout) */}
      <div className="relative w-full max-w-[1700px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-5 sm:pb-10 z-10 tv-safe-container">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-5 w-full min-w-0">
          {/* Left Metadata & Action Buttons */}
          <div className="max-w-2xl space-y-2.5 sm:space-y-3.5 min-w-0 w-full">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-extrabold bg-red-600 text-white uppercase tracking-wider flex items-center gap-1 shadow-md shadow-red-600/30">
                <Sparkles className="w-3 h-3" />
                {activeMedia.year >= 2024 ? 'НОВИНКА КАТАЛОГУ' : t('topRelease')}
              </span>

              {activeMedia.quality && (
                <span className="px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {activeMedia.quality}
                </span>
              )}

              {activeMedia.hasUkrainianAudio && (
                <span className="px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  🇺🇦 {t('voiced')}
                </span>
              )}

              {/* IMDb Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-md bg-black/75 border border-white/15 shadow">
                <span className="px-1 py-0.2 rounded text-[9px] sm:text-[10px] font-black bg-[#f5c518] text-black leading-none">
                  IMDb
                </span>
                <span className="text-amber-400 text-xs sm:text-sm font-extrabold">
                  {formatRating(activeMedia.rating)}
                </span>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-4xl lg:text-5xl xl:text-6xl font-black text-white tracking-tight drop-shadow-xl leading-tight line-clamp-2">
              {displayTitle}
            </h1>

            {/* Subtitle / Genres */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-sm text-slate-300 font-medium">
              <span className="font-bold text-white">{activeMedia.year}</span>
              <span>•</span>
              <span className="truncate max-w-[230px] sm:max-w-none">{localizedGenres}</span>
              {activeMedia.duration && (
                <>
                  <span>•</span>
                  <span>
                    {activeMedia.duration} {t('min')}
                  </span>
                </>
              )}
            </div>

            {/* Overview */}
            <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 sm:line-clamp-3 leading-relaxed max-w-xl drop-shadow">
              {overview}
            </p>

            {/* Action Buttons: 100% fits in view on mobile & desktop */}
            <div
              data-nav-row="hero-actions"
              className="flex items-center gap-2 sm:gap-3 pt-1 w-full min-w-0"
            >
              <button
                onClick={() => onPlay(activeMedia)}
                tabIndex={0}
                className="flex-1 sm:flex-initial justify-center px-4 sm:px-7 py-2.5 sm:py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 shadow-xl shadow-red-600/35 transition-all whitespace-nowrap tv-btn-focus focus:outline-none"
              >
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white shrink-0" />
                <span>{t('watchNow')}</span>
              </button>

              <button
                onClick={() => onOpenDetails(activeMedia)}
                tabIndex={0}
                className="flex-1 sm:flex-initial justify-center px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-2xl bg-white/15 hover:bg-white/25 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 border border-white/20 transition-all whitespace-nowrap tv-btn-focus focus:outline-none"
              >
                <Info className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span className="truncate">{t('detailsAndEpisodes')}</span>
              </button>

              <button
                onClick={() => onToggleFavorite(activeMedia)}
                tabIndex={0}
                className={`p-2.5 sm:p-3.5 rounded-2xl border transition-all shrink-0 tv-btn-focus focus:outline-none ${
                  isFavorite
                    ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/30'
                    : 'bg-black/60 text-slate-200 hover:text-white border-white/20'
                }`}
                title={t('inFavorites')}
              >
                <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${isFavorite ? 'fill-white' : ''}`} />
              </button>
            </div>
          </div>

          {/* Right Carousel Navigation Controls & Slide Indicators (Zero Overflow!) */}
          {safeItems.length > 1 && (
            <div className="flex items-center justify-between sm:justify-start gap-2 self-stretch sm:self-start lg:self-end shrink-0 max-w-full">
              <button
                onClick={handlePrev}
                tabIndex={0}
                className="p-2 sm:p-2.5 rounded-xl bg-black/65 hover:bg-red-600 text-white border border-white/15 transition-all active:scale-90 shrink-0 tv-btn-focus focus:outline-none"
                aria-label="Попередній слайд"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-black/65 border border-white/15 overflow-x-auto scrollbar-none">
                {safeItems.slice(0, 10).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => onIndexChange(idx)}
                    tabIndex={0}
                    className={`h-2 rounded-full transition-all duration-300 shrink-0 tv-btn-focus focus:outline-none ${
                      idx === currentIndex
                        ? 'w-5 sm:w-6 bg-red-600 shadow-sm shadow-red-600/50'
                        : 'w-2 bg-white/30 hover:bg-white/60'
                    }`}
                    aria-label={`Перейти до слайду ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                tabIndex={0}
                className="p-2 sm:p-2.5 rounded-xl bg-black/65 hover:bg-red-600 text-white border border-white/15 transition-all active:scale-90 shrink-0 tv-btn-focus focus:outline-none"
                aria-label="Наступний слайд"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <span className="text-[11px] font-bold text-slate-300 bg-black/65 px-2.5 py-1.5 rounded-xl border border-white/15 shrink-0 whitespace-nowrap">
                {currentIndex + 1} / {Math.min(10, safeItems.length)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
