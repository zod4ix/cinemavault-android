import { MediaItem, PlaybackProgress } from '../types/movie';
import { storageService, UserSettings } from './storage';
import { collectDeviceTelemetry } from './telemetry';

export interface ConnectedDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: 'android' | 'windows' | 'macos' | 'web';
  osName: string;
  appVersion: string;
  lastActiveAt: number;
  isOnline?: boolean;
  currentMediaTitle?: string;
}

export interface ActiveSessionState {
  deviceId: string;
  deviceName: string;
  mediaId: string | number;
  mediaSnapshot?: MediaItem;
  title: string;
  posterPath: string;
  serverId?: string;
  serverName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeId?: string | number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isCompleted?: boolean;
  updatedAt: number;
}

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
  eventId?: string;
  senderDeviceId?: string;
  userId: string;
  syncToken: string;
  updatedAt: number;
  profileName?: string;
  profileEmail?: string;
  favorites: MediaItem[];
  deletedFavoriteIds?: string[];
  history: PlaybackProgress[];
  settings?: UserSettings;
  activeSession?: ActiveSessionState | null;
  devices?: ConnectedDevice[];
  revokedDeviceIds?: string[];
}

export interface RealtimeActionMessage {
  type: 'STATE_SYNC' | 'PLAYBACK_ACTION' | 'DEVICE_REVOKE' | 'DEVICE_PING';
  eventId: string;
  senderDeviceId: string;
  senderDeviceName: string;
  syncToken: string;
  timestamp: number;
  action?: 'open' | 'play' | 'pause' | 'seek' | 'episode_change' | 'server_change' | 'favorite_toggle' | 'settings_change' | 'completed';
  session?: ActiveSessionState;
  payload?: SyncDataPayload;
  targetDeviceId?: string;
}

const USER_PROFILE_KEY = 'cinemavault_user_profile_v2';
const ACTIVE_SESSION_KEY = 'cinemavault_active_session_v374';
const CONNECTED_DEVICES_KEY = 'cinemavault_connected_devices_v374';
const REVOKED_DEVICES_KEY = 'cinemavault_revoked_devices_v374';
const NTFY_BASE_URL = 'https://ntfy.sh';
const RESTFUL_API_URL = 'https://api.restful-api.dev/objects';

/**
 * Generates a deterministic 6-character code (CV-XXXXXX) from an email + optional PIN,
 * so logging in with the same email on a phone, tablet, projector, PC, Mac, or Smart TV
 * automatically links to the exact same real-time cloud ecosystem!
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
  private actionDebounceTimer: any = null;
  private listeners: Array<(profile: UserProfile | null) => void> = [];
  private dataChangeListeners: Array<(payload?: SyncDataPayload) => void> = [];
  private remoteActionListeners: Array<(msg: RealtimeActionMessage) => void> = [];

  private currentDevice: ConnectedDevice | null = null;
  private connectedDevices: ConnectedDevice[] = [];
  private revokedDeviceIds: Set<string> = new Set();
  private activeSession: ActiveSessionState | null = null;

  private processedEventIds: Set<string> = new Set();
  private isApplyingRemote = false;
  private eventSource: EventSource | null = null;
  private reconnectTimer: any = null;
  private heartbeatInterval: any = null;
  private offlineQueuePending = false;

  constructor() {
    this.loadProfile();
    this.loadLocalEcosystemState();
    this.initRealtimeLifecycle();
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

  private loadLocalEcosystemState() {
    try {
      const devRaw = localStorage.getItem(CONNECTED_DEVICES_KEY);
      if (devRaw) {
        const parsed = JSON.parse(devRaw);
        if (Array.isArray(parsed)) this.connectedDevices = parsed;
      }
    } catch {}
    try {
      const revRaw = localStorage.getItem(REVOKED_DEVICES_KEY);
      if (revRaw) {
        const parsed = JSON.parse(revRaw);
        if (Array.isArray(parsed)) this.revokedDeviceIds = new Set(parsed);
      }
    } catch {}
    try {
      const sesRaw = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (sesRaw) {
        this.activeSession = JSON.parse(sesRaw);
      }
    } catch {}
  }

  private initRealtimeLifecycle() {
    if (typeof window === 'undefined') return;

    collectDeviceTelemetry()
      .then((t) => {
        this.currentDevice = {
          deviceId: t.deviceId,
          deviceName: `${t.model} (${t.osName})`,
          deviceType: t.deviceType,
          platform: t.platform,
          osName: t.osName,
          appVersion: t.appVersion,
          lastActiveAt: Date.now(),
          isOnline: true,
        };
        this.registerOrUpdateDevice(this.currentDevice);
        if (this.profile) {
          this.startRealtimeStream();
          this.pullFromCloud().catch(() => {});
        }
      })
      .catch(() => {});

    window.addEventListener('online', () => {
      if (this.profile) {
        this.startRealtimeStream();
        if (this.offlineQueuePending) {
          this.offlineQueuePending = false;
          this.pushToCloud().catch(() => {});
        } else {
          this.pullFromCloud().catch(() => {});
        }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.profile) {
        this.touchCurrentDevice();
        this.startRealtimeStream();
        this.pullFromCloud().catch(() => {});
      }
    });

    // Cross-tab instant synchronization via StorageEvent
    window.addEventListener('storage', (e) => {
      if (!e.key) return;
      if (
        e.key.includes('cinemavault_favorites') ||
        e.key.includes('cinemavault_history') ||
        e.key.includes('cinemavault_settings') ||
        e.key === ACTIVE_SESSION_KEY ||
        e.key === CONNECTED_DEVICES_KEY
      ) {
        this.loadLocalEcosystemState();
        this.notifyDataChanged();
      }
    });
  }

  private touchCurrentDevice(mediaTitle?: string) {
    if (!this.currentDevice) return;
    this.currentDevice.lastActiveAt = Date.now();
    this.currentDevice.isOnline = true;
    if (mediaTitle !== undefined) {
      this.currentDevice.currentMediaTitle = mediaTitle;
    }
    this.registerOrUpdateDevice(this.currentDevice);
  }

  private registerOrUpdateDevice(dev: ConnectedDevice) {
    if (!dev || !dev.deviceId) return;
    if (this.revokedDeviceIds.has(dev.deviceId) && dev.deviceId !== this.currentDevice?.deviceId) {
      return;
    }
    const idx = this.connectedDevices.findIndex((d) => d.deviceId === dev.deviceId);
    if (idx >= 0) {
      const existing = this.connectedDevices[idx];
      if ((dev.lastActiveAt || 0) >= (existing.lastActiveAt || 0)) {
        this.connectedDevices[idx] = { ...existing, ...dev };
      }
    } else {
      this.connectedDevices.unshift(dev);
    }
    this.connectedDevices = this.connectedDevices
      .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0))
      .slice(0, 12);

    try {
      localStorage.setItem(CONNECTED_DEVICES_KEY, JSON.stringify(this.connectedDevices));
    } catch {}

    if (this.profile) {
      this.profile.linkedDevicesCount = Math.max(1, this.connectedDevices.length);
    }
  }

  public getCurrentDeviceId(): string {
    return this.currentDevice?.deviceId || localStorage.getItem('cinemavault_device_uuid') || 'cv-local';
  }

  public getCurrentDevice(): ConnectedDevice | null {
    return this.currentDevice;
  }

  public getConnectedDevices(): ConnectedDevice[] {
    const now = Date.now();
    return this.connectedDevices
      .filter((d) => !this.revokedDeviceIds.has(d.deviceId))
      .map((d) => ({
        ...d,
        isOnline:
          d.deviceId === this.getCurrentDeviceId() || now - (d.lastActiveAt || 0) < 5 * 60 * 1000,
      }));
  }

  public getActiveSession(): ActiveSessionState | null {
    return this.activeSession;
  }

  public async disconnectDevice(targetDeviceId: string): Promise<void> {
    if (!targetDeviceId) return;
    const myId = this.getCurrentDeviceId();
    if (targetDeviceId === myId) {
      this.logout();
      return;
    }

    this.revokedDeviceIds.add(targetDeviceId);
    this.connectedDevices = this.connectedDevices.filter((d) => d.deviceId !== targetDeviceId);
    try {
      localStorage.setItem(CONNECTED_DEVICES_KEY, JSON.stringify(this.connectedDevices));
      localStorage.setItem(
        REVOKED_DEVICES_KEY,
        JSON.stringify(Array.from(this.revokedDeviceIds))
      );
    } catch {}

    this.notify();
    this.notifyDataChanged();
    await this.pushToCloud();
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

  public subscribeDataChanges(listener: (payload?: SyncDataPayload) => void): () => void {
    this.dataChangeListeners.push(listener);
    return () => {
      this.dataChangeListeners = this.dataChangeListeners.filter((l) => l !== listener);
    };
  }

  public subscribeRemoteActions(listener: (msg: RealtimeActionMessage) => void): () => void {
    this.remoteActionListeners.push(listener);
    return () => {
      this.remoteActionListeners = this.remoteActionListeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.profile));
  }

  private notifyDataChanged(payload?: SyncDataPayload) {
    this.dataChangeListeners.forEach((l) => l(payload));
  }

  private notifyRemoteAction(msg: RealtimeActionMessage) {
    this.remoteActionListeners.forEach((l) => l(msg));
  }

  private generateEventId(): string {
    return `${this.getCurrentDeviceId()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
   * Starts real-time SSE listener on the account's ntfy topic + periodic fallback heartbeat
   * so all connected devices receive actions & state updates in < 1 second!
   */
  public startRealtimeStream() {
    if (typeof window === 'undefined' || !this.profile) return;

    this.stopRealtimeStream();
    const topic = getNtfyTopic(this.profile.syncToken);

    try {
      if (typeof EventSource !== 'undefined') {
        const es = new EventSource(`${NTFY_BASE_URL}/${topic}/sse`);
        this.eventSource = es;

        es.onmessage = (ev) => {
          try {
            const wrapper = JSON.parse(ev.data);
            const rawMsg =
              wrapper && typeof wrapper.message === 'string' ? wrapper.message : ev.data;
            this.handleIncomingRawMessage(rawMsg);
          } catch {
            // ignore malformed
          }
        };

        es.onerror = () => {
          try {
            es.close();
          } catch {}
          this.eventSource = null;
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (this.profile && navigator.onLine !== false) {
              this.startRealtimeStream();
            }
          }, 8000);
        };
      }
    } catch {
      // Fallback to polling heartbeat below
    }

    // Periodic heartbeat (every 45s) ensures sync resilience even behind strict firewalls
    this.heartbeatInterval = setInterval(() => {
      if (this.profile && document.visibilityState === 'visible') {
        this.touchCurrentDevice();
        this.pullFromCloud().catch(() => {});
      }
    }, 45000);
  }

  public stopRealtimeStream() {
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleIncomingRawMessage(rawJson: string) {
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== 'object') return;

      const eventId = parsed.eventId;
      if (eventId) {
        if (this.processedEventIds.has(eventId)) return;
        this.processedEventIds.add(eventId);
        if (this.processedEventIds.size > 400) {
          const first = this.processedEventIds.values().next().value;
          if (first) this.processedEventIds.delete(first);
        }
      }

      const myDeviceId = this.getCurrentDeviceId();
      if (parsed.senderDeviceId && parsed.senderDeviceId === myDeviceId) {
        return; // Echo protection: ignore our own outbound broadcast
      }

      if (parsed.type === 'PLAYBACK_ACTION' && parsed.session) {
        const actionMsg = parsed as RealtimeActionMessage;
        if (
          !this.activeSession ||
          (actionMsg.session?.updatedAt || 0) >= (this.activeSession.updatedAt || 0)
        ) {
          this.activeSession = actionMsg.session || null;
          try {
            localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(this.activeSession));
          } catch {}
        }
        if (actionMsg.session) {
          this.isApplyingRemote = true;
          try {
            storageService.mergeHistory([
              {
                mediaId: actionMsg.session.mediaId,
                mediaSnapshot: actionMsg.session.mediaSnapshot,
                title: actionMsg.session.title,
                posterPath: actionMsg.session.posterPath,
                currentTime: actionMsg.session.currentTime,
                duration: actionMsg.session.duration,
                lastUpdated: actionMsg.session.updatedAt,
                episodeId: actionMsg.session.episodeId,
                seasonNumber: actionMsg.session.seasonNumber,
                episodeNumber: actionMsg.session.episodeNumber,
                serverId: actionMsg.session.serverId,
                isPlaying: actionMsg.session.isPlaying,
                isCompleted: actionMsg.session.isCompleted,
              },
            ]);
          } finally {
            this.isApplyingRemote = false;
          }
        }
        this.notifyDataChanged();
        this.notifyRemoteAction(actionMsg);
        return;
      }

      // Full SyncDataPayload
      if (Array.isArray(parsed.favorites) || Array.isArray(parsed.history)) {
        this.applyCloudPayload(parsed as SyncDataPayload);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Broadcasts an immediate user playback action (open movie, play, pause, seek, episode/server change)
   * to all other connected devices in the ecosystem.
   */
  public broadcastPlaybackAction(
    action: NonNullable<RealtimeActionMessage['action']>,
    sessionState: Omit<ActiveSessionState, 'deviceId' | 'deviceName' | 'updatedAt'>
  ) {
    const myId = this.getCurrentDeviceId();
    const myName = this.currentDevice?.deviceName || 'Цей пристрій';

    const fullSession: ActiveSessionState = {
      ...sessionState,
      deviceId: myId,
      deviceName: myName,
      updatedAt: Date.now(),
    };

    this.activeSession = fullSession;
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(fullSession));
    } catch {}
    this.touchCurrentDevice(fullSession.title);

    if (!this.profile) return;

    // Throttle high-frequency seek/play actions to at most 1 per 1200ms while keeping state accurate
    if (this.actionDebounceTimer) clearTimeout(this.actionDebounceTimer);
    this.actionDebounceTimer = setTimeout(() => {
      if (!this.profile) return;
      const eventId = this.generateEventId();
      this.processedEventIds.add(eventId);

      const msg: RealtimeActionMessage = {
        type: 'PLAYBACK_ACTION',
        eventId,
        senderDeviceId: myId,
        senderDeviceName: myName,
        syncToken: this.profile.syncToken,
        timestamp: Date.now(),
        action,
        session: fullSession,
      };

      const topic = getNtfyTopic(this.profile.syncToken);
      fetch(`${NTFY_BASE_URL}/${topic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          Title: `CinemaVault Action ${action} (${this.profile.syncToken})`,
        },
        body: JSON.stringify(msg),
      }).catch(() => {
        this.offlineQueuePending = true;
      });

      this.scheduleCloudSync();
    }, action === 'open' || action === 'pause' || action === 'episode_change' ? 250 : 1200);
  }

  /**
   * One-click Google or Email + optional PIN authorization.
   * Uses a deterministic syncToken so signing in with the same email on multiple devices
   * automatically merges Favorites, Watch History, Active Session, Devices, and Settings!
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

    this.revokedDeviceIds.delete(this.getCurrentDeviceId());
    this.touchCurrentDevice();

    const user: UserProfile = {
      id: profileId,
      name: displayName,
      email: cleanEmail,
      avatar:
        avatar ||
        `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanEmail)}`,
      syncToken,
      isGoogleAuth: true,
      linkedDevicesCount: Math.max(1, this.getConnectedDevices().length),
      lastSyncedAt: Date.now(),
    };

    this.profile = user;
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
    this.notify();

    this.startRealtimeStream();
    await this.pullFromCloud();
    await this.pushToCloud();

    return user;
  }

  /**
   * Link an additional device (e.g. Smart TV, Projector, Tablet, PC, Mac) via 6-character Sync Code (CV-XXXXXX)
   */
  public async linkDeviceWithSyncToken(
    token: string,
    deviceName = 'Мій Пристрій'
  ): Promise<boolean> {
    let extracted = token.trim();
    if (extracted.includes('token=')) {
      extracted = extracted.split('token=')[1].split('&')[0];
    } else if (extracted.includes('/')) {
      extracted = extracted.split('/').pop() || extracted;
      extracted = extracted.replace('cinemavault_vault_sync_', '');
    }
    const rawClean = extracted.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!rawClean) return false;
    const cleanToken = rawClean.startsWith('CV')
      ? `CV-${rawClean.slice(2, 8)}`
      : rawClean.length === 6
        ? `CV-${rawClean}`
        : `CV-${rawClean.slice(0, 6)}`;

    this.revokedDeviceIds.delete(this.getCurrentDeviceId());
    this.touchCurrentDevice();

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
          linkedDevicesCount: Math.max(1, this.getConnectedDevices().length),
          lastSyncedAt: Date.now(),
        };

        this.profile = user;
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
        this.notify();
        this.startRealtimeStream();
        await this.pushToCloud();
        return true;
      }
    } catch {
      // fallback below
    }

    const user: UserProfile = {
      id: `usr_${cleanToken}`,
      name: `Профіль ${cleanToken}`,
      email: `${cleanToken.toLowerCase()}@vault.sync`,
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(cleanToken)}`,
      syncToken: cleanToken,
      isGoogleAuth: false,
      linkedDevicesCount: Math.max(1, this.getConnectedDevices().length),
      lastSyncedAt: Date.now(),
    };
    this.profile = user;
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
    this.notify();
    this.startRealtimeStream();
    await this.pushToCloud();
    return true;
  }

  private applyCloudPayload(payload: SyncDataPayload) {
    if (!payload) return;

    // Check if our device was explicitly revoked by another device in this account
    const myId = this.getCurrentDeviceId();
    if (
      Array.isArray(payload.revokedDeviceIds) &&
      payload.revokedDeviceIds.includes(myId) &&
      payload.senderDeviceId !== myId
    ) {
      this.logout();
      return;
    }

    this.isApplyingRemote = true;
    try {
      if (Array.isArray(payload.revokedDeviceIds)) {
        payload.revokedDeviceIds.forEach((id) => this.revokedDeviceIds.add(id));
        try {
          localStorage.setItem(
            REVOKED_DEVICES_KEY,
            JSON.stringify(Array.from(this.revokedDeviceIds))
          );
        } catch {}
      }

      if (Array.isArray(payload.devices)) {
        payload.devices.forEach((d) => this.registerOrUpdateDevice(d));
      }

      if (Array.isArray(payload.favorites)) {
        storageService.mergeFavorites(payload.favorites, payload.deletedFavoriteIds);
      }

      if (Array.isArray(payload.history)) {
        storageService.mergeHistory(payload.history);
      }

      if (payload.settings) {
        storageService.saveSettings(payload.settings, true);
      }

      if (payload.activeSession) {
        if (
          !this.activeSession ||
          (payload.activeSession.updatedAt || 0) >= (this.activeSession.updatedAt || 0)
        ) {
          this.activeSession = payload.activeSession;
          try {
            localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(this.activeSession));
          } catch {}
        }
      }
    } finally {
      this.isApplyingRemote = false;
    }

    this.notifyDataChanged(payload);
  }

  public logout() {
    this.stopRealtimeStream();
    this.profile = null;
    localStorage.removeItem(USER_PROFILE_KEY);
    this.notify();
  }

  /**
   * Schedule debounced cloud push whenever favorites, history, or settings change locally
   */
  public scheduleCloudSync() {
    if (!this.profile || this.isApplyingRemote) return;
    if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(() => {
      this.pushToCloud().catch(() => {
        this.offlineQueuePending = true;
      });
    }, 1600);
  }

  /**
   * Push current favorites, watch history, active session, connected devices, and settings to Cross-Device Cloud Storage
   */
  public async pushToCloud(): Promise<boolean> {
    if (!this.profile) return false;

    this.touchCurrentDevice();
    const eventId = this.generateEventId();
    this.processedEventIds.add(eventId);

    const payload: SyncDataPayload = {
      version: 4,
      eventId,
      senderDeviceId: this.getCurrentDeviceId(),
      userId: this.profile.id,
      syncToken: this.profile.syncToken,
      updatedAt: Date.now(),
      profileName: this.profile.name,
      profileEmail: this.profile.email,
      favorites: storageService.getFavorites(),
      deletedFavoriteIds: storageService.getDeletedFavoriteIds(),
      history: storageService.getHistory(),
      settings: storageService.getSettings(),
      activeSession: this.activeSession,
      devices: this.getConnectedDevices(),
      revokedDeviceIds: Array.from(this.revokedDeviceIds),
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

    if (!syncedRemote) {
      this.offlineQueuePending = true;
    }

    if (this.profile) {
      this.profile.lastSyncedAt = Date.now();
      this.profile.linkedDevicesCount = Math.max(1, this.getConnectedDevices().length);
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
      if (this.profile) {
        this.profile.lastSyncedAt = Date.now();
        this.profile.linkedDevicesCount = Math.max(1, this.getConnectedDevices().length);
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(this.profile));
        this.notify();
      }
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
        let latestActionSession: ActiveSessionState | null = null;

        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const evt = JSON.parse(lines[i]);
            if (evt?.event === 'message' && typeof evt.message === 'string') {
              const parsed = JSON.parse(evt.message);
              if (parsed?.type === 'PLAYBACK_ACTION' && parsed.session && !latestActionSession) {
                latestActionSession = parsed.session;
              }
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

        if (bestPayload && latestActionSession) {
          if (
            !bestPayload.activeSession ||
            (latestActionSession.updatedAt || 0) > (bestPayload.activeSession.updatedAt || 0)
          ) {
            bestPayload.activeSession = latestActionSession;
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
      version: '3.7.4',
      exportedAt: new Date().toISOString(),
      profile: this.profile,
      favorites: storageService.getFavorites(),
      deletedFavoriteIds: storageService.getDeletedFavoriteIds(),
      history: storageService.getHistory(),
      settings: storageService.getSettings(),
      activeSession: this.activeSession,
      devices: this.getConnectedDevices(),
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
        storageService.mergeFavorites(data.favorites, data.deletedFavoriteIds);
        importedAny = true;
      }
      if (Array.isArray(data.history)) {
        storageService.mergeHistory(data.history);
        importedAny = true;
      }
      if (data.settings && typeof data.settings === 'object') {
        storageService.saveSettings(data.settings, true);
        importedAny = true;
      }
      if (data.profile && data.profile.syncToken) {
        this.profile = data.profile;
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(data.profile));
        this.notify();
        this.startRealtimeStream();
        importedAny = true;
      }
      if (importedAny) {
        this.notifyDataChanged();
        this.pushToCloud().catch(() => {});
      }
      return importedAny;
    } catch {
      return false;
    }
  }
}

export const authSyncService = new AuthSyncService();
