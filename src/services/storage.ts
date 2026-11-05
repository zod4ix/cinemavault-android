import { MediaItem, PlaybackProgress } from '../types/movie';

const FAVORITES_KEY = 'cinemavault_favorites';
const HISTORY_KEY = 'cinemavault_history';
const SETTINGS_KEY = 'cinemavault_settings';

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

export const storageService = {
  getFavorites(): MediaItem[] {
    try {
      const data = localStorage.getItem(FAVORITES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  isFavorite(id: string | number): boolean {
    const list = this.getFavorites();
    return list.some(item => item.id.toString() === id.toString());
  },

  toggleFavorite(item: MediaItem): boolean {
    const list = this.getFavorites();
    const index = list.findIndex(i => i.id.toString() === item.id.toString());
    let added = false;
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.unshift(item);
      added = true;
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
    return added;
  },

  getHistory(): PlaybackProgress[] {
    try {
      const data = localStorage.getItem(HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveProgress(progress: PlaybackProgress): void {
    const list = this.getHistory();
    const index = list.findIndex(i => i.mediaId.toString() === progress.mediaId.toString() && i.episodeId === progress.episodeId);
    if (index >= 0) {
      list.splice(index, 1);
    }
    list.unshift({ ...progress, lastUpdated: Date.now() });
    // Keep last 40 items
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)));
  },

  getProgress(mediaId: string | number, episodeId?: string | number): PlaybackProgress | undefined {
    const list = this.getHistory();
    return list.find(i => i.mediaId.toString() === mediaId.toString() && (!episodeId || i.episodeId === episodeId));
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  }
};
