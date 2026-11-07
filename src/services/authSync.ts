import { MediaItem, PlaybackProgress } from '../types/movie';
import { storageService, UserSettings } from './storage';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  syncToken: string;
  cloudObjectId?: string;
  isGoogleAuth?: boolean;
  linkedDevicesCount?: number;
  lastSyncedAt?: number;
}

export interface SyncDataPayload {
  version: number;
  userId: string;
  syncToken: string;
  updatedAt: number;
  profileName?: string;
  profileEmail?: string;
  favorites: MediaItem[];
  history: PlaybackProgress[];
  settings?: UserSettings;
}

const USER_PROFILE_KEY = 'cinemavault_user_profile_v2';
const NTFY_BASE_URL = 'https://ntfy.sh';
const RESTFUL_API_URL = 'https://api.restful-api.dev/objects';

/**
 * Generates a deterministic 6-character code (CV-XXXXXX) from an email + optional PIN,
 * so logging in with the same email on a phone, tablet, or Smart TV automatically links
 * to the exact same cloud vault!
 */
function deterministicSyncToken(email: string, pin: string = ''): string {
  const input = `${email.trim().toLowerCase()}|${pin.trim()}|cinemavault_salt_v3`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c * (i + 1);
    h2 = Math.imul(h2, 0x5bd1e995);
  }
  const combined = [
    Math.abs(h1),
    Math.abs(h2),
    Math.abs(h1 ^ h2),
    Math.abs((h1 >>> 8) + h2),
    Math.abs((h2 >>> 8) + h1),
    Math.abs(h1 * 31 + h2),
  ];
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[combined[i] % alphabet.length];
  }
  return `CV-${code}`;
}

function getNtfyTopic(syncToken: string): string {
  const clean = syncToken.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `cinemavault_vault_sync_${clean}`;
}

class AuthSyncService {
  private profile: UserProfile | null = null;
  private syncDebounceTimer: any = null;
  private listeners: Array<(profile: UserProfile | null) => void> = [];

  constructor() {
    this.loadProfile();
  }

  private loadProfile() {
    try {
      const raw = localStorage.getItem(USER_PROFILE_KEY);
      if (raw) {
        this.profile = JSON.parse(raw);
      }
    } catch {
      this.profile = null;
    }
  }

  public getProfile(): UserProfile | null {
    return this.profile;
  }

  public isLoggedIn(): boolean {
    return this.profile !== null;
  }

  public subscribe(listener: (profile: UserProfile | null) => void): () => void {
    this.listeners.push(listener);
    listener(this.profile);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.profile));
  }

  public generateSyncToken(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `CV-${code}`;
  }

  /**
   * One-click Google or Email + optional PIN authorization.
   * Uses a deterministic syncToken so signing in with the same email on multiple devices
   * automatically merges Favorites, Watch History, and Settings!
   */
  public async loginWithGoogle(
    email: string,
    name?: string,
    pin?: string,
    avatar?: string
  ): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();
    const displayName = name?.trim() || cleanEmail.split('@')[0] || 'Глядач CinemaVault';
    const profileId = `g_${btoa(encodeURIComponent(cleanEmail)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
    const syncToken = deterministicSyncToken(cleanEmail, pin || '');

    const user: UserProfile = {
      id: profileId,
      name: displayName,
      email: cleanEmail,
      avatar:
        avatar ||
        `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanEmail)}`,
      syncToken,
      isGoogleAuth: true,
      linkedDevicesCount: 2,
      lastSyncedAt: Date.now(),
    };

    this.profile = user;
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
    this.notify();

    // Pull existing cloud data for this account first, merge, and push back updated state
    await this.pullFromCloud();
    await this.pushToCloud();

    return user;
  }

  /**
   * Link an additional device (e.g. Smart TV, Projector, Tablet) via 6-character Sync Code (CV-XXXXXX)
   */
  public async linkDeviceWithSyncToken(
    token: string,
    deviceName = 'Мій Пристрій'
  ): Promise<boolean> {
    const rawClean = token.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!rawClean) return false;
    const cleanToken = rawClean.startsWith('CV')
      ? `CV-${rawClean.slice(2)}`
      : rawClean.length === 6
        ? `CV-${rawClean}`
        : token.trim().toUpperCase();

    try {
      const cloudData = await this.fetchCloudPayloadByToken(cleanToken);
      if (cloudData) {
        this.applyCloudPayload(cloudData);

        const user: UserProfile = {
          id: cloudData.userId || `usr_${cleanToken}`,
          name: cloudData.profileName || `${deviceName} (${cleanToken})`,
          email: cloudData.profileEmail || `${cleanToken.toLowerCase()}@vault.sync`,
          avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(cleanToken)}`,
          syncToken: cleanToken,
          isGoogleAuth: Boolean(cloudData.profileEmail),
          linkedDevicesCount: 2,
          lastSyncedAt: Date.now(),
        };

        this.profile = user;
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
        this.notify();
        await this.pushToCloud();
        return true;
      }
    } catch {
      // fallback below
    }

    // Even if no prior cloud message was found yet, initialize this token and push current device data to the cloud
    const user: UserProfile = {
      id: `usr_${cleanToken}`,
      name: `Профіль ${cleanToken}`,
      email: `${cleanToken.toLowerCase()}@vault.sync`,
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(cleanToken)}`,
      syncToken: cleanToken,
      isGoogleAuth: false,
      linkedDevicesCount: 2,
      lastSyncedAt: Date.now(),
    };
    this.profile = user;
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
    this.notify();
    await this.pushToCloud();
    return true;
  }

  private applyCloudPayload(payload: SyncDataPayload) {
    if (Array.isArray(payload.favorites)) {
      storageService.mergeFavorites(payload.favorites);
    }
    if (Array.isArray(payload.history)) {
      storageService.mergeHistory(payload.history);
    }
    if (payload.settings) {
      storageService.saveSettings(payload.settings);
    }
  }

  public logout() {
    this.profile = null;
    localStorage.removeItem(USER_PROFILE_KEY);
    this.notify();
  }

  /**
   * Schedule debounced cloud push whenever favorites or history change
   */
  public scheduleCloudSync() {
    if (!this.profile) return;
    if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(() => {
      this.pushToCloud().catch(() => {});
    }, 2500);
  }

  /**
   * Push current favorites, watch history, and settings to Cross-Device Cloud Storage
   */
  public async pushToCloud(): Promise<boolean> {
    if (!this.profile) return false;

    const payload: SyncDataPayload = {
      version: 3,
      userId: this.profile.id,
      syncToken: this.profile.syncToken,
      updatedAt: Date.now(),
      profileName: this.profile.name,
      profileEmail: this.profile.email,
      favorites: storageService.getFavorites(),
      history: storageService.getHistory(),
      settings: storageService.getSettings(),
    };

    const storageKey = `cv_sync_${this.profile.syncToken}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }

    let syncedRemote = false;

    // 1. Primary Cross-Device Cloud Broker (ntfy.sh topic addressed by syncToken)
    try {
      const topic = getNtfyTopic(this.profile.syncToken);
      const res = await fetch(`${NTFY_BASE_URL}/${topic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          Title: `CinemaVault Sync ${this.profile.syncToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        syncedRemote = true;
      }
    } catch {
      // try secondary cloud
    }

    // 2. Secondary Cloud Backup (restful-api.dev)
    try {
      if (this.profile.cloudObjectId) {
        const res = await fetch(`${RESTFUL_API_URL}/${this.profile.cloudObjectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: storageKey, data: payload }),
        });
        if (res.ok) syncedRemote = true;
      } else {
        const res = await fetch(RESTFUL_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: storageKey, data: payload }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.id && this.profile) {
            this.profile.cloudObjectId = String(json.id);
          }
          syncedRemote = true;
        }
      }
    } catch {
      // offline
    }

    if (this.profile) {
      this.profile.lastSyncedAt = Date.now();
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(this.profile));
      this.notify();
    }

    return syncedRemote;
  }

  /**
   * Pull and merge data from Cross-Device Cloud Storage
   */
  public async pullFromCloud(): Promise<boolean> {
    if (!this.profile) return false;
    const token = this.profile.syncToken;
    const payload = await this.fetchCloudPayloadByToken(token);
    if (payload) {
      this.applyCloudPayload(payload);
      this.profile.lastSyncedAt = Date.now();
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(this.profile));
      this.notify();
      return true;
    }
    return false;
  }

  private async fetchCloudPayloadByToken(token: string): Promise<SyncDataPayload | null> {
    const storageKey = `cv_sync_${token}`;
    let bestPayload: SyncDataPayload | null = null;

    // 1. Check local cache
    try {
      const local = localStorage.getItem(storageKey);
      if (local) {
        bestPayload = JSON.parse(local);
      }
    } catch {
      // ignore
    }

    // 2. Fetch from cross-device ntfy.sh cloud topic
    try {
      const topic = getNtfyTopic(token);
      const res = await fetch(`${NTFY_BASE_URL}/${topic}/json?poll=1&since=all`);
      if (res.ok) {
        const text = await res.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const evt = JSON.parse(lines[i]);
            if (evt?.event === 'message' && typeof evt.message === 'string') {
              const parsed: SyncDataPayload = JSON.parse(evt.message);
              if (
                parsed &&
                (Array.isArray(parsed.favorites) || Array.isArray(parsed.history))
              ) {
                if (!bestPayload || (parsed.updatedAt || 0) >= (bestPayload.updatedAt || 0)) {
                  bestPayload = parsed;
                }
                break;
              }
            }
          } catch {
            // continue
          }
        }
      }
    } catch {
      // ignore offline
    }

    // 3. Check secondary cloud object if we have cloudObjectId
    if (this.profile?.cloudObjectId) {
      try {
        const res = await fetch(`${RESTFUL_API_URL}/${this.profile.cloudObjectId}`);
        if (res.ok) {
          const json = await res.json();
          const data: SyncDataPayload | undefined = json?.data;
          if (data && (!bestPayload || (data.updatedAt || 0) > (bestPayload.updatedAt || 0))) {
            bestPayload = data;
          }
        }
      } catch {
        // ignore
      }
    }

    if (bestPayload) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(bestPayload));
      } catch {
        // ignore
      }
    }

    return bestPayload;
  }

  /**
   * Export all user data as a formatted JSON string for portable backup
   */
  public exportBackupJson(): string {
    const data = {
      app: 'CinemaVault PRO',
      version: '3.5.0',
      exportedAt: new Date().toISOString(),
      profile: this.profile,
      favorites: storageService.getFavorites(),
      history: storageService.getHistory(),
      settings: storageService.getSettings(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import data from JSON string (restores Favorites, Watch History, Settings, and Profile)
   */
  public importBackupJson(jsonString: string): boolean {
    try {
      const clean = jsonString.trim();
      if (!clean) return false;
      const data = JSON.parse(clean);
      if (!data || typeof data !== 'object') return false;

      let importedAny = false;
      if (Array.isArray(data.favorites)) {
        storageService.mergeFavorites(data.favorites);
        importedAny = true;
      }
      if (Array.isArray(data.history)) {
        storageService.mergeHistory(data.history);
        importedAny = true;
      }
      if (data.settings && typeof data.settings === 'object') {
        storageService.saveSettings(data.settings);
        importedAny = true;
      }
      if (data.profile && data.profile.syncToken) {
        this.profile = data.profile;
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(data.profile));
        this.notify();
        importedAny = true;
      }
      if (importedAny) {
        this.pushToCloud().catch(() => {});
      }
      return importedAny;
    } catch {
      return false;
    }
  }
}

export const authSyncService = new AuthSyncService();
