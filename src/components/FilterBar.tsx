import React, { useRef } from 'react';
import {
  SlidersHorizontal,
  ArrowUpDown,
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { CatalogFilter } from '../types/movie';
import { useLanguage } from '../i18n/LanguageContext';
import { FILTER_GENRES, QUICK_TAGS } from '../i18n/translations';

interface FilterBarProps {
  filter: CatalogFilter;
  onChange: (updated: Partial<CatalogFilter>) => void;
  totalCount: number;
  onQuickSearch?: (term: string) => void;
}

const YEARS = [
  { id: 'all', key: 'allYears' as const },
  { id: '2024+', label: '2024–2026' },
  { id: '2023', label: '2023' },
  { id: '2020-2022', label: '2020–2022' },
  { id: '2010-2019', label: '2010–2019' },
  { id: 'classic', key: 'before2010' as const },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  filter,
  onChange,
  totalCount,
  onQuickSearch,
}) => {
  const { language, t, tg } = useLanguage();
  const quickTags = QUICK_TAGS[language] || QUICK_TAGS.uk;
  const genreRowRef = useRef<HTMLDivElement>(null);
  const yearRowRef = useRef<HTMLDivElement>(null);
  const tagsRowRef = useRef<HTMLDivElement>(null);

  const scrollRow = (ref: React.RefObject<HTMLDivElement | null>, dir: 'left' | 'right') => {
    if (!ref.current) return;
    const step = Math.max(150, ref.current.clientWidth * 0.65);
    ref.current.scrollBy({
      left: dir === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  const centerPill = (container: HTMLDivElement | null, btn: HTMLElement) => {
    if (!container || !btn) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    const offset = bRect.left - cRect.left + container.scrollLeft;
    const target = offset - container.clientWidth / 2 + bRect.width / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  };

  return (
    <div className="bg-[#0b101b]/95 border border-white/10 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xl w-full max-w-full overflow-hidden">
      {/* Top Row: Genre Pills Carousel */}
      <div className="flex items-center gap-1.5 w-full min-w-0">
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-slate-400 pr-1 shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-red-500" />
          <span>{t('genresLabel')}</span>
        </div>

        <button
          type="button"
          onClick={() => scrollRow(genreRowRef, 'left')}
          tabIndex={0}
          aria-label="Попередні жанри"
          className="p-1.5 rounded-xl bg-white/5 hover:bg-red-600 active:bg-red-600 text-slate-300 hover:text-white shrink-0 transition-colors tv-btn-focus focus:outline-none"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <div
          ref={genreRowRef}
          onWheel={(e) => {
            if (genreRowRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              genreRowRef.current.scrollLeft += e.deltaY;
            }
          }}
          className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth py-0.5"
        >
          <button
            onClick={(e) => {
              centerPill(genreRowRef.current, e.currentTarget);
              onChange({ genre: 'all' });
            }}
            tabIndex={0}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 snap-start transition-all tv-btn-focus focus:outline-none ${
              filter.genre === 'all'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            {t('allGenres')}
          </button>

          {FILTER_GENRES.map((canonicalGenre) => {
            const active = filter.genre === canonicalGenre;
            return (
              <button
                key={canonicalGenre}
                onClick={(e) => {
                  centerPill(genreRowRef.current, e.currentTarget);
                  onChange({ genre: canonicalGenre });
                }}
                tabIndex={0}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 snap-start transition-all tv-btn-focus focus:outline-none ${
                  active
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {tg(canonicalGenre)}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scrollRow(genreRowRef, 'right')}
          tabIndex={0}
          aria-label="Наступні жанри"
          className="p-1.5 rounded-xl bg-white/5 hover:bg-red-600 active:bg-red-600 text-slate-300 hover:text-white shrink-0 transition-colors tv-btn-focus focus:outline-none"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Second Row: Year Carousel & Sort Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-white/5 w-full min-w-0">
        {/* Year Pills Carousel */}
        <div
          ref={yearRowRef}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth w-full sm:w-auto min-w-0 py-0.5"
        >
          <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0 mr-0.5" />
          {YEARS.map((y) => {
            const active = filter.year === y.id;
            const label = y.key ? t(y.key) : y.label;
            return (
              <button
                key={y.id}
                onClick={(e) => {
                  centerPill(yearRowRef.current, e.currentTarget);
                  onChange({ year: y.id });
                }}
                tabIndex={0}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 snap-start transition-all tv-btn-focus focus:outline-none ${
                  active
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Sort Controls & Count (100% fits mobile width) */}
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 w-full sm:w-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 ml-1.5 shrink-0" />
            <button
              onClick={() => onChange({ sortBy: 'popularity' })}
              tabIndex={0}
              className={`flex-1 sm:flex-initial text-center px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all tv-btn-focus focus:outline-none ${
                filter.sortBy === 'popularity'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('sortPopular')}
            </button>
            <button
              onClick={() => onChange({ sortBy: 'rating' })}
              tabIndex={0}
              className={`flex-1 sm:flex-initial text-center px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all tv-btn-focus focus:outline-none ${
                filter.sortBy === 'rating'
                  ? 'bg-white/15 text-amber-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('sortRating')}
            </button>
            <button
              onClick={() => onChange({ sortBy: 'year' })}
              tabIndex={0}
              className={`flex-1 sm:flex-initial text-center px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all tv-btn-focus focus:outline-none ${
                filter.sortBy === 'year'
                  ? 'bg-white/15 text-emerald-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('sortNew')}
            </button>
          </div>

          <span className="text-xs text-slate-400 font-mono hidden md:inline shrink-0">
            ({totalCount})
          </span>
        </div>
      </div>

      {/* Quick Search Tags Carousel */}
      {onQuickSearch && (
        <div
          ref={tagsRowRef}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth pt-1 w-full min-w-0"
        >
          <span className="text-[11px] text-amber-400/90 font-semibold flex items-center gap-1 shrink-0 mr-1">
            <Sparkles className="w-3 h-3" /> {t('quickSearch')}
          </span>
          {quickTags.map((tag) => (
            <button
              key={tag}
              onClick={(e) => {
                centerPill(tagsRowRef.current, e.currentTarget);
                onQuickSearch(tag);
              }}
              tabIndex={0}
              className="px-2.5 py-0.5 rounded-full text-[11px] bg-white/5 hover:bg-red-600/20 text-slate-300 hover:text-red-300 border border-white/10 hover:border-red-500/30 whitespace-nowrap shrink-0 snap-start transition-all tv-btn-focus focus:outline-none"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
