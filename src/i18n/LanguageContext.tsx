import React, { createContext, useContext, useState, useEffect } from 'react';
import { SupportedLanguage, translations } from './translations';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: keyof typeof translations['uk']) => string;
}

const LANGUAGE_KEY = 'cinemavault_language';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>('uk');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY) as SupportedLanguage;
      if (saved && translations[saved]) {
        setLanguageState(saved);
      }
    } catch {
      // Default to uk
    }
  }, []);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    localStorage.setItem(LANGUAGE_KEY, lang);
  };

  const t = (key: keyof typeof translations['uk']): string => {
    const langDict = translations[language] || translations.uk;
    return langDict[key] || translations.uk[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
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
