export type MediaType = 'movie' | 'tv' | 'anime' | 'cartoon';

export interface MediaItem {
  id: number | string;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  originalTitle?: string;
  aliases?: string[];
  overview: string;
  posterPath: string;
  backdropPath: string;
  releaseDate: string;
  year: number;
  rating: number;
  voteCount?: number;
  mediaType: MediaType;
  genres: string[];
  duration?: number; // in minutes
  quality?: '4K HDR' | '1080p Ultra' | '1080p' | '720p' | 'WEB-DL' | 'BDRip';
  hasUkrainianAudio?: boolean;
  seasonsCount?: number;
  episodesCount?: number;
  director?: string;
  cast?: string[];
  country?: string;
  streamUrl?: string;
  trailerYoutubeId?: string;
  externalUrl?: string;
}

export interface Season {
  seasonNumber: number;
  name: string;
  episodes: Episode[];
}

export interface Episode {
  id: number | string;
  episodeNumber: number;
  seasonNumber: number;
  title: string;
  overview?: string;
  stillPath?: string;
  airDate?: string;
  duration?: number;
  streamUrl?: string;
}

export interface AudioTrack {
  id: string | number;
  name: string;
  language: 'uk' | 'en' | 'pl' | 'es' | 'ru' | 'other';
  isDefault?: boolean;
}

export interface StreamQuality {
  label: '360p' | '480p' | '720p' | '1080p' | '1080p Ultra' | '4K';
  url: string;
  bitrate?: number;
  isEmbed?: boolean;
}

export interface StreamServer {
  id: string;
  name: string;
  badge: string;
  url: string;
  mode: 'embed' | 'native' | 'trailer' | 'torrent';
  langs?: string[];
  magnet?: string;
  infoHash?: string;
}

export interface MediaSource {
  id: string;
  provider: string;
  title: string;
  type: 'embed' | 'online' | 'trailer' | 'torrent';
  audioTracks: AudioTrack[];
  qualities: StreamQuality[];
  embedUrl?: string;
  servers?: StreamServer[];
  status: 'working' | 'slow' | 'checking' | 'failed';
  pingMs?: number;
  magnet?: string;
}

export interface TorrentItem {
  id: string;
  title: string;
  tracker: string;
  size: string;
  seeds: number;
  peers: number;
  magnet: string;
  quality: string;
  audio: string;
  dateAdded: string;
}

export interface PlaybackProgress {
  mediaId: string | number;
  episodeId?: string | number;
  seasonNumber?: number;
  episodeNumber?: number;
  currentTime: number;
  duration: number;
  percentage?: number;
  lastUpdated: number;
  title: string;
  posterPath: string;
  mediaSnapshot?: MediaItem;
}

export interface CatalogFilter {
  category: 'trending' | 'movies' | 'series' | 'cartoons' | 'anime' | '4k' | 'ukrainian';
  genre: string;
  year: string;
  sortBy: 'popularity' | 'rating' | 'year';
}
