import React from 'react';
import { Home, Search, Film, Heart, Tv } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface BottomNavProps {
  selectedCategory: string;
  isFavoritesActive: boolean;
  isSearchActive: boolean;
  isSportsActive?: boolean;
  favoritesCount: number;
  onSelectCategory: (cat: any) => void;
  onOpenSearch: () => void;
  onOpenFavorites: () => void;
  onOpenSports: () => void;
  onOpenDonate: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  selectedCategory,
  isFavoritesActive,
  isSearchActive,
  isSportsActive = false,
  favoritesCount,
  onSelectCategory,
  onOpenSearch,
  onOpenFavorites,
  onOpenSports,
}) => {
  const { t } = useLanguage();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 w-full max-w-full z-40 md:hidden bg-[#07090e] border-t border-white/15 px-1.5 py-1 grid grid-cols-5 items-center select-none shadow-[0_-10px_28px_rgba(0,0,0,0.85)]"
      style={{ backgroundColor: '#07090e' }}
    >
      <button
        onClick={() => onSelectCategory('trending')}
        className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors min-w-0 ${
          selectedCategory === 'trending' &&
          !isFavoritesActive &&
          !isSearchActive &&
          !isSportsActive
            ? 'text-red-500 font-bold bg-red-500/15'
            : 'text-slate-400 active:text-white'
        }`}
      >
        <Home className="w-5 h-5 shrink-0" />
        <span className="text-[10px] truncate max-w-full px-0.5">{t('navHome')}</span>
      </button>

      <button
        onClick={onOpenSearch}
        className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors min-w-0 ${
          isSearchActive
            ? 'text-red-500 font-bold bg-red-500/15'
            : 'text-slate-400 active:text-white'
        }`}
      >
        <Search className="w-5 h-5 shrink-0" />
        <span className="text-[10px] truncate max-w-full px-0.5">{t('navSearch')}</span>
      </button>

      <button
        onClick={onOpenSports}
        className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors min-w-0 ${
          isSportsActive
            ? 'text-emerald-400 font-extrabold bg-emerald-500/20'
            : 'text-emerald-400 active:text-white'
        }`}
      >
        <div className="relative">
          <Tv className="w-5 h-5 shrink-0" />
          <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-red-600" />
        </div>
        <span className="text-[10px] truncate max-w-full px-0.5 font-bold">{t('sportLiveBtn')}</span>
      </button>

      <button
        onClick={() => onSelectCategory('movies')}
        className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors min-w-0 ${
          selectedCategory === 'movies' &&
          !isFavoritesActive &&
          !isSearchActive &&
          !isSportsActive
            ? 'text-red-500 font-bold bg-red-500/15'
            : 'text-slate-400 active:text-white'
        }`}
      >
        <Film className="w-5 h-5 shrink-0" />
        <span className="text-[10px] truncate max-w-full px-0.5">{t('movies')}</span>
      </button>

      <button
        onClick={onOpenFavorites}
        className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors min-w-0 ${
          isFavoritesActive
            ? 'text-red-500 font-bold bg-red-500/15'
            : 'text-slate-400 active:text-white'
        }`}
      >
        <div className="relative">
          <Heart className={`w-5 h-5 shrink-0 ${isFavoritesActive ? 'fill-red-500' : ''}`} />
          {favoritesCount > 0 && (
            <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
              {favoritesCount}
            </span>
          )}
        </div>
        <span className="text-[10px] truncate max-w-full px-0.5">{t('favoritesTitle')}</span>
      </button>
    </nav>
  );
};
