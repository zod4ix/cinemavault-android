import React from 'react';
import { storageService } from './storage';

const CACHE_KEYS_TO_VALIDATE = [
  'cinemavault_favorites_v2',
  'cinemavault_history_v2',
  'cinemavault_settings_v2',
  'cinemavault_user_profile_v2',
  'cinemavault_novelties_cache_v1',
  'cinemavault_sports_hub_cache_v1',
];

export const selfHealService = {
  /**
   * Validates all local storage JSON structures on startup or error recovery.
   * Automatically purges corrupted cache entries and restores user data from IndexedDB backup.
   */
  async inspectAndRepair(): Promise<number> {
    let repairedCount = 0;
    try {
      for (const key of CACHE_KEYS_TO_VALIDATE) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed === null || typeof parsed !== 'object') {
              localStorage.removeItem(key);
              repairedCount++;
            }
          } catch {
            // Corrupted JSON detected — remove and heal!
            localStorage.removeItem(key);
            repairedCount++;
          }
        }
      }
      await storageService.restoreFromIndexedDB();
    } catch {
      // ignore
    }
    return repairedCount;
  },

  /**
   * Clears transient network/catalog caches and triggers a clean state regeneration
   */
  async regenerateTransientCaches(): Promise<void> {
    try {
      localStorage.removeItem('cinemavault_novelties_cache_v1');
      localStorage.removeItem('cinemavault_sports_hub_cache_v1');
      await storageService.restoreFromIndexedDB();
    } catch {
      // ignore
    }
  },

  /**
   * Attaches global runtime error & unhandled promise rejection guards
   * so transient third-party SDK or network errors never freeze the app.
   */
  initGlobalGuards() {
    if (typeof window === 'undefined') return;

    window.addEventListener('unhandledrejection', (event) => {
      // Prevent transient fetch/WebRTC promise rejections from crashing WebView
      const reason = String(event.reason || '');
      if (
        reason.includes('AbortError') ||
        reason.includes('Failed to fetch') ||
        reason.includes('NetworkError') ||
        reason.includes('webtor')
      ) {
        event.preventDefault();
      }
    });

    window.addEventListener('error', (event) => {
      // Ignore benign ResizeObserver or cross-origin iframe script warnings
      const msg = String(event.message || '');
      if (msg.includes('ResizeObserver') || msg.includes('Script error')) {
        event.preventDefault();
      }
    });

    this.inspectAndRepair().catch(() => {});
  },
};

interface BoundaryState {
  hasError: boolean;
  healAttempts: number;
}

/**
 * Self-Healing Error Boundary:
 * Automatically repairs storage and re-renders the app if any component tree error occurs.
 */
export class SelfHealingBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, healAttempts: 0 };
  }

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { hasError: true };
  }

  componentDidCatch() {
    selfHealService.inspectAndRepair().then(() => {
      if (this.state.healAttempts < 2) {
        // Auto-regenerate component tree immediately!
        setTimeout(() => {
          this.setState((prev) => ({
            hasError: false,
            healAttempts: prev.healAttempts + 1,
          }));
        }, 250);
      }
    });
  }

  render() {
    if (this.state.hasError) {
      return React.createElement(
        'div',
        { className: 'min-h-dvh bg-[#07090e] text-white flex flex-col items-center justify-center p-6 text-center space-y-4' },
        React.createElement('div', { className: 'w-12 h-12 rounded-full border-4 border-red-600/30 border-t-red-600 animate-spin' }),
        React.createElement('h2', { className: 'text-lg font-extrabold' }, 'Самовідновлення системи CinemaVault...'),
        React.createElement(
          'p',
          { className: 'text-xs text-slate-400 max-w-md' },
          'Виявлено тимчасовий збій. Система автоматично очищує пошкоджений кеш та відновлює роботу без втрати даних.'
        ),
        React.createElement(
          'button',
          {
            onClick: () => {
              selfHealService.regenerateTransientCaches().finally(() => {
                this.setState({ hasError: false, healAttempts: 0 });
              });
            },
            className: 'px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg',
          },
          'Перезапустити інтерфейс'
        )
      );
    }
    return this.props.children;
  }
}
