import React, { useState, useRef, useEffect } from 'react';
import { CinemaLogo } from './CinemaLogo';
import {
  Search,
  Heart,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Play,
  Loader2,
  Cloud,
  Tv,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGES, SupportedLanguage } from '../i18n/translations';
import { MediaItem } from '../types/movie';
import { createPosterFallback } from '../services/tmdb';
import { formatRating } from '../services/rating';
import { APP_VERSION } from '../services/updater';

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
  onOpenAuth?: () => void;
  authProfile?: any;
  isSportsActive?: boolean;
  onOpenSports?: () => void;
  onOpenUpdate?: () => void;
  hasAppUpdate?: boolean;
}

const COMMIT_DELAY_MS = 450;

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
  onOpenAuth,
  authProfile,
  isSportsActive = false,
  onOpenSports,
  onOpenUpdate,
  hasAppUpdate = false,
}) => {
  const { language, setLanguage, t, tg, title } = useLanguage();
  const [showLangMenu, setShowLangMenu] = useState<boolean>(false);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);

  const [draft, setDraft] = useState<string>(searchQuery);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef<string>(searchQuery);

  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const searchWrapperDesktopRef = useRef<HTMLDivElement>(null);
  const searchWrapperMobileRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const catRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchQuery !== lastCommitted.current) {
      lastCommitted.current = searchQuery;
      setDraft(searchQuery);
    }
  }, [searchQuery]);

  const commit = (value: string) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    lastCommitted.current = value;
    onSearchChange(value);
  };

  const handleType = (value: string) => {
    setDraft(value);
    setIsSearchFocused(true);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    if (value.trim().length === 0) {
      commit('');
      return;
    }
    commitTimer.current = setTimeout(() => {
      lastCommitted.current = value;
      onSearchChange(value);
    }, COMMIT_DELAY_MS);
  };

  const clearSearch = () => {
    setDraft('');
    commit('');
  };

  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);

  useEffect(() => {
    if (focusTrigger <= 0) return;
    if (window.innerWidth < 768) {
      mobileInputRef.current?.focus({ preventScroll: true });
    } else {
      desktopInputRef.current?.focus({ preventScroll: true });
    }
    setIsSearchFocused(true);
  }, [focusTrigger]);

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
    { id: 'sports', label: `🔴 ${t('sportLiveBtn')}`, isSport: true },
    { id: 'movies', label: `🎬 ${t('movies')}` },
    { id: 'series', label: `📺 ${t('series')}` },
    { id: 'cartoons', label: `🧸 ${t('cartoons')}` },
    { id: 'anime', label: `⛩️ ${t('anime')}` },
    { id: 'classic', label: `🏛️ ${t('classicTab')}` },
    { id: '4k', label: `💎 ${t('hdr4k')}` },
    { id: 'ukrainian', label: `🇺🇦 ${t('ukrainianTab')}` },
  ];

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const scrollCategories = (dir: 'left' | 'right') => {
    if (!catRowRef.current) return;
    const step = Math.max(160, catRowRef.current.clientWidth * 0.65);
    catRowRef.current.scrollBy({
      left: dir === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  const centerButtonInContainer = (container: HTMLDivElement | null, btn: HTMLElement) => {
    if (!container || !btn) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    const offset = bRect.left - cRect.left + container.scrollLeft;
    const target = offset - container.clientWidth / 2 + bRect.width / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearchFocused(false);
    mobileInputRef.current?.blur();
    desktopInputRef.current?.blur();
    if (commitTimer.current) clearTimeout(commitTimer.current);
    lastCommitted.current = draft;
    onSearchChange(draft);
    onSearchSubmit(draft);
  };

  const renderSuggestionsDropdown = () => {
    if (!isSearchFocused || draft.trim().length < 2) return null;
    if (quickSuggestions.length === 0 && !isSearchingLive) return null;

    return (
      <div className="absolute left-0 right-0 mt-1.5 bg-[#0f1523] border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
        <div className="px-3.5 py-2 bg-black/50 border-b border-white/10 flex items-center justify-between text-[11px] text-slate-400">
          <span className="truncate">
            {isSearchingLive
              ? t('searchingCatalogs')
              : `${t('quickResults')} (${quickSuggestions.length})`}
          </span>
          <span className="text-amber-400 font-semibold shrink-0 ml-2">IMDb • TMDB • UA</span>
        </div>

        {quickSuggestions.length > 0 ? (
          <div className="max-h-72 overflow-y-auto divide-y divide-white/5 custom-scrollbar">
            {quickSuggestions.slice(0, 6).map((item) => (
              <div
                key={item.id}
                tabIndex={0}
                role="button"
                onClick={() => {
                  setIsSearchFocused(false);
                  mobileInputRef.current?.blur();
                  desktopInputRef.current?.blur();
                  onSelectMedia(item);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsSearchFocused(false);
                    mobileInputRef.current?.blur();
                    desktopInputRef.current?.blur();
                    onSelectMedia(item);
                  }
                }}
                className="p-2.5 hover:bg-white/10 active:bg-white/15 cursor-pointer flex items-center gap-3 transition-colors tv-btn-focus focus:outline-none"
              >
                <img
                  src={item.posterPath}
                  alt={title(item)}
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
                    {title(item)}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{item.year}</span>
                    <span>•</span>
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <span className="px-1 py-0.2 rounded-[2px] text-[8px] font-black bg-[#f5c518] text-black leading-none">
                        IMDb
                      </span>
                      <span>{formatRating(item.rating)}</span>
                    </span>
                    <span>•</span>
                    <span className="truncate">{tg(item.genres[0] || t('genreFilm'))}</span>
                  </div>
                </div>
                <Play className="w-4 h-4 text-red-500 shrink-0 mr-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 flex items-center justify-center gap-2 text-xs text-slate-300">
            <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
            <span className="truncate">
              {t('searchingFor')} «{draft}»...
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <header
      className="sticky top-0 z-40 w-full max-w-full bg-[#07090e] border-b border-white/10 shadow-lg"
      style={{ backgroundColor: '#07090e' }}
    >
      <div className="w-full max-w-[1700px] mx-auto px-2.5 sm:px-6 lg:px-8">
        {/* Top Row: Logo + Search (Desktop) + Action Controls (100% Viewport-Fit, Never Overflows) */}
        <div
          data-nav-row="header-top"
          className="flex items-center justify-between h-14 sm:h-16 gap-1.5 sm:gap-3 w-full min-w-0"
        >
          {/* Brand Logo */}
          <div
            tabIndex={0}
            role="button"
            aria-label="На головну"
            onClick={() => {
              onSelectCategory('trending');
              clearSearch();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectCategory('trending');
                clearSearch();
              }
            }}
            className="flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 select-none tv-btn-focus focus:outline-none rounded-xl py-1 pr-1"
          >
            <CinemaLogo size="sm" />
            <div className="leading-tight">
              <span className="font-extrabold text-[15px] sm:text-xl lg:text-2xl text-white tracking-tight flex items-center leading-none">
                Cinema<span className="text-red-500">Vault</span>
              </span>
              <span className="text-[8.5px] sm:text-[10px] text-amber-400 font-bold tracking-wider block mt-0.5 whitespace-nowrap">
                PRO v{APP_VERSION} • 4K & LIVE
              </span>
            </div>
          </div>

          {/* Zero-Overlap Desktop / Tablet Search Bar */}
          <div
            ref={searchWrapperDesktopRef}
            className="hidden md:block flex-1 max-w-lg xl:max-w-xl relative mx-2 min-w-0"
          >
            <form
              onSubmit={handleFormSubmit}
              className="flex items-center gap-2 bg-[#111726] border border-white/15 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/30 rounded-2xl pl-3.5 pr-1.5 py-1.5 transition-all"
            >
              <Search className="w-4 h-4 text-red-500 shrink-0 pointer-events-none" />
              <input
                ref={desktopInputRef}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t('searchPlaceholder')}
                value={draft}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => handleType(e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none py-1"
              />
              {isSearchingLive && (
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              )}
              {draft && (
                <button
                  type="button"
                  tabIndex={0}
                  onClick={clearSearch}
                  className="p-1 rounded-full text-slate-400 hover:text-white shrink-0 tv-btn-focus focus:outline-none"
                  aria-label="Очистити пошук"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                tabIndex={0}
                className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors shrink-0 tv-btn-focus focus:outline-none"
              >
                {t('searchBtn')}
              </button>
            </form>
            {renderSuggestionsDropdown()}
          </div>

          {/* Right Action Controls (100% fits in view on all screen widths) */}
          <div className="flex items-center justify-end gap-1 sm:gap-2 min-w-0 shrink-0">
            {/* Dedicated SPORT LIVE Button */}
            {onOpenSports && (
              <button
                onClick={onOpenSports}
                tabIndex={0}
                className={`px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-black flex items-center gap-1 sm:gap-1.5 border transition-all active:scale-95 shrink-0 tv-btn-focus focus:outline-none ${
                  isSportsActive
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/35'
                    : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/35'
                }`}
                title="Спорт Онлайн — Прямі трансляції матчів та спортивні канали 24/7"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <Tv className="w-3.5 h-3.5 hidden lg:inline shrink-0" />
                <span className="hidden xs:inline sm:inline whitespace-nowrap">{t('sportLiveBtn')}</span>
                <span className="xs:hidden sm:hidden whitespace-nowrap">Live</span>
              </button>
            )}

            {/* Language Switcher */}
            <div ref={langMenuRef} className="relative shrink-0">
              <button
                onClick={() => setShowLangMenu(!showLangMenu)}
                tabIndex={0}
                className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 py-1.5 sm:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 transition-colors tv-btn-focus focus:outline-none"
                title={t('changeLanguage')}
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
                      tabIndex={0}
                      onClick={() => {
                        setLanguage(lang.code as SupportedLanguage);
                        setShowLangMenu(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left tv-btn-focus focus:outline-none ${
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

            {/* Update & Self-Healing Hub Button */}
            {onOpenUpdate && (
              <button
                onClick={onOpenUpdate}
                tabIndex={0}
                className={`relative p-1.5 sm:p-2.5 rounded-xl border transition-all flex items-center justify-center shrink-0 tv-btn-focus focus:outline-none ${
                  hasAppUpdate
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/20'
                    : 'bg-white/5 border-white/10 text-emerald-400 hover:bg-white/10'
                }`}
                title="Оновлення додатку з GitHub та Самовідновлення"
              >
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                {hasAppUpdate && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                )}
                {hasAppUpdate && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500" />
                )}
              </button>
            )}

            {/* Cloud Sync & User Profile Button */}
            {onOpenAuth && (
              <button
                onClick={onOpenAuth}
                tabIndex={0}
                className="relative p-1.5 sm:p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all flex items-center justify-center shrink-0 tv-btn-focus focus:outline-none"
                title="Хмарна синхронізація та профіль"
              >
                {authProfile?.avatar ? (
                  <img
                    src={authProfile.avatar}
                    alt={authProfile.name}
                    className="w-4 h-4 sm:w-5 sm:h-5 rounded-full object-cover border border-white/20"
                  />
                ) : (
                  <Cloud className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                )}
                {authProfile ? (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#07090e]" />
                ) : null}
              </button>
            )}

            {/* Favorites Button (Tablet / Desktop) */}
            <button
              onClick={onOpenFavorites}
              tabIndex={0}
              className={`hidden sm:flex relative p-2 sm:p-2.5 rounded-xl border transition-all shrink-0 tv-btn-focus focus:outline-none ${
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
              tabIndex={0}
              className="relative group overflow-hidden px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-[11px] sm:text-xs flex items-center gap-1 sm:gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95 transition-all shrink-0 tv-btn-focus focus:outline-none"
            >
              <Heart className="w-3.5 h-3.5 text-red-600 fill-red-600 shrink-0" />
              <span className="hidden xl:inline whitespace-nowrap">{t('donateBtn')}</span>
              <span className="xl:hidden whitespace-nowrap">{t('donateShort')}</span>
            </button>
          </div>
        </div>

        {/* Dedicated Zero-Overlap Mobile Search Bar */}
        <div ref={searchWrapperMobileRef} className="md:hidden pb-2 relative w-full">
          <form
            onSubmit={handleFormSubmit}
            className="flex items-center gap-1.5 bg-[#111726] border border-white/15 focus-within:border-red-500 rounded-xl pl-3 pr-1.5 py-1 w-full"
          >
            <Search className="w-4 h-4 text-red-500 shrink-0 pointer-events-none" />
            <input
              ref={mobileInputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('searchPlaceholder')}
              value={draft}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => handleType(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-[13px] text-white placeholder-slate-400 focus:outline-none py-1"
            />
            {isSearchingLive && (
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
            )}
            {draft && (
              <button
                type="button"
                tabIndex={0}
                onClick={clearSearch}
                className="p-1 rounded-full text-slate-400 hover:text-white shrink-0 tv-btn-focus focus:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              tabIndex={0}
              className="px-2.5 py-1 rounded-lg bg-red-600 active:bg-red-500 text-white text-xs font-bold shrink-0 tv-btn-focus focus:outline-none"
            >
              {t('searchBtn')}
            </button>
          </form>
          {renderSuggestionsDropdown()}
        </div>

        {/* Category Pills Interactive Carousel with Left/Right Arrows & Snap */}
        <div
          data-nav-row="header-categories"
          className="flex items-center gap-1 sm:gap-1.5 py-1.5 sm:py-2 border-t border-white/5 w-full min-w-0"
        >
          <button
            type="button"
            onClick={() => scrollCategories('left')}
            tabIndex={0}
            aria-label="Попередні категорії"
            className="p-1.5 rounded-full bg-white/5 hover:bg-red-600 active:bg-red-600 text-slate-300 hover:text-white shrink-0 transition-colors tv-btn-focus focus:outline-none"
          >
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <div
            ref={catRowRef}
            onWheel={(e) => {
              if (catRowRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                catRowRef.current.scrollLeft += e.deltaY;
              }
            }}
            className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth text-xs px-0.5"
          >
            {categories.map((cat) => {
              const isActive = cat.isSport
                ? isSportsActive
                : selectedCategory === cat.id &&
                  !isFavoritesActive &&
                  !isSportsActive &&
                  !searchQuery;

              return (
                <button
                  key={cat.id}
                  tabIndex={0}
                  onClick={(e) => {
                    centerButtonInContainer(catRowRef.current, e.currentTarget);
                    if (cat.isSport && onOpenSports) {
                      onOpenSports();
                    } else {
                      onSelectCategory(cat.id);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all shrink-0 snap-start tv-btn-focus focus:outline-none ${
                    isActive
                      ? cat.isSport
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                        : 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md shadow-red-600/30'
                      : cat.isSport
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollCategories('right')}
            tabIndex={0}
            aria-label="Наступні категорії"
            className="p-1.5 rounded-full bg-white/5 hover:bg-red-600 active:bg-red-600 text-slate-300 hover:text-white shrink-0 transition-colors tv-btn-focus focus:outline-none"
          >
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
