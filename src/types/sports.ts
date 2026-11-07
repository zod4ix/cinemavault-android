export type SportCategory =
  | 'all'
  | 'football'
  | 'ucl'
  | 'nba'
  | 'nfl'
  | 'boxing'
  | 'f1'
  | 'tennis'
  | 'nhl';

export interface SportStreamNode {
  id: string;
  slot?: 'A' | 'B' | 'C' | 'D' | 'E';
  name: string;
  badge: string;
  quality: '4K HDR' | '1080p FHD' | '1080p HD' | '720p HD' | '540p SD';
  mode: 'hls' | 'embed';
  url: string;
  channelName?: string;
  isFreeVerified?: boolean;
}

export interface SportTeamInfo {
  name: string;
  shortName: string;
  logo: string;
  score?: string | number;
}

export interface SportEvent {
  id: string;
  streamKey?: string;
  sport: SportCategory;
  league: string;
  leagueBadge: string;
  title: string;
  subtitle?: string;
  homeTeam?: SportTeamInfo;
  awayTeam?: SportTeamInfo;
  status: 'live' | 'upcoming' | 'finished';
  statusText: string;
  startTime: string;
  timestamp: number;
  venue?: string;
  viewers?: number;
  poster: string;
  isHot?: boolean;
  streams: SportStreamNode[];
}

export interface SportChannel {
  id: string;
  name: string;
  sport: SportCategory;
  icon: string;
  badge: string;
  logoText: string;
  accentColor: string;
  currentProgram: string;
  streams: SportStreamNode[];
}

export interface SportScannerStats {
  totalFreeStreams: number;
  liveMatchesCount: number;
  streamFreeNodes: number;
  directHlsNodes: number;
  replayNodes: number;
  lastScanTime: string;
}
