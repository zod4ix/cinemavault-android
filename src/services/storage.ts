import { MediaItem, PlaybackProgress } from '../types/movie';
import { authSyncService } from './authSync';

const FAVORITES_KEY = 'cinemavault_favorites_v2';
const HISTORY_KEY = 'cinemavault_history_v2';
const SETTINGS_KEY = 'cinemavault_settings_v2';

// Legacy keys for migration
const LEGACY_FAVORITES_KEY = 'cinemavault_favorites';
const LEGACY_HISTORY_KEY = 'cinemavault_history';

export interface UserSettings {
  autoPlayNext: boolean;
  defaultQuality: '1080p' | '720p' | '4K' | 'auto';
  preferUkrainianAudio: boolean;
  filterOutCamRips: boolean;
  customRezkaMirror?: string;
}

export const defaultSettings: UserSettings = {
  autoPlayNext: true,
  defaultQuality: '1080p',
  preferUkrainianAudio: true,
  filterOutCamRips: true,
};

// Lightweight IndexedDB helper for resilient storage
const DB_NAME = 'CinemaVaultResilientDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

function getIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, val: any) {
  try {
    const db = await getIDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(val, key);
  } catch {}
}

async function idbGet(key: string): Promise<any> {
  try {
    const db = await getIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export const storageService = {
  getFavorites(): MediaItem[] {
    try {
      const data = localStorage.getItem(FAVORITES_KEY) || localStorage.getItem(LEGACY_FAVORITES_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  },

  isFavorite(id: string | number): boolean {
    const list = this.getFavorites();
    return list.some((item) => item.id.toString() === id.toString());
  },

  toggleFavorite(item: MediaItem): boolean {
    const list = this.getFavorites();
    const index = list.findIndex((i) => i.id.toString() === item.id.toString());
    let added = false;
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.unshift(item);
      added = true;
    }
    const json = JSON.stringify(list);
    try {
      localStorage.setItem(FAVORITES_KEY, json);
      idbSet(FAVORITES_KEY, list);
    } catch {}

    authSyncService.scheduleCloudSync();
    return added;
  },

  mergeFavorites(incoming: MediaItem[]) {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    const current = this.getFavorites();
    const map = new Map<string, MediaItem>();
    // Add current first
    current.forEach((i) => map.set(i.id.toString(), i));
    // Merge incoming
    incoming.forEach((i) => {
      if (i && i.id) map.set(i.id.toString(), i);
    });
    const merged = Array.from(map.values());
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(merged));
      idbSet(FAVORITES_KEY, merged);
    } catch {}
  },

  getHistory(): PlaybackProgress[] {
    try {
      const data = localStorage.getItem(HISTORY_KEY) || localStorage.getItem(LEGACY_HISTORY_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  },

  saveProgress(progress: PlaybackProgress): void {
    if (!progress || !progress.mediaId) return;
    const list = this.getHistory();
    const index = list.findIndex(
      (i) =>
        i.mediaId.toString() === progress.mediaId.toString() &&
        (i.episodeId || '') === (progress.episodeId || '')
    );

    const updatedItem: PlaybackProgress = {
      ...progress,
      lastUpdated: Date.now(),
    };

    if (index >= 0) {
      list.splice(index, 1);
    }
    list.unshift(updatedItem);

    // Keep last 50 items
    const truncated = list.slice(0, 50);
    const json = JSON.stringify(truncated);
    try {
      localStorage.setItem(HISTORY_KEY, json);
      idbSet(HISTORY_KEY, truncated);
    } catch {}

    authSyncService.scheduleCloudSync();
  },

  mergeHistory(incoming: PlaybackProgress[]) {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    const current = this.getHistory();
    const map = new Map<string, PlaybackProgress>();

    current.forEach((i) => {
      const key = `${i.mediaId}-${i.episodeId || 'single'}`;
      map.set(key, i);
    });

    incoming.forEach((inc) => {
      if (!inc || !inc.mediaId) return;
      const key = `${inc.mediaId}-${inc.episodeId || 'single'}`;
      const existing = map.get(key);
      if (!existing || (inc.lastUpdated || 0) > (existing.lastUpdated || 0)) {
        map.set(key, inc);
      }
    });

    const merged = Array.from(map.values()).sort(
      (a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0)
    ).slice(0, 50);

    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
      idbSet(HISTORY_KEY, merged);
    } catch {}
  },

  getProgress(mediaId: string | number, episodeId?: string | number): PlaybackProgress | undefined {
    const list = this.getHistory();
    return list.find(
      (i) =>
        i.mediaId.toString() === mediaId.toString() &&
        (!episodeId || i.episodeId === episodeId)
    );
  },

  getSettings(): UserSettings {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? { ...defaultSettings, ...JSON.parse(data) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  },

  saveSettings(settings: Partial<UserSettings>): UserSettings {
    const updated = { ...this.getSettings(), ...settings };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {}
    return updated;
  },

  /**
   * Restores data from IndexedDB if localStorage was cleared by OS
   */
  async restoreFromIndexedDB(): Promise<void> {
    try {
      if (!localStorage.getItem(FAVORITES_KEY)) {
        const idbFavs = await idbGet(FAVORITES_KEY);
        if (Array.isArray(idbFavs) && idbFavs.length > 0) {
          localStorage.setItem(FAVORITES_KEY, JSON.stringify(idbFavs));
        }
      }
      if (!localStorage.getItem(HISTORY_KEY)) {
        const idbHist = await idbGet(HISTORY_KEY);
        if (Array.isArray(idbHist) && idbHist.length > 0) {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(idbHist));
        }
      }
    } catch {}
  },
};

// Auto-restore on app start
if (typeof window !== 'undefined') {
  storageService.restoreFromIndexedDB().catch(() => {});
}
