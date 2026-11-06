import React from 'react';
import { SlidersHorizontal, ArrowUpDown, Calendar, Sparkles } from 'lucide-react';
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

  return (
    <div className="bg-[#0b101b]/90 border border-white/10 rounded-2xl p-4 space-y-3.5 shadow-xl">
      {/* Top Row: Genre Pills */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 pr-2 shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-red-500" />
          <span>{t('genresLabel')}</span>
        </div>

        <button
          onClick={() => onChange({ genre: 'all' })}
          tabIndex={0}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all tv-btn-focus focus:outline-none ${
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
              onClick={() => onChange({ genre: canonicalGenre })}
              tabIndex={0}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all tv-btn-focus focus:outline-none ${
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

      {/* Second Row: Year & Sort Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
        {/* Year Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0 mr-1" />
          {YEARS.map((y) => {
            const active = filter.year === y.id;
            const label = y.key ? t(y.key) : y.label;
            return (
              <button
                key={y.id}
                onClick={() => onChange({ year: y.id })}
                tabIndex={0}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all tv-btn-focus focus:outline-none ${
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

        {/* Sort Controls & Count */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <button
              onClick={() => onChange({ sortBy: 'popularity' })}
              tabIndex={0}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all tv-btn-focus focus:outline-none ${
                filter.sortBy === 'popularity' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('sortPopular')}
            </button>
            <button
              onClick={() => onChange({ sortBy: 'rating' })}
              tabIndex={0}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all tv-btn-focus focus:outline-none ${
                filter.sortBy === 'rating' ? 'bg-white/15 text-amber-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('sortRating')}
            </button>
            <button
              onClick={() => onChange({ sortBy: 'year' })}
              tabIndex={0}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all tv-btn-focus focus:outline-none ${
                filter.sortBy === 'year' ? 'bg-white/15 text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('sortNew')}
            </button>
          </div>

          <span className="text-xs text-slate-400 font-mono hidden sm:inline">
            ({totalCount})
          </span>
        </div>
      </div>

      {/* Quick Search Tags */}
      {onQuickSearch && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1">
          <span className="text-[11px] text-amber-400/90 font-semibold flex items-center gap-1 shrink-0 mr-1">
            <Sparkles className="w-3 h-3" /> {t('quickSearch')}
          </span>
          {quickTags.map((tag) => (
            <button
              key={tag}
              onClick={() => onQuickSearch(tag)}
              tabIndex={0}
              className="px-2.5 py-0.5 rounded-full text-[11px] bg-white/5 hover:bg-red-600/20 text-slate-300 hover:text-red-300 border border-white/10 hover:border-red-500/30 whitespace-nowrap transition-all tv-btn-focus focus:outline-none"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
