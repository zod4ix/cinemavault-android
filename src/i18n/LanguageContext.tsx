import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  SupportedLanguage,
  translations,
  TranslationKey,
  translateGenre,
} from './translations';
import { MediaItem } from '../types/movie';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: TranslationKey) => string;
  /** Translate a canonical (Ukrainian) genre label into the active UI language. */
  tg: (genre: string) => string;
  /** Title to display for the active language (localised only where we really have it). */
  title: (media: MediaItem) => string;
}

const LANGUAGE_KEY = 'cinemavault_language';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function detectInitialLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY) as SupportedLanguage | null;
    if (saved && translations[saved]) return saved;
    const nav = (navigator.language || 'uk').slice(0, 2).toLowerCase();
    if (nav in translations) return nav as SupportedLanguage;
  } catch {
    // ignore
  }
  return 'uk';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(detectInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_KEY, lang);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const dict = translations[language] || translations.uk;
      return dict[key] || translations.uk[key] || key;
    },
    [language]
  );

  const tg = useCallback((genre: string) => translateGenre(genre, language), [language]);

  const title = useCallback(
    (media: MediaItem) =>
      language === 'uk' ? media.title : media.originalTitle || media.title,
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tg, title }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
