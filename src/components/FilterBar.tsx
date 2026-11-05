import React from 'react';
import { SlidersHorizontal, ArrowUpDown, Calendar, Sparkles } from 'lucide-react';
import { CatalogFilter } from '../types/movie';

interface FilterBarProps {
  filter: CatalogFilter;
  onChange: (updated: Partial<CatalogFilter>) => void;
  totalCount: number;
  onQuickSearch?: (term: string) => void;
}

const GENRES = [
  { id: 'all', label: 'Усі жанри' },
  { id: 'Фантастика', label: 'Фантастика' },
  { id: 'Бойовик', label: 'Бойовик' },
  { id: 'Пригоди', label: 'Пригоди' },
  { id: 'Драма', label: 'Драма' },
  { id: 'Комедія', label: 'Комедія' },
  { id: 'Фентезі', label: 'Фентезі' },
  { id: 'Трилер', label: 'Трилер' },
  { id: 'Кримінал', label: 'Кримінал' },
  { id: 'Анімація', label: 'Анімація' },
  { id: 'Сімейний', label: 'Сімейний' },
];

const YEARS = [
  { id: 'all', label: 'Усі роки' },
  { id: '2024+', label: '2024–2026' },
  { id: '2023', label: '2023' },
  { id: '2020-2022', label: '2020–2022' },
  { id: '2010-2019', label: '2010–2019' },
  { id: 'classic', label: 'До 2010' },
];

const QUICK_TAGS = [
  'Дюна', 'Інтерстеллар', 'Бетмен', 'Месники', 'Гра престолів',
  'Відьмак', 'Матриця', 'Гаррі Поттер', 'Термінатор', 'Наруто', 'Шрек', 'Аватар'
];

export const FilterBar: React.FC<FilterBarProps> = ({
  filter,
  onChange,
  totalCount,
  onQuickSearch,
}) => {
  return (
    <div className="bg-[#0b101b]/90 border border-white/10 rounded-2xl p-4 space-y-3.5 shadow-xl">
      {/* Top Row: Genre Pills */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 pr-2 shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-red-500" />
          <span>Жанри:</span>
        </div>
        {GENRES.map((g) => {
          const active = filter.genre === g.id;
          return (
            <button
              key={g.id}
              onClick={() => onChange({ genre: g.id })}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                active
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {g.label}
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
            return (
              <button
                key={y.id}
                onClick={() => onChange({ year: y.id })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  active
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {y.label}
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
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                filter.sortBy === 'popularity' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Популярні
            </button>
            <button
              onClick={() => onChange({ sortBy: 'rating' })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                filter.sortBy === 'rating' ? 'bg-white/15 text-amber-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              За рейтингом ★
            </button>
            <button
              onClick={() => onChange({ sortBy: 'year' })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                filter.sortBy === 'year' ? 'bg-white/15 text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              Новіші
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
            <Sparkles className="w-3 h-3" /> Швидкий пошук:
          </span>
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => onQuickSearch(tag)}
              className="px-2.5 py-0.5 rounded-full text-[11px] bg-white/5 hover:bg-red-600/20 text-slate-300 hover:text-red-300 border border-white/10 hover:border-red-500/30 whitespace-nowrap transition-all"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
