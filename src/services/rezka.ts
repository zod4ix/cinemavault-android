import { MediaItem, MediaSource, StreamServer } from '../types/movie';
import {
  buildServers,
  ensureIds,
  orderByHealth,
  probeServers,
  resolveUaServer,
  ServerHealth,
} from './servers';

/** Kept for backwards compatibility with components that build servers synchronously. */
export function buildServersForMedia(
  media: MediaItem,
  seasonNumber: number = 1,
  episodeNumber: number = 1
): StreamServer[] {
  return buildServers(media, seasonNumber, episodeNumber);
}

const BEST_KEY = 'cinemavault_best_server_v372';

export function rememberWorkingServer(id: string) {
  try {
    if (!id) return;
    localStorage.setItem(BEST_KEY, id);
  } catch {
    // ignore
  }
}

export function preferredServerId(): string | null {
  try {
    return localStorage.getItem(BEST_KEY);
  } catch {
    return null;
  }
}

const toSource = (
  media: MediaItem,
  srv: StreamServer,
  servers: StreamServer[],
  s: number,
  e: number,
  health: ServerHealth | undefined
): MediaSource => ({
  id: `${srv.id}-${media.id}-s${s}e${e}`,
  provider: srv.name,
  title: srv.name,
  type: srv.mode === 'trailer' ? 'trailer' : srv.mode === 'native' ? 'online' : 'embed',
  status:
    health === 'ok' ? 'working' : health === 'dead' ? 'failed' : health === 'checking' ? 'checking' : 'slow',
  embedUrl: srv.url,
  servers,
  audioTracks: [],
  qualities: srv.mode === 'embed' ? [{ label: '1080p', url: srv.url, isEmbed: true }] : [],
});

export const rezkaService = {
  /**
   * Synchronously builds available sources from cached IDs so playback & modals open in 0ms.
   * HDRezka #1 is always placed first.
   */
  buildSourcesSync(
    media: MediaItem,
    seasonNumber?: number,
    episodeNumber?: number
  ): MediaSource[] {
    const s = seasonNumber || 1;
    const e = episodeNumber || 1;
    const servers = buildServers(media, s, e);
    return servers.map((srv) => toSource(media, srv, servers, s, e, 'checking'));
  },

  /**
   * Resolves ids, looks for a Ukrainian dub, builds every server and returns them as sources.
   * HDRezka (#1) always stays first unless dead, followed by Ukrainian & hierarchy servers.
   */
  async resolveSources(
    media: MediaItem,
    seasonNumber?: number,
    episodeNumber?: number,
    options: { withHealth?: boolean; onHealth?: (id: string, h: ServerHealth) => void } = {}
  ): Promise<MediaSource[]> {
    const s = seasonNumber || 1;
    const e = episodeNumber || 1;

    await Promise.race([
      ensureIds(media).then(() => resolveUaServer(media, s)),
      new Promise((r) => setTimeout(() => r(null), 3800)),
    ]);

    let servers = buildServers(media, s, e);
    let healthMap = new Map<string, ServerHealth>();

    if (options.withHealth) {
      healthMap = await probeServers(servers, (srv, h) => options.onHealth?.(srv.id, h));
      servers = orderByHealth(servers, healthMap);
    }

    return servers.map((srv) => toSource(media, srv, servers, s, e, healthMap.get(srv.id)));
  },
};
