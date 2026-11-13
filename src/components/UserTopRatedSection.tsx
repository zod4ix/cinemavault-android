import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Trophy, ChevronLeft, ChevronRight, Sparkles, Calendar, Zap, Clock } from 'lucide-react';
import { MediaItem } from '../types/movie';
import { MediaCard } from './MediaCard';
import { userRatingService, RatingGradation } from '../services/userRatingService';
import { deduplicateMediaItems } from '../services/mediaDedupe';
import { useLanguage } from '../i18n/LanguageContext';

interface UserTopRatedSectionProps {
  items: MediaItem[];
  onSelectMedia: (media: MediaItem) => void;
  onPlayMedia: (media: MediaItem) => void;
  favorites: MediaItem[];
  onToggleFavorite: (media: MediaItem) => void;
}

export const UserTopRatedSection: React.FC<UserTopRatedSectionProps> = ({
  items,
  onSelectMedia,
  onPlayMedia,
  favorites,
  onToggleFavorite,
}) => {
  const { t } = useLanguage();
  const [selectedGradation, setSelectedGradation] = useState<RatingGradation>('all');
  const [version, setVersion] = useState<number>(0);
  const rowRef = useRef<HTMLDivElement>(null);

  // Subscribe to live rating changes so when user likes/dislikes an item, ranking updates immediately!
  useEffect(() => {
    const unsub = userRatingService.subscribe(() => {
      setVersion((v) => v + 1);
    });
    return unsub;
  }, []);

  const topItems = useMemo(() => {
    const ranked = userRatingService.getTopRatedItems(items, selectedGradation, 24);
    return deduplicateMediaItems(ranked);
  }, [items, selectedGradation, version]);

  // Mouse Drag-to-Scroll support
  const isMouseDownRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0, scrollLeft: 0 });
  const hasDraggedRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!rowRef.current || e.button !== 0) return;
    isMouseDownRef.current = true;
    hasDraggedRef.current = false;
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: rowRef.current.scrollLeft,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDownRef.current || !rowRef.current) return;
    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;

    if (!hasDraggedRef.current && Math.abs(deltaX) > 24 && Math.abs(deltaX) > Math.abs(deltaY)) {
      hasDraggedRef.current = true;
    }

    if (hasDraggedRef.current) {
      rowRef.current.scrollLeft = startPosRef.current.scrollLeft - deltaX;
    }
  };

  const handleMouseUpOrLeave = () => {
    if (!isMouseDownRef.current) return;
    isMouseDownRef.current = false;
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!rowRef.current) return;
    const firstCard = rowRef.current.firstElementChild as HTMLElement | null;
    const cardStep = firstCard ? firstCard.offsetWidth + 14 : 220;
    const scrollAmount = Math.max(cardStep * 2, rowRef.current.clientWidth * 0.75);
    rowRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!rowRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      rowRef.current.scrollLeft += e.deltaY;
    }
  };

  if (!items || items.length === 0) return null;

  const gradations: Array<{ id: RatingGradation; label: string; icon: React.ReactNode }> = [
    {
      id: 'all',
      label: t('ratingAllTime') || 'За увесь час',
      icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" />,
    },
    {
      id: 'year',
      label: t('ratingYear') || 'За рік',
      icon: <Calendar className="w-3.5 h-3.5 text-blue-400" />,
    },
    {
      id: 'month',
      label: t('ratingMonth') || 'За місяць',
      icon: <Clock className="w-3.5 h-3.5 text-emerald-400" />,
    },
    {
      id: 'week',
      label: t('ratingWeek') || 'За тиждень',
      icon: <Zap className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />,
    },
  ];

  return (
    <section className="my-6 sm:my-8 space-y-3.5 relative group/toprated w-full max-w-full overflow-hidden">
      {/* Header Container */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-3.5 sm:px-6 lg:px-8 w-full min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/40 text-amber-400 shadow-lg shadow-amber-500/10 shrink-0">
            <Trophy className="w-5 h-5 fill-amber-400 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-xl lg:text-2xl font-black text-white tracking-tight truncate">
                {t('topRatedAudience') || 'Вибір глядачів: Топ рейтинг'}
              </h2>
              <span className="shrink-0 text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                PRO TOP
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 font-medium truncate">
              {t('topRatedSubtitle') || 'Найкраще кіно за реальними оцінками аудиторії'}
            </p>
          </div>
        </div>

        {/* Gradation Selector Pills + Navigation Arrows */}
        <div className="flex items-center justify-between md:justify-end gap-2 shrink-0">
          <div
            data-nav-row="top-rated-filters"
            className="flex items-center gap-1 sm:gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10 overflow-x-auto scrollbar-none"
          >
            {gradations.map((g) => {
              const active = selectedGradation === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  tabIndex={0}
                  onClick={() => setSelectedGradation(g.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedGradation(g.id);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap tv-btn-focus focus:outline-none ${
                    active
                      ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-md shadow-red-600/30 font-black'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {g.icon}
                  <span>{g.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => scroll('left')}
              tabIndex={0}
              aria-label="Попередні"
              className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-red-600 text-slate-300 hover:text-white transition-all tv-btn-focus focus:outline-none border border-white/10"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              tabIndex={0}
              aria-label="Наступні"
              className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-red-600 text-slate-300 hover:text-white transition-all tv-btn-focus focus:outline-none border border-white/10"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Media Items Carousel with Rank Badges */}
      <div
        ref={rowRef}
        data-nav-row="top-rated-row"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onWheel={handleWheel}
        className="flex items-stretch gap-3 sm:gap-3.5 md:gap-4 overflow-x-auto scrollbar-none px-3.5 sm:px-6 lg:px-8 py-2 snap-x snap-mandatory scroll-smooth"
      >
        {topItems.map((media, index) => {
          const stats = userRatingService.getRatingStats(media);
          const rank = index + 1;
          const isTop3 = rank <= 3;
          const rankBadgeStyle =
            rank === 1
              ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shadow-amber-500/50'
              : rank === 2
              ? 'bg-gradient-to-r from-slate-200 to-slate-400 text-slate-950 shadow-slate-300/40'
              : rank === 3
              ? 'bg-gradient-to-r from-amber-700 to-orange-600 text-white shadow-orange-500/30'
              : 'bg-black/85 text-slate-200 border border-white/20';

          return (
            <div
              key={`${media.id}-${selectedGradation}`}
              className="relative shrink-0 w-[42%] xs:w-[32%] sm:w-[24%] md:w-[19%] lg:w-[15.8%] xl:w-[13.6%] 2xl:w-[11.8%] snap-start"
            >
              {/* Prominent Rank Ribbon */}
              <div
                className={`absolute -top-2 -left-2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black shadow-lg ${rankBadgeStyle}`}
              >
                {isTop3 && <span>🏆</span>}
                <span>#{rank}</span>
              </div>

              {/* Approval ratio overlay indicator on card */}
              <div className="absolute top-2 right-2 z-20 pointer-events-none">
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-emerald-600/90 text-white backdrop-blur-md shadow-md border border-emerald-400/30">
                  👍 {stats.approvalPercent}%
                </span>
              </div>

              <MediaCard
                media={media}
                onClick={onSelectMedia}
                onPlay={onPlayMedia}
                isFavorite={favorites.some((f) => f.id.toString() === media.id.toString())}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
