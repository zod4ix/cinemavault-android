import React from 'react';
import { Home, Search, Film, Heart, Sparkles } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface BottomNavProps {
  selectedCategory: string;
  isFavoritesActive: boolean;
  isSearchActive: boolean;
  favoritesCount: number;
  onSelectCategory: (cat: any) => void;
  onOpenSearch: () => void;
  onOpenFavorites: () => void;
  onOpenDonate: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  selectedCategory,
  isFavoritesActive,
  isSearchActive,
  favoritesCount,
  onSelectCategory,
  onOpenSearch,
  onOpenFavorites,
  onOpenDonate,
}) => {
  const { t } = useLanguage();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#07090e]/98 backdrop-blur-xl border-t border-white/15 px-1 py-1 grid grid-cols-5 items-center select-none shadow-[0_-8px_24px_rgba(0,0,0,0.65)]">
      <button
        onClick={() => onSelectCategory('trending')}
        className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors min-w-0 ${
          selectedCategory === 'trending' && !isFavoritesActive && !isSearchActive
            ? 'text-red-500 font-bold bg-red-500/10'
            : 'text-slate-400 active:text-white'
        }`}
      >
        <Home className="w-5 h-5 shrink-0" />
        <span className="text-[10px] truncate max-w-full px-1">Головна</span>
      </button>

      <button
        onClick={onOpenSearch}
        className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors min-w-0 ${
          isSearchActive
            ? 'text-red-500 font-bold bg-red-500/10'
            : 'text-slate-400 active:text-white'
        }`}
      >
        <Search className="w-5 h-5 shrink-0" />
        <span className="text-[10px] truncate max-w-full px-1">Пошук</span>
      </button>

      <button
        onClick={() => onSelectCategory('movies')}
        className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors min-w-0 ${
          selectedCategory === 'movies' && !isFavoritesActive && !isSearchActive
            ? 'text-red-500 font-bold bg-red-500/10'
            : 'text-slate-400 active:text-white'
        }`}
      >
        <Film className="w-5 h-5 shrink-0" />
        <span className="text-[10px] truncate max-w-full px-1">{t('movies')}</span>
      </button>

      <button
        onClick={onOpenFavorites}
        className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors min-w-0 ${
          isFavoritesActive
            ? 'text-red-500 font-bold bg-red-500/10'
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
        <span className="text-[10px] truncate max-w-full px-1">{t('favoritesTitle')}</span>
      </button>

      <button
        onClick={onOpenDonate}
        className="flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl text-amber-400 font-bold active:bg-amber-500/10 min-w-0"
      >
        <Sparkles className="w-5 h-5 shrink-0" />
        <span className="text-[10px] truncate max-w-full px-1">Донат</span>
      </button>
    </nav>
  );
};
