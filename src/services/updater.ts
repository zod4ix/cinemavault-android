import { httpGetJson } from './tmdb';

export const APP_VERSION = '3.5.0';
export const GITHUB_REPO = 'zod4ix/cinemavault-android';
export const DEFAULT_APK_URL = `https://github.com/${GITHUB_REPO}/raw/main/CinemaVault-PRO-v${APP_VERSION}.apk`;
export const GITHUB_RELEASE_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  apkDownloadUrl: string;
  releasePageUrl: string;
  releaseNotes: string;
  publishedAt: string;
  checkedAt: number;
}

const DISMISSED_VERSION_KEY = 'cinemavault_dismissed_update_version';

function parseSemver(v: string): number[] {
  const clean = (v || '').replace(/^v/i, '').trim();
  const parts = clean.split(/[.-]/).map((n) => parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function isNewerVersion(current: string, remote: string): boolean {
  const c = parseSemver(current);
  const r = parseSemver(remote);
  for (let i = 0; i < 3; i++) {
    if (r[i] > c[i]) return true;
    if (r[i] < c[i]) return false;
  }
  return false;
}

export function openExternalDownload(url: string) {
  try {
    const win = window as any;
    if (win.AndroidCinemaBridge?.openExternalUrl) {
      win.AndroidCinemaBridge.openExternalUrl(url);
      return;
    }
  } catch {
    // fallback
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export const updaterService = {
  getCurrentVersion(): string {
    return APP_VERSION;
  },

  isDismissed(version: string): boolean {
    try {
      return localStorage.getItem(DISMISSED_VERSION_KEY) === version;
    } catch {
      return false;
    }
  },

  dismissVersion(version: string) {
    try {
      localStorage.setItem(DISMISSED_VERSION_KEY, version);
    } catch {
      // ignore
    }
  },

  async checkForUpdates(): Promise<UpdateInfo> {
    let latestVersion = APP_VERSION;
    let apkDownloadUrl = DEFAULT_APK_URL;
    let releasePageUrl = GITHUB_RELEASE_PAGE;
    let releaseNotes =
      '• 🔴 СПОРТ LIVE HUB: прямі трансляції Ліги Чемпіонів, НБА, НФЛ, Боксу, Формули 1 та 24/7 телеканали (Суспільне Спорт, Setanta UA, MEGOGO, NBA TV, Sky F1)\n' +
      '• 🇺🇦 Декілька українських каналів озвучення + канали англійською, польською, іспанською та мультиязичні студії\n' +
      '• ⚡ Оновлений P2P Торрент-плеєр з інтеграцією Torrentio (4K HDR, UA, EN, PL, ES) без гальмувань\n' +
      '• ♾️ Нескінченна бібліотека контенту з автопідвантаженням новинок та золотої класики\n' +
      '• 🛡️ Система самовідновлення (Self-Healing), автооновлення з GitHub та покращена хмарна синхронізація';
    let publishedAt = new Date().toISOString().slice(0, 10);

    try {
      // 1. Check GitHub Releases API
      const rel = await httpGetJson(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        5500
      );
      if (rel && typeof rel.tag_name === 'string') {
        const tagVer = rel.tag_name.replace(/^v/i, '').trim();
        if (tagVer) {
          latestVersion = tagVer;
          apkDownloadUrl = `https://github.com/${GITHUB_REPO}/raw/main/CinemaVault-PRO-v${tagVer}.apk`;
        }
        if (rel.html_url) releasePageUrl = rel.html_url;
        if (rel.body && typeof rel.body === 'string' && rel.body.trim().length > 10) {
          releaseNotes = rel.body.trim();
        }
        if (rel.published_at) {
          publishedAt = String(rel.published_at).slice(0, 10);
        }
        // Check if release has an attached .apk asset
        if (Array.isArray(rel.assets)) {
          const apkAsset = rel.assets.find(
            (a: any) => typeof a?.browser_download_url === 'string' && a.browser_download_url.endsWith('.apk')
          );
          if (apkAsset) {
            apkDownloadUrl = apkAsset.browser_download_url;
          }
        }
      }

      // 2. Also check raw package.json on main branch (in case a new commit pushed a newer APK before creating a release tag)
      const pkg = await httpGetJson(
        `https://raw.githubusercontent.com/${GITHUB_REPO}/main/package.json`,
        5000
      );
      if (pkg && typeof pkg.version === 'string') {
        const pkgVer = pkg.version.replace(/^v/i, '').trim();
        if (isNewerVersion(latestVersion, pkgVer)) {
          latestVersion = pkgVer;
          apkDownloadUrl = `https://github.com/${GITHUB_REPO}/raw/main/CinemaVault-PRO-v${pkgVer}.apk`;
        }
      }
    } catch {
      // Keep default info when offline
    }

    const hasUpdate = isNewerVersion(APP_VERSION, latestVersion);
    if (!hasUpdate) {
      latestVersion = APP_VERSION;
      apkDownloadUrl = DEFAULT_APK_URL;
    }

    return {
      currentVersion: APP_VERSION,
      latestVersion,
      hasUpdate,
      apkDownloadUrl,
      releasePageUrl,
      releaseNotes,
      publishedAt,
      checkedAt: Date.now(),
    };
  },
};
