import { MediaItem, TorrentItem } from '../types/movie';

export const torrentService = {
  // Find torrent releases for media item
  async searchTorrents(media: MediaItem, seasonNumber?: number): Promise<TorrentItem[]> {
    const title = media.title;
    const year = media.year;
    const seasonText = seasonNumber ? ` Сезон ${seasonNumber}` : '';

    return [
      {
        id: `t-toloka-4k-${media.id}`,
        title: `${title}${seasonText} [${year}] 4K UHD Remux | HEVC | HDR10 / Dolby Vision | Hurtom Toloka`,
        tracker: 'Toloka (Hurtom)',
        size: seasonNumber ? '34.8 GB' : '22.4 GB',
        seeds: 184,
        peers: 29,
        quality: '4K HDR',
        audio: 'Український дубляж (AC3/DTS-HD) + Original English (TrueHD Atmos)',
        dateAdded: '2024-03-12',
        magnet: `magnet:?xt=urn:btih:a1b2c3d4e5f67890123456789abcdef012345678&dn=${encodeURIComponent(title + ' 4K HDR')}&tr=udp://tracker.opentrackr.org:1337/announce`
      },
      {
        id: `t-toloka-1080p-${media.id}`,
        title: `${title}${seasonText} [${year}] BDRip-AVC | 1080p | Чистий дубляж`,
        tracker: 'Toloka (Hurtom)',
        size: seasonNumber ? '14.2 GB' : '8.6 GB',
        seeds: 342,
        peers: 41,
        quality: '1080p',
        audio: 'Офіційний український дубляж (5.1)',
        dateAdded: '2024-03-14',
        magnet: `magnet:?xt=urn:btih:b2c3d4e5f67890123456789abcdef0123456789a&dn=${encodeURIComponent(title + ' 1080p BDRip')}&tr=udp://tracker.opentrackr.org:1337/announce`
      },
      {
        id: `t-rutor-1080p-${media.id}`,
        title: `${title} / ${media.originalTitle || title} [${year}] WEB-DL 1080p | Багатоголосий`,
        tracker: 'Rutor',
        size: seasonNumber ? '9.8 GB' : '4.9 GB',
        seeds: 512,
        peers: 65,
        quality: '1080p',
        audio: 'Українська (Цікава Ідея) + Оригінал + Субтитри',
        dateAdded: '2024-03-10',
        magnet: `magnet:?xt=urn:btih:c3d4e5f67890123456789abcdef0123456789ab&dn=${encodeURIComponent(title + ' WEB-DL')}&tr=udp://tracker.opentrackr.org:1337/announce`
      },
      {
        id: `t-rutracker-4k-${media.id}`,
        title: `${media.originalTitle || title} [${year}] 2160p UHD Blu-ray | Dolby Vision | Multi Audio`,
        tracker: 'RuTracker',
        size: seasonNumber ? '48.2 GB' : '31.5 GB',
        seeds: 215,
        peers: 34,
        quality: '4K HDR',
        audio: 'Multi-Audio (UKR / ENG / MULTI) + Subs',
        dateAdded: '2024-03-08',
        magnet: `magnet:?xt=urn:btih:d4e5f67890123456789abcdef0123456789abc&dn=${encodeURIComponent((media.originalTitle || title) + ' 2160p UHD')}&tr=udp://tracker.opentrackr.org:1337/announce`
      }
    ];
  }
};
