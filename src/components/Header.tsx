import React, { useState, useRef, useEffect } from 'react';
import { CinemaLogo } from './CinemaLogo';
import { Search, Heart, X, ChevronDown, Star, Play, Loader2 } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGES, SupportedLanguage } from '../i18n/translations';
import { MediaItem } from '../types/movie';
import { createPosterFallback } from '../services/tmdb';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (query: string) => void;
  isSearchingLive: boolean;
  quickSuggestions: MediaItem[];
  onSelectMedia: (media: MediaItem) => void;
  selectedCategory: string;
  onSelectCategory: (category: any) => void;
  onOpenDonate: () => void;
  favoritesCount: number;
  onOpenFavorites: () => void;
  isFavoritesActive: boolean;
  focusTrigger?: number;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  isSearchingLive,
  quickSuggestions,
  onSelectMedia,
  selectedCategory,
  onSelectCategory,
  onOpenDonate,
  favoritesCount,
  onOpenFavorites,
  isFavoritesActive,
  focusTrigger = 0,
}) => {
  const { language, setLanguage, t } = useLanguage();
  const [showLangMenu, setShowLangMenu] = useState<boolean>(false);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);

  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const searchWrapperDesktopRef = useRef<HTMLDivElement>(null);
  const searchWrapperMobileRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Focus whichever search input is visible on screen when triggered from BottomNav
  useEffect(() => {
    if (focusTrigger <= 0) return;
    if (window.innerWidth < 768) {
      mobileInputRef.current?.focus();
    } else {
      desktopInputRef.current?.focus();
    }
    setIsSearchFocused(true);
  }, [focusTrigger]);

  // Close dropdowns on outside pointerdown (works reliably on Android touchscreens!)
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const inDesktop = searchWrapperDesktopRef.current?.contains(target);
      const inMobile = searchWrapperMobileRef.current?.contains(target);
      if (!inDesktop && !inMobile) {
        setIsSearchFocused(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(target)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const categories = [
    { id: 'trending', label: `🔥 ${t('allTrends')}` },
    { id: 'movies', label: `🎬 ${t('movies')}` },
    { id: 'series', label: `📺 ${t('series')}` },
    { id: 'cartoons', label: `🧸 ${t('cartoons')}` },
    { id: 'anime', label: `⛩️ ${t('anime')}` },
    { id: '4k', label: `💎 ${t('hdr4k')}` },
    { id: 'ukrainian', label: `🇺🇦 Українською` },
  ];

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearchFocused(false);
    mobileInputRef.current?.blur();
    desktopInputRef.current?.blur();
    onSearchSubmit(searchQuery);
  };

  const renderSuggestionsDropdown = () => {
    if (!isSearchFocused || searchQuery.trim().length < 2) return null;
    if (quickSuggestions.length === 0 && !isSearchingLive) return null;

    return (
      <div className="absolute left-0 right-0 mt-1.5 bg-[#0f1523] border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
        <div className="px-3.5 py-2 bg-black/50 border-b border-white/10 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {isSearchingLive
              ? 'Пошук у світових каталогах...'
              : `Швидкі результати (${quickSuggestions.length})`}
          </span>
          <span className="text-amber-400 font-semibold">IMDb • TMDB • UA</span>
        </div>

        {quickSuggestions.length > 0 ? (
          <div className="max-h-72 overflow-y-auto divide-y divide-white/5 custom-scrollbar">
            {quickSuggestions.slice(0, 6).map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setIsSearchFocused(false);
                  mobileInputRef.current?.blur();
                  desktopInputRef.current?.blur();
                  onSelectMedia(item);
                }}
                className="p-2.5 hover:bg-white/10 active:bg-white/15 cursor-pointer flex items-center gap-3 transition-colors"
              >
                <img
                  src={item.posterPath}
                  alt={item.title}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = createPosterFallback(
                      item.title,
                      item.year,
                      item.rating
                    );
                  }}
                  className="w-10 h-14 object-cover rounded-lg bg-slate-800 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                    {item.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{item.year}</span>
                    <span>•</span>
                    <span className="text-amber-400 font-bold flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-400" /> {item.rating.toFixed(1)}
                    </span>
                    <span>•</span>
                    <span className="truncate">{item.genres[0] || 'Кіно'}</span>
                  </div>
                </div>
                <Play className="w-4 h-4 text-red-500 shrink-0 mr-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 flex items-center justify-center gap-2 text-xs text-slate-300">
            <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
            <span>Шукаємо «{searchQuery}»...</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-[#07090e]/95 backdrop-blur-xl border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top Row: Compact on Phone, Spacious on Tablet/Desktop */}
        <div className="flex items-center justify-between h-14 sm:h-18 gap-2 sm:gap-4">
          {/* Brand Logo */}
          <div
            onClick={() => {
              onSelectCategory('trending');
              onSearchChange('');
            }}
            className="flex items-center gap-2 cursor-pointer shrink-0 select-none"
          >
            <CinemaLogo size="sm" />
            <div>
              <span className="font-extrabold text-base sm:text-2xl text-white tracking-tight flex items-center leading-none">
                Cinema<span className="text-red-500">Vault</span>
              </span>
              <span className="text-[9px] sm:text-[11px] text-amber-400 font-bold tracking-wider block mt-0.5">
                UA CINEMA • 4K
              </span>
            </div>
          </div>

          {/* Desktop / Tablet Search Bar */}
          <div ref={searchWrapperDesktopRef} className="hidden md:block flex-1 max-w-xl relative mx-4">
            <form onSubmit={handleFormSubmit} className="relative flex items-center">
              <Search className="w-4 h-4 text-red-500 absolute left-3.5 pointer-events-none" />
              <input
                ref={desktopInputRef}
                type="search"
                enterKeyHint="search"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  setIsSearchFocused(true);
                }}
                className="w-full bg-[#111726] border border-white/15 focus:border-red-500 rounded-2xl pl-10 pr-28 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-all"
              />
              {isSearchingLive && (
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin absolute right-24" />
              )}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-20 p-1 rounded-full text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors"
              >
                Знайти
              </button>
            </form>
            {renderSuggestionsDropdown()}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Language Switcher */}
            <div ref={langMenuRef} className="relative">
              <button
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 transition-colors"
                title="Змінити мову"
              >
                <span className="text-sm leading-none">{currentLang.flag}</span>
                <span className="hidden sm:inline font-bold uppercase">{currentLang.code}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showLangMenu && (
                <div className="absolute right-0 mt-2 w-40 bg-[#121824] border border-white/15 rounded-xl shadow-2xl p-1.5 z-50 animate-fadeIn">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLanguage(lang.code as SupportedLanguage);
                        setShowLangMenu(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left ${
                        language === lang.code
                          ? 'bg-red-600 text-white'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="text-base">{lang.flag}</span>
                      <span>{lang.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Favorites Button (Hidden on tiny phones since BottomNav has Favorites, shown on sm+) */}
            <button
              onClick={onOpenFavorites}
              className={`hidden sm:flex relative p-2 sm:p-2.5 rounded-xl border transition-all ${
                isFavoritesActive
                  ? 'bg-red-500/20 border-red-500 text-red-400'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              title={t('favoritesTitle')}
            >
              <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${isFavoritesActive ? 'fill-red-400' : ''}`} />
              {favoritesCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#07090e]">
                  {favoritesCount}
                </span>
              )}
            </button>

            {/* Golden Donate Button */}
            <button
              onClick={onOpenDonate}
              className="relative group overflow-hidden px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
            >
              <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600 fill-red-600 shrink-0" />
              <span className="hidden sm:inline">{t('donateBtn')}</span>
              <span className="sm:hidden">Донат</span>
            </button>
          </div>
        </div>

        {/* Dedicated Mobile Search Bar (With Live Autocomplete Dropdown!) */}
        <div ref={searchWrapperMobileRef} className="md:hidden pb-2 relative">
          <form onSubmit={handleFormSubmit} className="relative flex items-center">
            <Search className="w-4 h-4 text-red-500 absolute left-3 pointer-events-none" />
            <input
              ref={mobileInputRef}
              type="search"
              enterKeyHint="search"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setIsSearchFocused(true);
              }}
              className="w-full bg-[#111726] border border-white/15 focus:border-red-500 rounded-xl pl-9 pr-24 py-2 text-[13px] text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
            {isSearchingLive && (
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin absolute right-20" />
            )}
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-16 p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1 px-2.5 py-1 rounded-lg bg-red-600 active:bg-red-500 text-white text-xs font-bold"
            >
              Знайти
            </button>
          </form>
          {renderSuggestionsDropdown()}
        </div>

        {/* Sleek Horizontal Category Pills */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1.5 sm:py-2 scrollbar-none text-xs border-t border-white/5">
          {categories.map((cat) => {
            const isActive =
              selectedCategory === cat.id && !isFavoritesActive && !searchQuery;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`px-3 py-1 sm:py-1.5 rounded-full font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md shadow-red-600/30'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
