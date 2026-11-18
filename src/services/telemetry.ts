import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { APP_VERSION } from './updater';

export interface DeviceTelemetryPayload {
  deviceId: string;
  platform: 'android' | 'windows' | 'macos' | 'web';
  osName: string; // e.g. "Android 14", "Windows 11", "Windows 10"
  osVersion: string; // e.g. "Android 14 (SDK 34)", "Windows 11 Pro (23H2, Build 22631)"
  osBuild?: string;
  deviceType: string; // e.g. "Смартфон", "Smart TV / Android TV", "Проєктор", "Планшет", "ПК / Ноутбук Windows"
  manufacturer: string; // e.g. "Samsung", "Xiaomi", "Sony", "Intel / AMD PC"
  model: string; // e.g. "SM-S928B", "Mi Box S", "Windows 11 PC (16 GB RAM)"
  arch: string; // e.g. "arm64-v8a", "x64"
  appVersion: string;
  lang: string;
  screen: string;
  isFirstInstall: boolean;
  installedAt: number;
  timestamp: number;
}

const DEVICE_UUID_KEY = 'cinemavault_device_uuid';
const INSTALLED_AT_KEY = 'cinemavault_installed_at_ts';
const LAST_TELEMETRY_PING_KEY = 'cinemavault_last_telemetry_ping_v373';
const TELEMETRY_API_URL = 'https://vinegret.net/wp-json/cinemavault/v1/telemetry';
const NTFY_TELEMETRY_URL = 'https://ntfy.sh/cinemavault_pro_telemetry_v373';

function getOrCreateDeviceId(): { deviceId: string; isFirstInstall: boolean; installedAt: number } {
  try {
    let deviceId = localStorage.getItem(DEVICE_UUID_KEY);
    let installedAtRaw = localStorage.getItem(INSTALLED_AT_KEY);
    let isFirstInstall = false;

    if (!deviceId) {
      isFirstInstall = true;
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        deviceId = crypto.randomUUID();
      } else {
        deviceId =
          'cv-' +
          Math.random().toString(36).substring(2, 12) +
          '-' +
          Date.now().toString(36);
      }
      localStorage.setItem(DEVICE_UUID_KEY, deviceId);
    }

    let installedAt = installedAtRaw ? parseInt(installedAtRaw, 10) : 0;
    if (!installedAt || isNaN(installedAt)) {
      installedAt = Date.now();
      localStorage.setItem(INSTALLED_AT_KEY, String(installedAt));
    }

    return { deviceId, isFirstInstall, installedAt };
  } catch {
    return {
      deviceId: 'cv-anon-' + Math.random().toString(36).substring(2, 10),
      isFirstInstall: false,
      installedAt: Date.now(),
    };
  }
}

function parseUserAgentFallback(): Omit<
  DeviceTelemetryPayload,
  'deviceId' | 'appVersion' | 'lang' | 'screen' | 'isFirstInstall' | 'installedAt' | 'timestamp'
> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';

  if (/android/i.test(ua)) {
    const verMatch = ua.match(/Android\s+([0-9.]+)/i);
    const ver = verMatch ? verMatch[1] : 'Unknown';
    const majorVer = ver.split('.')[0] || ver;
    const modelMatch = ua.match(/;\s*([^;)]+?)\s*(?:Build\/|;|\))/i);
    const rawModel = modelMatch ? modelMatch[1].trim() : 'Android Device';
    const isTv = /BRAVIA|AFT|Android TV|SmartTV|GoogleTV|MiBOX|Shield|TV/i.test(ua);
    const isProjector = /Projector|HY300|HY320|XGIMI|Wanbo|Dangbei|Formovie/i.test(ua);
    return {
      platform: 'android',
      osName: `Android ${majorVer}`,
      osVersion: `Android ${ver}`,
      deviceType: isProjector
        ? 'Проєктор'
        : isTv
          ? 'Smart TV / Android TV'
          : 'Смартфон / Планшет',
      manufacturer: rawModel.split(/\s+/)[0] || 'Android',
      model: rawModel,
      arch: /aarch64|arm64/i.test(ua) ? 'arm64-v8a' : 'armeabi-v7a',
    };
  }

  if (/Windows NT/i.test(ua)) {
    const ntMatch = ua.match(/Windows NT\s+([0-9.]+)/i);
    const ntVer = ntMatch ? ntMatch[1] : '10.0';
    let osName = 'Windows 10/11';
    if (ntVer === '6.3') osName = 'Windows 8.1';
    else if (ntVer === '6.2') osName = 'Windows 8';
    else if (ntVer === '6.1') osName = 'Windows 7';
    return {
      platform: 'windows',
      osName,
      osVersion: `${osName} (NT ${ntVer})`,
      deviceType: 'ПК / Ноутбук Windows',
      manufacturer: 'Windows PC',
      model: 'Desktop / Laptop PC',
      arch: /Win64|x64|WOW64/i.test(ua) ? 'x64' : 'x86',
    };
  }

  if (/Macintosh|Mac OS X/i.test(ua)) {
    return {
      platform: 'macos',
      osName: 'macOS',
      osVersion: 'macOS Desktop',
      deviceType: 'Mac / MacBook',
      manufacturer: 'Apple',
      model: 'Apple Mac',
      arch: 'arm64/x64',
    };
  }

  return {
    platform: 'web',
    osName: 'Web Browser',
    osVersion: ua.slice(0, 60),
    deviceType: 'Браузер',
    manufacturer: 'Web',
    model: 'Web Client',
    arch: 'unknown',
  };
}

export async function collectDeviceTelemetry(): Promise<DeviceTelemetryPayload> {
  const { deviceId, isFirstInstall, installedAt } = getOrCreateDeviceId();
  const screen =
    typeof window !== 'undefined' && window.screen
      ? `${window.screen.width}x${window.screen.height}`
      : '1920x1080';
  const lang =
    (typeof localStorage !== 'undefined' && localStorage.getItem('cinemavault_language')) ||
    (typeof navigator !== 'undefined' && navigator.language) ||
    'uk';

  let info = parseUserAgentFallback();

  // 1. Query Native Android / Electron Bridge if available
  try {
    const bridge = (window as any).AndroidCinemaBridge;
    if (bridge && typeof bridge.getDeviceTelemetryJson === 'function') {
      const rawJson = bridge.getDeviceTelemetryJson();
      if (rawJson && typeof rawJson === 'string') {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed === 'object') {
          info = {
            platform: parsed.platform || info.platform,
            osName: parsed.osName || info.osName,
            osVersion: parsed.osVersion || info.osVersion,
            osBuild: parsed.osBuild || undefined,
            deviceType: parsed.deviceType || info.deviceType,
            manufacturer: parsed.manufacturer || info.manufacturer,
            model: parsed.model || info.model,
            arch: parsed.arch || info.arch,
          };
        }
      }
    }
  } catch {
    // fallback to UA
  }

  // 2. Enhance Windows 10 vs Windows 11 detection via Navigator User-Agent Client Hints if on Web/Windows
  try {
    const uaData = (navigator as any)?.userAgentData;
    if (uaData && typeof uaData.getHighEntropyValues === 'function') {
      const high = await uaData.getHighEntropyValues([
        'platform',
        'platformVersion',
        'architecture',
        'model',
      ]);
      if (info.platform === 'windows' && high?.platformVersion) {
        const major = parseInt(String(high.platformVersion).split('.')[0], 10);
        if (!isNaN(major) && major > 0) {
          const winVer = major >= 13 ? 'Windows 11' : 'Windows 10';
          if (info.osName === 'Windows 10/11') {
            info.osName = winVer;
            info.osVersion = `${winVer} (ClientHint v${high.platformVersion})`;
          }
        }
      }
      if (high?.model && info.model === 'Android Device') {
        info.model = high.model;
      }
    }
  } catch {
    // ignore
  }

  return {
    deviceId,
    ...info,
    appVersion: APP_VERSION,
    lang: String(lang).slice(0, 10),
    screen,
    isFirstInstall,
    installedAt,
    timestamp: Date.now(),
  };
}

export async function reportDeviceTelemetry(force = false): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const now = Date.now();
    const lastPing = parseInt(localStorage.getItem(LAST_TELEMETRY_PING_KEY) || '0', 10);
    // Ping at most once every 4 hours per device unless forced or version changed
    const lastVer = localStorage.getItem('cinemavault_last_telemetry_ver');
    if (!force && lastVer === APP_VERSION && now - lastPing < 4 * 3600 * 1000) {
      return;
    }

    const payload = await collectDeviceTelemetry();

    let sent = false;

    // 1. Primary Telemetry Hub on vinegret.net
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.post({
          url: TELEMETRY_API_URL,
          headers: { 'Content-Type': 'application/json' },
          data: payload,
          connectTimeout: 6000,
          readTimeout: 6000,
        });
        if (res.status >= 200 && res.status < 300) sent = true;
      } else {
        const res = await fetch(TELEMETRY_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) sent = true;
      }
    } catch {
      // try secondary
    }

    // 2. Secondary Real-Time Cloud Broker (ntfy.sh) so zero device installs are ever lost
    try {
      await fetch(NTFY_TELEMETRY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          Title: `CinemaVault ${payload.platform.toUpperCase()} - ${payload.osName} (${payload.model})`,
        },
        body: JSON.stringify(payload),
      });
      sent = true;
    } catch {
      // offline
    }

    if (sent) {
      localStorage.setItem(LAST_TELEMETRY_PING_KEY, String(now));
      localStorage.setItem('cinemavault_last_telemetry_ver', APP_VERSION);
    }
  } catch {
    // never disrupt user experience
  }
}
