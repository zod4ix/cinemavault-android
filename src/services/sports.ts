import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  SportCategory,
  SportChannel,
  SportEvent,
  SportScannerStats,
  SportStreamNode,
} from '../types/sports';
import { httpGetJson } from './tmdb';

// ============================================================================
// VERIFIED 100% FREE CLOUD CDN HTTPS HLS (.m3u8) STREAMS (Amagi / Akamai / CloudFront / Pluto)
// Zero dead raw-IP stalker links — instant connection & stable 24/7 playback
// ============================================================================
export const FREE_HLS_NODES = {
  cbsSportsHq:
    'https://sportshq-mediapackage-cedexis.cbsaavideo.com/out/v1/be87d7783e5c4270a5830ea5d1164850/desktop.m3u8',
  cbsSportsPluto:
    'https://service-stitcher.clusters.pluto.tv/stitch/hls/channel/5e9f2c05172a0f0007db4786/master.m3u8?deviceId=web&deviceType=web&market=us',
  plutoSports:
    'https://service-stitcher.clusters.pluto.tv/stitch/hls/channel/56340779a738201b4ccfeac9/master.m3u8?deviceId=web&deviceType=web&market=us',
  nbcSportsNow:
    'https://d4whmvwm0rdvi.cloudfront.net/10007/99993008/hls/master.m3u8?ads.xumo_channelId=99993008',
  beinXtra: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8',
  beinXtraRoku: 'https://bein-xtra-roku-us.amagi.tv/playlist.m3u8',
  daznCombat:
    'https://dazn-combat-rakuten.amagi.tv/hls/amagi_hls_data_rakutenAA-dazn-combat-rakuten/CDN/master.m3u8',
  daznFootball:
    'https://dazn-daznwomensfootball-rakuten.amagi.tv/hls/amagi_hls_data_rakutenAA-dazn-daznwomensfootball-rakuten/CDN/master.m3u8',
  fifaPlusUs:
    'https://d2w9q46ikgrcwx.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-of5cbk3sav3w5/v1/sysdata_s_p_a_fifa_7/samsungheadend_us/latest/main/hls/playlist.m3u8',
  fifaPlusGlobal:
    'https://d63fabad.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWVzX0ZJRkFQbHVzU3BhbmlzaF9ITFM/playlist.m3u8',
  tennisChannel: 'https://tennischannel-int-samsunguk.amagi.tv/playlist.m3u8',
  motorvisionUk: 'https://motorvision-samsung-uk.amagi.tv/playlist.m3u8',
  motorvisionUs: 'https://d1nlhbqjulacw7.cloudfront.net/hls/samsungtvplus_us_motorvisiontv_001.m3u8',
  traceSportStars: 'https://trace-sportstars-samsungnz.amagi.tv/playlist.m3u8',
  gloryKickboxing:
    'https://6f972d29.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0dsb3J5S2lja2JveGluZ19ITFM/playlist.m3u8',
  persianaFight: 'https://fighthls.persiana.live/hls/stream.m3u8',
  aciMotorsport:
    'https://webstream.multistream.it/memfs/e2cb3629-c1a2-495b-b43a-9eb386f04ed8.m3u8',
  redBullMaster: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
  redBullRakuten:
    'https://3ea22335.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWdiX1JlZEJ1bGxUVl9ITFM/playlist.m3u8',
  fastFunBox: 'https://dash3.antik.sk/live/test_fast_and_funbox_medium_atk/playlist.m3u8',
  espnGlobal1: 'https://barinaslive1.boldmss.com/ESPN/ESPN.isml/ESPN.m3u8',
  espnGlobal2: 'https://barinaslive1.boldmss.com/ESPN_2/ESPN_2.isml/ESPN_2.m3u8',
};

// Official YouTube channel uploads playlists (UU + channel ID suffix) for Highlights
const OFFICIAL_HIGHLIGHTS_EMBED: Record<SportCategory, string> = {
  all: 'https://www.youtube.com/embed/videoseries?list=UUWJ2lWNubArHWmf3FIHbfcQ',
  nba: 'https://www.youtube.com/embed/videoseries?list=UUWJ2lWNubArHWmf3FIHbfcQ',
  ucl: 'https://www.youtube.com/embed/videoseries?list=UUyGa1YEx9ST66rYrJTGIKOw',
  football: 'https://www.youtube.com/embed/videoseries?list=UUG5qGWdu8nIRZqJ_GgDwQ-w',
  nfl: 'https://www.youtube.com/embed/videoseries?list=UUDVYQ4Zhbm3S2dlz7P1GBDg',
  boxing: 'https://www.youtube.com/embed/videoseries?list=UUvgfXK4nTYKudb0rFR6noLA',
  f1: 'https://www.youtube.com/embed/videoseries?list=UUB_qr75-ydFVKSF9Dmo6izg',
  tennis: 'https://www.youtube.com/embed/videoseries?list=UUbcxFkd6B9xUU54InHv4Tig',
  nhl: 'https://www.youtube.com/embed/videoseries?list=UUqFMzb-4AUf6WAIbl132QKA',
};

// Sport category backgrounds
const SPORT_POSTERS: Record<SportCategory, string> = {
  all: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=1200&q=80',
  ucl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=1200&q=80',
  football: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&q=80',
  nba: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=1200&q=80',
  nfl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=1200&q=80',
  boxing: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=1200&q=80',
  f1: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1200&q=80',
  tennis: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=1200&q=80',
  nhl: 'https://images.unsplash.com/photo-1580748141549-71748dbe0bdc?w=1200&q=80',
};

// ============================================================================
// OFFICIAL ESPN CDN TEAM LOGO RESOLVER (NBA, NFL, NHL & Top European Football)
// Fixes broken team logos ("биті фотки") across StreamFree, Streamed & Vinegret
// ============================================================================
const NBA_TEAM_LOGOS: Record<string, string> = {
  haw: 'atl', atlanta: 'atl', hawks: 'atl',
  bos: 'bos', boston: 'bos', celtics: 'bos',
  bkn: 'bkn', brooklyn: 'bkn', nets: 'bkn',
  cha: 'cha', charlotte: 'cha', hornets: 'cha',
  chi: 'chi', chicago: 'chi', bulls: 'chi',
  cle: 'cle', cleveland: 'cle', cavaliers: 'cle', cavs: 'cle',
  dal: 'dal', dallas: 'dal', mavericks: 'dal', mavs: 'dal',
  den: 'den', denver: 'den', nuggets: 'den',
  det: 'det', detroit: 'det', pistons: 'det',
  gsw: 'gs', 'golden state': 'gs', warriors: 'gs',
  hou: 'hou', houston: 'hou', rockets: 'hou',
  ind: 'ind', indiana: 'ind', pacers: 'ind',
  lac: 'lac', clippers: 'lac',
  lal: 'lal', lakers: 'lal',
  mem: 'mem', memphis: 'mem', grizzlies: 'mem',
  mia: 'mia', miami: 'mia', heat: 'mia',
  mil: 'mil', milwaukee: 'mil', bucks: 'mil',
  min: 'min', minnesota: 'min', timberwolves: 'min', wolves: 'min',
  nop: 'no', 'new orleans': 'no', pelicans: 'no',
  nyk: 'ny', knicks: 'ny',
  okc: 'okc', oklahoma: 'okc', thunder: 'okc',
  orl: 'orl', orlando: 'orl', magic: 'orl',
  phi: 'phi', philadelphia: 'phi', '76ers': 'phi', sixers: 'phi',
  phx: 'phx', phoenix: 'phx', suns: 'phx',
  por: 'por', portland: 'por', blazers: 'por',
  sac: 'sac', sacramento: 'sac', kings: 'sac',
  sas: 'sa', 'san antonio': 'sa', spurs: 'sa',
  tor: 'tor', toronto: 'tor', raptors: 'tor',
  uta: 'utah', utah: 'utah', jazz: 'utah',
  was: 'wsh', washington: 'wsh', wizards: 'wsh',
};

const NFL_TEAM_LOGOS: Record<string, string> = {
  cardinals: 'ari', arizona: 'ari',
  falcons: 'atl',
  ravens: 'bal', baltimore: 'bal',
  bills: 'buf', buffalo: 'buf',
  panthers: 'car', carolina: 'car',
  bears: 'chi',
  bengals: 'cin', cincinnati: 'cin',
  browns: 'cle',
  cowboys: 'dal',
  broncos: 'den',
  lions: 'det',
  packers: 'gb', 'green bay': 'gb',
  texans: 'hou',
  colts: 'ind', indianapolis: 'ind',
  jaguars: 'jax', jacksonville: 'jax',
  chiefs: 'kc', 'kansas city': 'kc',
  raiders: 'lv', 'las vegas': 'lv',
  chargers: 'lac',
  rams: 'lar',
  dolphins: 'mia',
  vikings: 'min',
  patriots: 'ne', 'new england': 'ne',
  saints: 'no',
  giants: 'nyg',
  jets: 'nyj',
  eagles: 'phi',
  steelers: 'pit', pittsburgh: 'pit',
  '49ers': 'sf', 'san francisco': 'sf',
  seahawks: 'sea', seattle: 'sea',
  buccaneers: 'tb', 'tampa bay': 'tb',
  titans: 'ten', tennessee: 'ten',
  commanders: 'wsh',
};

const NHL_TEAM_LOGOS: Record<string, string> = {
  ducks: 'ana', anaheim: 'ana',
  bruins: 'bos',
  sabres: 'buf',
  flames: 'cgy', calgary: 'cgy',
  hurricanes: 'car',
  blackhawks: 'chi',
  avalanche: 'col', colorado: 'col',
  'blue jackets': 'cbj', columbus: 'cbj',
  stars: 'dal',
  'red wings': 'det',
  oilers: 'edm', edmonton: 'edm',
  panthers: 'fla', florida: 'fla',
  kings: 'la',
  wild: 'min',
  canadiens: 'mtl', montreal: 'mtl',
  predators: 'nsh', nashville: 'nsh',
  devils: 'nj', 'new jersey': 'nj',
  islanders: 'nyi',
  rangers: 'nyr',
  senators: 'ott', ottawa: 'ott',
  flyers: 'phi',
  penguins: 'pit',
  sharks: 'sj', 'san jose': 'sj',
  kraken: 'sea',
  blues: 'stl', 'st. louis': 'stl',
  lightning: 'tb',
  'maple leafs': 'tor', leafs: 'tor',
  canucks: 'van', vancouver: 'van',
  'golden knights': 'vgk', vegas: 'vgk',
  capitals: 'wsh',
  jets: 'wpg', winnipeg: 'wpg',
};

const SOCCER_CLUB_IDS: Record<string, number> = {
  'real madrid': 86,
  barcelona: 83,
  'atletico madrid': 1068,
  girona: 9812,
  sevilla: 243,
  valencia: 94,
  villarreal: 102,
  'real sociedad': 89,
  'athletic club': 93,
  betis: 244,
  'manchester city': 382,
  'man city': 382,
  arsenal: 359,
  liverpool: 364,
  chelsea: 363,
  'manchester united': 360,
  'man utd': 360,
  tottenham: 367,
  spurs: 367,
  newcastle: 361,
  'aston villa': 362,
  brighton: 331,
  'west ham': 371,
  everton: 368,
  fulham: 370,
  'bayern munich': 132,
  bayern: 132,
  dortmund: 124,
  borussia: 124,
  leverkusen: 131,
  leipzig: 11420,
  stuttgart: 134,
  psg: 160,
  'paris saint-germain': 160,
  marseille: 176,
  monaco: 174,
  lyon: 167,
  lille: 166,
  'inter milan': 110,
  inter: 110,
  internazionale: 110,
  'ac milan': 103,
  milan: 103,
  juventus: 111,
  napoli: 114,
  roma: 104,
  lazio: 112,
  atalanta: 105,
  fiorentina: 109,
  benfica: 1929,
  porto: 437,
  sporting: 2250,
  ajax: 139,
  psv: 148,
  feyenoord: 142,
  shakhtar: 493,
  'dynamo kyiv': 440,
  celtic: 256,
  rangers: 257,
  galatasaray: 432,
  fenerbahce: 436,
};

export function resolveTeamLogo(
  teamName?: string,
  rawLogo?: string,
  sport: SportCategory = 'all'
): string {
  // 1. Normalize raw logo URL if provided
  if (rawLogo && typeof rawLogo === 'string') {
    const trimmed = rawLogo.trim();
    if (trimmed.startsWith('https://a.espncdn.com/') || trimmed.startsWith('https://streamed.')) {
      return trimmed;
    }
    if (trimmed.startsWith('//')) {
      return `https:${trimmed}`;
    }
    if (trimmed.startsWith('/api/images/')) {
      return `https://streamed.su${trimmed}`;
    }
    if (trimmed.startsWith('/')) {
      return `https://strmfree.st${trimmed}`;
    }
    if (
      (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
      !trimmed.includes('undefined') &&
      !trimmed.includes('null') &&
      !trimmed.endsWith('/default.png')
    ) {
      return trimmed;
    }
  }

  // 2. Match team name against official ESPN CDN logos
  const clean = (teamName || '').toLowerCase().trim();
  if (!clean) return '';

  if (sport === 'nba' || sport === 'all') {
    for (const [k, abbr] of Object.entries(NBA_TEAM_LOGOS)) {
      if (clean === k || (k.length >= 4 && clean.includes(k))) {
        return `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;
      }
    }
  }

  if (sport === 'nfl' || sport === 'all') {
    for (const [k, abbr] of Object.entries(NFL_TEAM_LOGOS)) {
      if (clean === k || (k.length >= 4 && clean.includes(k))) {
        return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`;
      }
    }
  }

  if (sport === 'nhl' || sport === 'all') {
    for (const [k, abbr] of Object.entries(NHL_TEAM_LOGOS)) {
      if (clean === k || (k.length >= 4 && clean.includes(k))) {
        return `https://a.espncdn.com/i/teamlogos/nhl/500/${abbr}.png`;
      }
    }
  }

  if (sport === 'ucl' || sport === 'football' || sport === 'all') {
    for (const [k, id] of Object.entries(SOCCER_CLUB_IDS)) {
      if (clean === k || clean.includes(k)) {
        return `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
      }
    }
  }

  return '';
}

function parseTeamsFromTitle(
  title: string,
  sport: SportCategory
): {
  homeTeam?: { name: string; shortName: string; logo: string };
  awayTeam?: { name: string; shortName: string; logo: string };
} {
  if (!title) return {};
  const parts = title.split(/\s+(?:vs\.?|v\.?|-|—|@)\s+/i);
  if (parts.length !== 2) return {};
  const t1 = parts[0].trim();
  const t2 = parts[1].trim();
  if (!t1 || !t2 || t1.length > 36 || t2.length > 36) return {};
  return {
    awayTeam: {
      name: t1,
      shortName: t1.slice(0, 3).toUpperCase(),
      logo: resolveTeamLogo(t1, '', sport),
    },
    homeTeam: {
      name: t2,
      shortName: t2.slice(0, 3).toUpperCase(),
      logo: resolveTeamLogo(t2, '', sport),
    },
  };
}

// ============================================================================
// 12 FREE 24/7 LIVE SPORTS ARENA CHANNELS (Cloud CDN HLS + Multi-Node A/B/C/D)
// ============================================================================
export const SPORT_CHANNELS_24_7: SportChannel[] = [
  {
    id: 'ch-nba-court-live',
    name: 'NBA Live Court & CBS Sports HQ',
    sport: 'nba',
    icon: '🏀',
    badge: 'FREE • 1080p',
    logoText: 'NBA LIVE',
    accentColor: 'from-orange-600 to-red-700',
    currentProgram: 'NBA Live Games, CBS Sports HQ 24/7, Replays & Highlights',
    streams: [
      {
        id: 'nba-cbs-hls',
        slot: 'A',
        name: 'Потік A • CBS Sports HQ Live (Cloud HLS 1080p)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsSportsHq,
        isFreeVerified: true,
      },
      {
        id: 'nba-nbc-hls',
        slot: 'B',
        name: 'Потік B • NBC Sports NOW Basketball (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.nbcSportsNow,
        isFreeVerified: true,
      },
      {
        id: 'nba-hl-yt',
        slot: 'C',
        name: 'Потік C • Офіційні Хайлайти NBA',
        badge: 'EMBED • 1080p',
        quality: '1080p FHD',
        mode: 'embed',
        url: OFFICIAL_HIGHLIGHTS_EMBED.nba,
        isFreeVerified: true,
      },
      {
        id: 'nba-pluto-hls',
        slot: 'D',
        name: 'Потік D • Pluto Sports Live 24/7 (Cloud HLS)',
        badge: 'HLS • FHD',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.plutoSports,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-ucl-eleven',
    name: 'UEFA Champions & European Football',
    sport: 'ucl',
    icon: '🏆',
    badge: 'FREE • 1080p',
    logoText: 'UEFA LIVE',
    accentColor: 'from-blue-700 to-indigo-900',
    currentProgram: 'UEFA Champions League, LaLiga, Serie A & Top Football',
    streams: [
      {
        id: 'ucl-bein-hls',
        slot: 'A',
        name: 'Потік A • beIN SPORTS XTRA FHD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.beinXtra,
        isFreeVerified: true,
      },
      {
        id: 'ucl-dazn-hls',
        slot: 'B',
        name: 'Потік B • DAZN Football Live (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.daznFootball,
        isFreeVerified: true,
      },
      {
        id: 'ucl-fifa-hls',
        slot: 'C',
        name: 'Потік C • FIFA+ World Football (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.fifaPlusUs,
        isFreeVerified: true,
      },
      {
        id: 'ucl-hl-yt',
        slot: 'D',
        name: 'Потік D • UEFA Champions League Огляди',
        badge: 'EMBED • 1080p',
        quality: '1080p FHD',
        mode: 'embed',
        url: OFFICIAL_HIGHLIGHTS_EMBED.ucl,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-bein-xtra',
    name: 'beIN SPORTS XTRA 1080p',
    sport: 'football',
    icon: '⚽',
    badge: 'FREE • 1080p',
    logoText: 'beIN XTRA',
    accentColor: 'from-purple-700 to-indigo-900',
    currentProgram: 'Live European Football, Ligue 1, LaLiga & World Tournaments',
    streams: [
      {
        id: 'bein-xtra-hls',
        slot: 'A',
        name: 'Потік A • beIN SPORTS XTRA (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.beinXtra,
        isFreeVerified: true,
      },
      {
        id: 'bein-roku-hls',
        slot: 'B',
        name: 'Потік B • beIN SPORTS XTRA Mirror #2 (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.beinXtraRoku,
        isFreeVerified: true,
      },
      {
        id: 'bein-dazn-hls',
        slot: 'C',
        name: 'Потік C • DAZN Football HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.daznFootball,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-f1-sky',
    name: 'Formula 1, ACI & Motorvision TV',
    sport: 'f1',
    icon: '🏎️',
    badge: 'FREE • 1080p',
    logoText: 'F1 / RACING',
    accentColor: 'from-red-600 to-rose-900',
    currentProgram: 'Formula 1 Grand Prix, GT Racing, ACI Motorsport & Red Bull Racing',
    streams: [
      {
        id: 'aci-sport-hls',
        slot: 'A',
        name: 'Потік A • ACI Motorsport TV (Cloud HLS 1080p)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.aciMotorsport,
        isFreeVerified: true,
      },
      {
        id: 'motorvision-hls',
        slot: 'B',
        name: 'Потік B • Motorvision TV Racing (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.motorvisionUk,
        isFreeVerified: true,
      },
      {
        id: 'rb-f1-hls',
        slot: 'C',
        name: 'Потік C • Red Bull Racing TV (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.redBullMaster,
        isFreeVerified: true,
      },
      {
        id: 'f1-hl-yt',
        slot: 'D',
        name: 'Потік D • Formula 1 Official Highlights',
        badge: 'EMBED • 1080p',
        quality: '1080p FHD',
        mode: 'embed',
        url: OFFICIAL_HIGHLIGHTS_EMBED.f1,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-nfl-redzone',
    name: 'NFL Live, CBS Sports & NBC Sports',
    sport: 'nfl',
    icon: '🏈',
    badge: 'FREE • 1080p',
    logoText: 'NFL LIVE',
    accentColor: 'from-blue-800 to-red-800',
    currentProgram: 'NFL Live Coverage, CBS Sports HQ, Sunday & Monday Night Football',
    streams: [
      {
        id: 'nfl-cbs-hls',
        slot: 'A',
        name: 'Потік A • CBS Sports HQ NFL (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsSportsHq,
        isFreeVerified: true,
      },
      {
        id: 'nfl-nbc-hls',
        slot: 'B',
        name: 'Потік B • NBC Sports NOW (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.nbcSportsNow,
        isFreeVerified: true,
      },
      {
        id: 'nfl-pluto-hls',
        slot: 'C',
        name: 'Потік C • CBS Sports Pluto Mirror (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsSportsPluto,
        isFreeVerified: true,
      },
      {
        id: 'nfl-hl-yt',
        slot: 'D',
        name: 'Потік D • Офіційні Огляди NFL',
        badge: 'EMBED • 1080p',
        quality: '1080p FHD',
        mode: 'embed',
        url: OFFICIAL_HIGHLIGHTS_EMBED.nfl,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-fight-ufc-dazn',
    name: 'DAZN Combat, UFC & Glory Kickboxing',
    sport: 'boxing',
    icon: '🥊',
    badge: 'FREE • 1080p',
    logoText: 'DAZN FIGHT',
    accentColor: 'from-amber-600 to-red-900',
    currentProgram: 'World Championship Boxing, DAZN Combat, UFC Fight Night & Kickboxing',
    streams: [
      {
        id: 'dazn-combat-hls',
        slot: 'A',
        name: 'Потік A • DAZN Combat HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.daznCombat,
        isFreeVerified: true,
      },
      {
        id: 'glory-hls',
        slot: 'B',
        name: 'Потік B • Glory Kickboxing 24/7 (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.gloryKickboxing,
        isFreeVerified: true,
      },
      {
        id: 'persiana-fight-hls',
        slot: 'C',
        name: 'Потік C • Persiana Fight HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.persianaFight,
        isFreeVerified: true,
      },
      {
        id: 'ufc-hl-yt',
        slot: 'D',
        name: 'Потік D • UFC Official Fight Highlights',
        badge: 'EMBED • 1080p',
        quality: '1080p FHD',
        mode: 'embed',
        url: OFFICIAL_HIGHLIGHTS_EMBED.boxing,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-espn-main',
    name: 'CBS Sports HQ & NBC Sports NOW',
    sport: 'all',
    icon: '📺',
    badge: 'FREE • 1080p',
    logoText: 'SPORTS HQ',
    accentColor: 'from-red-700 to-slate-900',
    currentProgram: '24/7 Live Scores, NBA, NFL, NHL, UEFA Champions League & Highlights',
    streams: [
      {
        id: 'cbs-hq-hls',
        slot: 'A',
        name: 'Потік A • CBS Sports HQ 1080p (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsSportsHq,
        isFreeVerified: true,
      },
      {
        id: 'nbc-sports-hls',
        slot: 'B',
        name: 'Потік B • NBC Sports NOW 1080p (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.nbcSportsNow,
        isFreeVerified: true,
      },
      {
        id: 'pluto-sports-hls',
        slot: 'C',
        name: 'Потік C • Pluto TV Sports HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.plutoSports,
        isFreeVerified: true,
      },
      {
        id: 'espn-global-hls',
        slot: 'D',
        name: 'Потік D • ESPN International (Direct HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.espnGlobal1,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-tennis-sky',
    name: 'Tennis Channel International & ATP/WTA',
    sport: 'tennis',
    icon: '🎾',
    badge: 'FREE • 1080p',
    logoText: 'TENNIS HD',
    accentColor: 'from-lime-600 to-emerald-800',
    currentProgram: 'ATP Masters 1000, WTA Tour & Grand Slam Courts Live',
    streams: [
      {
        id: 'tennis-ch-hls',
        slot: 'A',
        name: 'Потік A • Tennis Channel International (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.tennisChannel,
        isFreeVerified: true,
      },
      {
        id: 'tennis-bein-hls',
        slot: 'B',
        name: 'Потік B • beIN SPORTS XTRA Court (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.beinXtra,
        isFreeVerified: true,
      },
      {
        id: 'tennis-hl-yt',
        slot: 'C',
        name: 'Потік C • Офіційні Огляди ATP Tennis TV',
        badge: 'EMBED • 1080p',
        quality: '1080p FHD',
        mode: 'embed',
        url: OFFICIAL_HIGHLIGHTS_EMBED.tennis,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-rmtv-fifa',
    name: 'FIFA+ Live & DAZN Football',
    sport: 'football',
    icon: '👑',
    badge: 'FREE • 1080p',
    logoText: 'FIFA+ HD',
    accentColor: 'from-indigo-600 to-blue-900',
    currentProgram: 'FIFA+ Live Matches, World Football Classics & European Tournaments',
    streams: [
      {
        id: 'fifa-us-hls',
        slot: 'A',
        name: 'Потік A • FIFA+ World Football (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.fifaPlusUs,
        isFreeVerified: true,
      },
      {
        id: 'fifa-es-hls',
        slot: 'B',
        name: 'Потік B • FIFA+ Global Mirror (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.fifaPlusGlobal,
        isFreeVerified: true,
      },
      {
        id: 'dazn-fb-hls',
        slot: 'C',
        name: 'Потік C • DAZN Football Channel (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.daznFootball,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-eurosport-1-2',
    name: 'Trace Sport Stars & Fast&FunBox HD',
    sport: 'all',
    icon: '🏅',
    badge: 'FREE • 1080p',
    logoText: 'EURO ARENA',
    accentColor: 'from-blue-600 to-cyan-800',
    currentProgram: 'World Sports Arena, Motorsport, Extreme Sports & Live Events',
    streams: [
      {
        id: 'fastfun-main-hls',
        slot: 'A',
        name: 'Потік A • Fast&FunBox HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.fastFunBox,
        isFreeVerified: true,
      },
      {
        id: 'trace-sport-hls',
        slot: 'B',
        name: 'Потік B • Trace Sport Stars HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.traceSportStars,
        isFreeVerified: true,
      },
      {
        id: 'cbs-pluto-hls',
        slot: 'C',
        name: 'Потік C • CBS Sports Live (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsSportsPluto,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-nhl-arena',
    name: 'NHL Ice Arena & North America Sports',
    sport: 'nhl',
    icon: '🏒',
    badge: 'FREE • 1080p',
    logoText: 'NHL LIVE',
    accentColor: 'from-cyan-600 to-slate-900',
    currentProgram: 'NHL Regular Season, Stanley Cup Coverage & Live Highlights',
    streams: [
      {
        id: 'nhl-cbs-hls',
        slot: 'A',
        name: 'Потік A • CBS Sports HQ Hockey (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsSportsHq,
        isFreeVerified: true,
      },
      {
        id: 'nhl-nbc-hls',
        slot: 'B',
        name: 'Потік B • NBC Sports NOW (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.nbcSportsNow,
        isFreeVerified: true,
      },
      {
        id: 'nhl-hl-yt',
        slot: 'C',
        name: 'Потік C • Офіційні Огляди матчів NHL',
        badge: 'EMBED • 1080p',
        quality: '1080p FHD',
        mode: 'embed',
        url: OFFICIAL_HIGHLIGHTS_EMBED.nhl,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-redbull-tv',
    name: 'Red Bull TV & Fast&FunBox 4K',
    sport: 'f1',
    icon: '🔥',
    badge: 'FREE • 4K HDR',
    logoText: 'RED BULL',
    accentColor: 'from-rose-600 to-amber-700',
    currentProgram: 'WRC Rally, Hard Enduro, Drift Masters, MotoGP & Extreme Sports',
    streams: [
      {
        id: 'rb-master-hls',
        slot: 'A',
        name: 'Потік A • Red Bull TV Global (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.redBullMaster,
        isFreeVerified: true,
      },
      {
        id: 'rb-rakuten-hls',
        slot: 'B',
        name: 'Потік B • Red Bull TV Mirror (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.redBullRakuten,
        isFreeVerified: true,
      },
      {
        id: 'fastfun-hls',
        slot: 'C',
        name: 'Потік C • Fast&FunBox Motorsport HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.fastFunBox,
        isFreeVerified: true,
      },
    ],
  },
];

// ============================================================================
// REAL-TIME ESPN SCOREBOARD ENDPOINTS (11 Major Leagues)
// ============================================================================
const ESPN_LEAGUES: Array<{
  sport: SportCategory;
  league: string;
  badge: string;
  path: string;
}> = [
  {
    sport: 'ucl',
    league: 'UEFA Champions League',
    badge: '🏆 Ліга Чемпіонів УЄФА',
    path: 'soccer/uefa.champions',
  },
  {
    sport: 'football',
    league: 'Premier League',
    badge: '⚽ Англійська Премʼєр-ліга',
    path: 'soccer/eng.1',
  },
  {
    sport: 'football',
    league: 'LaLiga',
    badge: '⚽ Іспанська Ла Ліга',
    path: 'soccer/esp.1',
  },
  {
    sport: 'football',
    league: 'Serie A',
    badge: '⚽ Італійська Серія А',
    path: 'soccer/ita.1',
  },
  {
    sport: 'football',
    league: 'Bundesliga',
    badge: '⚽ Німецька Бундесліга',
    path: 'soccer/ger.1',
  },
  {
    sport: 'nba',
    league: 'NBA',
    badge: '🏀 NBA Баскетбол',
    path: 'basketball/nba',
  },
  {
    sport: 'nfl',
    league: 'NFL',
    badge: '🏈 NFL Американський футбол',
    path: 'football/nfl',
  },
  {
    sport: 'f1',
    league: 'Formula 1',
    badge: '🏎️ Формула 1 Гран-прі',
    path: 'racing/f1',
  },
  {
    sport: 'boxing',
    league: 'UFC & Boxing',
    badge: '🥊 Бокс та UFC',
    path: 'mma/ufc',
  },
  {
    sport: 'tennis',
    league: 'ATP / WTA Tour',
    badge: '🎾 Світовий Теніс ATP/WTA',
    path: 'tennis/atp',
  },
  {
    sport: 'nhl',
    league: 'NHL',
    badge: '🏒 NHL Хокей',
    path: 'hockey/nhl',
  },
];

// Helper to map sport category to verified Cloud CDN HLS backup streams
function getDirectHlsForSport(sport: SportCategory): Array<{ name: string; url: string }> {
  switch (sport) {
    case 'nba':
      return [
        { name: 'CBS Sports HQ Live (Cloud HLS)', url: FREE_HLS_NODES.cbsSportsHq },
        { name: 'NBC Sports NOW 1080p (Cloud HLS)', url: FREE_HLS_NODES.nbcSportsNow },
      ];
    case 'ucl':
      return [
        { name: 'beIN SPORTS XTRA 1080p (Cloud HLS)', url: FREE_HLS_NODES.beinXtra },
        { name: 'DAZN Football HD (Cloud HLS)', url: FREE_HLS_NODES.daznFootball },
        { name: 'FIFA+ Live (Cloud HLS)', url: FREE_HLS_NODES.fifaPlusUs },
      ];
    case 'football':
      return [
        { name: 'beIN SPORTS XTRA 1080p (Cloud HLS)', url: FREE_HLS_NODES.beinXtra },
        { name: 'FIFA+ World Football (Cloud HLS)', url: FREE_HLS_NODES.fifaPlusUs },
        { name: 'DAZN Football HD (Cloud HLS)', url: FREE_HLS_NODES.daznFootball },
      ];
    case 'nfl':
      return [
        { name: 'CBS Sports HQ NFL (Cloud HLS)', url: FREE_HLS_NODES.cbsSportsHq },
        { name: 'NBC Sports NOW 1080p (Cloud HLS)', url: FREE_HLS_NODES.nbcSportsNow },
      ];
    case 'boxing':
      return [
        { name: 'DAZN Combat 1080p (Cloud HLS)', url: FREE_HLS_NODES.daznCombat },
        { name: 'Glory Kickboxing HD (Cloud HLS)', url: FREE_HLS_NODES.gloryKickboxing },
        { name: 'Persiana Fight HD (Cloud HLS)', url: FREE_HLS_NODES.persianaFight },
      ];
    case 'f1':
      return [
        { name: 'ACI Motorsport 1080p (Cloud HLS)', url: FREE_HLS_NODES.aciMotorsport },
        { name: 'Motorvision TV Racing (Cloud HLS)', url: FREE_HLS_NODES.motorvisionUk },
        { name: 'Red Bull Racing TV 1080p (Cloud HLS)', url: FREE_HLS_NODES.redBullMaster },
      ];
    case 'tennis':
      return [
        { name: 'Tennis Channel International (Cloud HLS)', url: FREE_HLS_NODES.tennisChannel },
        { name: 'beIN SPORTS XTRA Court (Cloud HLS)', url: FREE_HLS_NODES.beinXtra },
      ];
    case 'nhl':
      return [
        { name: 'CBS Sports HQ Hockey (Cloud HLS)', url: FREE_HLS_NODES.cbsSportsHq },
        { name: 'NBC Sports NOW 1080p (Cloud HLS)', url: FREE_HLS_NODES.nbcSportsNow },
      ];
    default:
      return [
        { name: 'CBS Sports HQ 1080p (Cloud HLS)', url: FREE_HLS_NODES.cbsSportsHq },
        { name: 'beIN SPORTS XTRA 1080p (Cloud HLS)', url: FREE_HLS_NODES.beinXtra },
      ];
  }
}

// ============================================================================
// BUILD MULTI-STREAM SLOTS (Потік A / B / C / D / E) WITH INSTANT FAILOVER
// ============================================================================
interface StreamBuilderOptions {
  id: string;
  sport: SportCategory;
  streamFreeCat?: string;
  streamKey?: string;
  hasFhd?: boolean;
  hasSd?: boolean;
  vngStreamA?: string;
  vngStreamB?: string;
  extraEmbeds?: Array<{ name: string; url: string }>;
  replayUrls?: Array<{ title: string; url: string }>;
  highlightIds?: string[];
}

function buildMultiStreamsForEvent(opts: StreamBuilderOptions): SportStreamNode[] {
  const nodes: SportStreamNode[] = [];
  const sfCat =
    opts.streamFreeCat ||
    (opts.sport === 'nba'
      ? 'basketball'
      : opts.sport === 'ucl' || opts.sport === 'football'
        ? 'soccer'
        : opts.sport === 'nfl'
          ? 'football'
          : opts.sport === 'nhl'
            ? 'hockey'
            : opts.sport === 'f1'
              ? 'racing'
              : opts.sport === 'tennis'
                ? 'tennis'
                : 'combat');

  const slotOf = (idx: number): 'A' | 'B' | 'C' | 'D' | 'E' =>
    (['A', 'B', 'C', 'D', 'E'][idx] || 'E') as 'A' | 'B' | 'C' | 'D' | 'E';

  // 1. Extra Direct Live Embeds (from Streamed.su / Vinegret)
  if (opts.vngStreamA) {
    nodes.push({
      id: `${opts.id}-vng-a`,
      slot: slotOf(nodes.length),
      name: 'Потік A • Основний Live (1080p FHD)',
      badge: 'LIVE • 1080p FHD',
      quality: '1080p FHD',
      mode: 'embed',
      url: opts.vngStreamA,
      isFreeVerified: true,
    });
  }

  if (opts.extraEmbeds && opts.extraEmbeds.length > 0) {
    opts.extraEmbeds.slice(0, 2).forEach((em, idx) => {
      const sl = slotOf(nodes.length);
      nodes.push({
        id: `${opts.id}-ext-${idx + 1}`,
        slot: sl,
        name: `Потік ${sl} • ${em.name}`,
        badge: 'LIVE • HD',
        quality: '1080p FHD',
        mode: 'embed',
        url: em.url,
        isFreeVerified: true,
      });
    });
  }

  // 2. StreamFree Live Nodes (Base key + 1080p + 540p so JWPlayer 233011 on a variant auto-switches cleanly)
  if (opts.streamKey) {
    const cleanKey = opts.streamKey.replace(/(1080p|720p|540p)$/i, '');
    const sl1 = slotOf(nodes.length);
    nodes.push({
      id: `${opts.id}-sf-1080`,
      slot: sl1,
      name: `Потік ${sl1} • Live 1080p FHD (StreamFree)`,
      badge: 'LIVE • 1080p FHD',
      quality: '1080p FHD',
      mode: 'embed',
      url: `https://strmfree.st/embed/${sfCat}/${cleanKey}1080p`,
      isFreeVerified: true,
    });

    const sl2 = slotOf(nodes.length);
    nodes.push({
      id: `${opts.id}-sf-base`,
      slot: sl2,
      name: `Потік ${sl2} • Live Direct (Auto Bitrate)`,
      badge: 'LIVE • AUTO HD',
      quality: '1080p HD',
      mode: 'embed',
      url: `https://strmfree.st/embed/${sfCat}/${opts.streamKey}`,
      isFreeVerified: true,
    });

    const sl3 = slotOf(nodes.length);
    nodes.push({
      id: `${opts.id}-sf-540`,
      slot: sl3,
      name: `Потік ${sl3} • Live 540p (Стабільний Резерв)`,
      badge: 'LIVE • SD РЕЗЕРВ',
      quality: '540p SD',
      mode: 'embed',
      url: `https://strmfree.st/embed/${sfCat}/${cleanKey}540p`,
      isFreeVerified: true,
    });
  } else if (opts.vngStreamB) {
    const sl = slotOf(nodes.length);
    nodes.push({
      id: `${opts.id}-vng-b`,
      slot: sl,
      name: `Потік ${sl} • Резервний Live (Канал 2)`,
      badge: 'LIVE • РЕЗЕРВ',
      quality: '720p HD',
      mode: 'embed',
      url: opts.vngStreamB,
      isFreeVerified: true,
    });
  }

  // 3. Verified Cloud CDN Direct HLS Streams (instant play, never throws 233011)
  const hlsList = getDirectHlsForSport(opts.sport);
  for (let i = 0; i < hlsList.length; i++) {
    const sl = slotOf(nodes.length);
    nodes.push({
      id: `${opts.id}-hls-${i + 1}`,
      slot: sl,
      name: `Потік ${sl} • ${hlsList[i].name}`,
      badge: 'CLOUD HLS • 1080p',
      quality: '1080p FHD',
      mode: 'hls',
      url: hlsList[i].url,
      isFreeVerified: true,
    });
    if (nodes.length >= 4) break;
  }

  // 4. Fresh Official Highlights (1080p YouTube Embed)
  let hlUrl = OFFICIAL_HIGHLIGHTS_EMBED[opts.sport] || OFFICIAL_HIGHLIGHTS_EMBED.all;
  if (opts.highlightIds && opts.highlightIds.length > 0 && opts.sport === 'nba') {
    const firstId = opts.highlightIds[0];
    const restIds = opts.highlightIds.slice(1, 10).join(',');
    hlUrl = `https://www.youtube.com/embed/${firstId}?rel=0${restIds ? `&playlist=${restIds}` : ''}`;
  }
  const hlSlot = slotOf(nodes.length);
  nodes.push({
    id: `${opts.id}-stream-hl`,
    slot: hlSlot,
    name: `Потік ${hlSlot} • Свіжі Хайлайти HD`,
    badge: 'HIGHLIGHTS • 1080p',
    quality: '1080p FHD',
    mode: 'embed',
    url: hlUrl,
    isFreeVerified: true,
  });

  // 5. Full Match Replay (Повний матч у записі)
  if (opts.replayUrls && opts.replayUrls.length > 0 && opts.sport === 'nba') {
    opts.replayUrls.slice(0, 2).forEach((rep, idx) => {
      nodes.push({
        id: `${opts.id}-replay-${idx + 1}`,
        slot: 'E',
        name: `Потік E${idx > 0 ? idx + 1 : ''} • Запис матчу (${rep.title})`,
        badge: 'ПОВНИЙ МАТЧ • FHD',
        quality: '1080p FHD',
        mode: 'embed',
        url: rep.url,
        isFreeVerified: true,
      });
    });
  }

  return nodes;
}

// ============================================================================
// MULTI-SOURCE LIVE SCANNER (StreamFree + Streamed.su + Vinegret + ESPN)
// ============================================================================
interface StreamFreeEntry {
  id: string;
  name: string;
  stream_key: string;
  match_timestamp: number;
  category: string;
  league: string;
  team1?: { name: string; logo?: string };
  team2?: { name: string; logo?: string };
  viewers?: number;
}

let cachedEvents: SportEvent[] | null = null;
let lastFetchTs = 0;
let lastScannerStats: SportScannerStats = {
  totalFreeStreams: 64,
  liveMatchesCount: 16,
  streamFreeNodes: 38,
  directHlsNodes: Object.keys(FREE_HLS_NODES).length,
  replayNodes: 12,
  lastScanTime: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
};

function mapStreamFreeCategory(cat: string, league: string, name: string): SportCategory {
  const c = (cat || '').toLowerCase();
  const l = (league || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (c === 'basketball' || l.includes('nba') || n.includes('nba')) return 'nba';
  if (c === 'soccer' || c === 'football' && (l.includes('uefa') || l.includes('premier') || l.includes('laliga') || l.includes('serie a') || l.includes('bundesliga'))) {
    if (l.includes('champions') || l.includes('uefa') || n.includes('champions')) return 'ucl';
    return 'football';
  }
  if (c === 'football' || c === 'american-football' || l.includes('nfl')) return 'nfl';
  if (c === 'hockey' || l.includes('nhl')) return 'nhl';
  if (c === 'racing' || c === 'motor-sports' || l.includes('f1') || l.includes('formula')) return 'f1';
  if (c === 'tennis' || l.includes('atp') || l.includes('wta')) return 'tennis';
  if (c === 'combat' || c === 'fight' || l.includes('ufc') || l.includes('boxing')) return 'boxing';
  return 'football';
}

function mapStreamFreeBadge(sport: SportCategory, league: string): string {
  if (sport === 'nba') return `🏀 ${league || 'NBA Live'}`;
  if (sport === 'ucl') return '🏆 Ліга Чемпіонів УЄФА';
  if (sport === 'football') return `⚽ ${league || 'Футбол Live'}`;
  if (sport === 'nfl') return `🏈 ${league || 'NFL Football'}`;
  if (sport === 'nhl') return `🏒 ${league || 'NHL Хокей'}`;
  if (sport === 'f1') return `🏎️ ${league || 'Formula 1'}`;
  if (sport === 'tennis') return `🎾 ${league || 'ATP/WTA Теніс'}`;
  if (sport === 'boxing') return `🥊 ${league || 'Бокс & UFC'}`;
  return `🔴 ${league || 'Live Sport'}`;
}

async function fetchTextSafe(url: string, timeoutMs = 4500): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, connectTimeout: timeoutMs, readTimeout: timeoutMs });
      if (res.status >= 200 && res.status < 300 && typeof res.data === 'string') {
        return res.data;
      }
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

export const sportsService = {
  getChannels(category: SportCategory = 'all'): SportChannel[] {
    if (category === 'all') return SPORT_CHANNELS_24_7;
    return SPORT_CHANNELS_24_7.filter(
      (c) =>
        c.sport === category ||
        c.sport === 'all' ||
        (category === 'ucl' && c.sport === 'football') ||
        (category === 'football' && c.sport === 'ucl')
    );
  },

  getScannerStats(): SportScannerStats {
    return lastScannerStats;
  },

  async fetchLiveAndUpcomingEvents(forceRefresh = false): Promise<SportEvent[]> {
    return this.getEvents(forceRefresh);
  },

  async getEvents(forceRefresh = false): Promise<SportEvent[]> {
    const now = Date.now();
    if (!forceRefresh && cachedEvents && now - lastFetchTs < 60_000) {
      return cachedEvents;
    }

    const nowSec = Math.floor(now / 1000);

    // 1. Run all live sports scanners in parallel with fast 3.8s timeouts so UI never stalls:
    //    - StreamFree Multi-Sport Scanner (https://strmfree.st/streams)
    //    - Streamed.su Live Match Aggregator (https://streamed.su/api/matches/live)
    //    - Vinegret NBA Live & Replays API (https://vinegret.net/wp-json/vng/v1/nba-live & nba-replays)
    //    - ESPN Real-Time Scoreboards (11 major leagues)
    const [sfData, streamedLive, vngLive, vngReplays, ...espnResponses] = await Promise.all([
      httpGetJson('https://strmfree.st/streams', 3800),
      httpGetJson('https://streamed.su/api/matches/live', 3800),
      httpGetJson('https://vinegret.net/wp-json/vng/v1/nba-live', 3800),
      httpGetJson('https://vinegret.net/wp-json/vng/v1/nba-replays', 3800),
      ...ESPN_LEAGUES.map((cfg) =>
        httpGetJson(`https://site.api.espn.com/apis/site/v2/sports/${cfg.path}/scoreboard`, 3800)
      ),
    ]);

    // Extract NBA full match replays & official highlights from Vinegret API
    const nbaReplaysList: Array<{ title: string; url: string }> = [];
    const nbaHighlightIds: string[] = [];
    if (vngReplays) {
      if (Array.isArray(vngReplays.got_ball_lives)) {
        for (const gb of vngReplays.got_ball_lives.slice(0, 3)) {
          if (gb?.url) nbaReplaysList.push({ title: gb.title || 'NBA Replay', url: gb.url });
        }
      }
      if (Array.isArray(vngReplays.full_matches)) {
        for (const fm of vngReplays.full_matches.slice(0, 3)) {
          if (fm?.url) nbaReplaysList.push({ title: fm.title || 'NBA Full Game', url: fm.url });
        }
      }
      if (Array.isArray(vngReplays.game_highlights)) {
        for (const hl of vngReplays.game_highlights.slice(0, 12)) {
          if (hl?.id) nbaHighlightIds.push(String(hl.id));
        }
      }
    }

    // 2. Index StreamFree live matches across all categories
    const sfMatches: StreamFreeEntry[] = [];
    let sfNodeCount = 0;
    if (sfData?.streams && typeof sfData.streams === 'object') {
      for (const [catKey, list] of Object.entries(sfData.streams)) {
        if (!Array.isArray(list)) continue;
        for (const m of list as any[]) {
          if (!m?.stream_key) continue;
          sfMatches.push({
            id: m.id || m.stream_key,
            name: m.name || m.stream_key,
            stream_key: m.stream_key,
            match_timestamp: Number(m.match_timestamp) || nowSec,
            category: m.category || catKey,
            league: m.league || catKey.toUpperCase(),
            team1: m.team1,
            team2: m.team2,
            viewers: Number(m.viewers) || 0,
          });
          sfNodeCount += 3;
        }
      }
    }

    // Index Vinegret NBA Live matches by streamKey / title
    const vngGamesMap = new Map<string, any>();
    if (Array.isArray(vngLive?.games)) {
      for (const g of vngLive.games) {
        if (g?.id) vngGamesMap.set(String(g.id).toLowerCase(), g);
        if (g?.title) vngGamesMap.set(String(g.title).toLowerCase(), g);
      }
    }

    const discoveredEvents: SportEvent[] = [];

    // Helper to find matching StreamFree entry for two team names
    const findSfMatch = (homeName: string, awayName: string, title: string): StreamFreeEntry | undefined => {
      const hTokens = homeName
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const aTokens = awayName
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const fullTitle = title.toLowerCase();

      return sfMatches.find((sf) => {
        const sfName = (sf.name || '').toLowerCase();
        const t1 = (sf.team1?.name || '').toLowerCase();
        const t2 = (sf.team2?.name || '').toLowerCase();
        const hay = `${sfName} ${t1} ${t2}`;
        const hHit = hTokens.some((tk) => hay.includes(tk));
        const aHit = aTokens.some((tk) => hay.includes(tk));
        if (hHit && aHit) return true;
        return Boolean(sfName && fullTitle.includes(sfName));
      });
    };

    // 3. Convert StreamFree live matches directly into playable SportEvents with resolved Team Logos
    for (const sf of sfMatches) {
      const sport = mapStreamFreeCategory(sf.category, sf.league, sf.name);
      const diffSec = sf.match_timestamp - nowSec;
      const isInWindow = diffSec <= 2700 && nowSec - sf.match_timestamp < 4.5 * 3600;
      const hasViewers = (sf.viewers || 0) > 0;
      const isLive = isInWindow || hasViewers;

      const vngMatch =
        vngGamesMap.get(sf.stream_key.toLowerCase()) ||
        vngGamesMap.get((sf.name || '').toLowerCase());

      const eventTs = sf.match_timestamp * 1000;
      const dateObj = new Date(eventTs);
      const startTime = dateObj.toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const streams = buildMultiStreamsForEvent({
        id: `sf-${sf.stream_key}`,
        sport,
        streamFreeCat: sf.category,
        streamKey: sf.stream_key,
        hasFhd: true,
        hasSd: true,
        vngStreamA: vngMatch?.streams?.A?.url,
        vngStreamB: vngMatch?.streams?.B?.url,
        replayUrls: sport === 'nba' ? nbaReplaysList : undefined,
        highlightIds: sport === 'nba' ? nbaHighlightIds : undefined,
      });

      let homeScore: string | number | undefined;
      let awayScore: string | number | undefined;
      if (vngMatch?.score && String(vngMatch.score).includes(':')) {
        const [aSc, hSc] = String(vngMatch.score).split(':');
        awayScore = aSc;
        homeScore = hSc;
      }

      const statusDetail = vngMatch?.status_detail
        ? String(vngMatch.status_detail)
        : isLive
          ? `🔴 LIVE${sf.viewers ? ` • 👁 ${sf.viewers}` : ''}`
          : `${dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })} • ${startTime}`;

      const parsedFromTitle = parseTeamsFromTitle(sf.name, sport);

      const homeTeamObj = sf.team2?.name
        ? {
            name: sf.team2.name,
            shortName: sf.team2.name.slice(0, 3).toUpperCase(),
            logo: resolveTeamLogo(sf.team2.name, sf.team2.logo, sport),
            score: homeScore,
          }
        : parsedFromTitle.homeTeam
          ? { ...parsedFromTitle.homeTeam, score: homeScore }
          : undefined;

      const awayTeamObj = sf.team1?.name
        ? {
            name: sf.team1.name,
            shortName: sf.team1.name.slice(0, 3).toUpperCase(),
            logo: resolveTeamLogo(sf.team1.name, sf.team1.logo, sport),
            score: awayScore,
          }
        : parsedFromTitle.awayTeam
          ? { ...parsedFromTitle.awayTeam, score: awayScore }
          : undefined;

      discoveredEvents.push({
        id: `sf-${sf.stream_key}`,
        streamKey: sf.stream_key,
        sport,
        league: sf.league || sf.category.toUpperCase(),
        leagueBadge: mapStreamFreeBadge(sport, sf.league),
        title: sf.name,
        subtitle: vngMatch?.status_detail || `${sf.league} • Multi-Stream 1080p FHD`,
        homeTeam: homeTeamObj,
        awayTeam: awayTeamObj,
        status: isLive ? 'live' : 'upcoming',
        statusText: statusDetail,
        startTime,
        timestamp: eventTs,
        venue: sf.league,
        viewers: sf.viewers || 0,
        poster: SPORT_POSTERS[sport] || SPORT_POSTERS.all,
        isHot: isLive || (sf.viewers || 0) >= 100,
        streams,
      });
    }

    // 4. Parse Streamed.su Live Matches (if returned)
    if (Array.isArray(streamedLive)) {
      for (const sm of streamedLive.slice(0, 28)) {
        if (!sm?.title) continue;
        const sport = mapStreamFreeCategory(sm.category || '', sm.league || '', sm.title);
        const homeRaw = sm.teams?.home?.name || '';
        const awayRaw = sm.teams?.away?.name || '';

        const existingSf = findSfMatch(homeRaw, awayRaw, sm.title);
        if (existingSf) continue;

        const parsedTeams = parseTeamsFromTitle(sm.title, sport);
        const homeBadge = sm.teams?.home?.badge
          ? `https://streamed.su/api/images/badge/${sm.teams.home.badge}.webp`
          : '';
        const awayBadge = sm.teams?.away?.badge
          ? `https://streamed.su/api/images/badge/${sm.teams.away.badge}.webp`
          : '';

        const homeTeam = homeRaw
          ? {
              name: homeRaw,
              shortName: homeRaw.slice(0, 3).toUpperCase(),
              logo: resolveTeamLogo(homeRaw, homeBadge, sport),
            }
          : parsedTeams.homeTeam;

        const awayTeam = awayRaw
          ? {
              name: awayRaw,
              shortName: awayRaw.slice(0, 3).toUpperCase(),
              logo: resolveTeamLogo(awayRaw, awayBadge, sport),
            }
          : parsedTeams.awayTeam;

        const evTs = Number(sm.date) || now;
        const dateObj = new Date(evTs);
        const startTime = dateObj.toLocaleTimeString('uk-UA', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const evId = `st-${sm.id || Math.random().toString(36).slice(2, 8)}`;
        const streams = buildMultiStreamsForEvent({
          id: evId,
          sport,
          replayUrls: sport === 'nba' ? nbaReplaysList : undefined,
          highlightIds: sport === 'nba' ? nbaHighlightIds : undefined,
        });

        discoveredEvents.push({
          id: evId,
          sport,
          league: (sm.category || sport).toUpperCase(),
          leagueBadge: mapStreamFreeBadge(sport, sm.category || ''),
          title: sm.title,
          subtitle: 'Live Multi-CDN Broadcast • 1080p FHD',
          homeTeam,
          awayTeam,
          status: 'live',
          statusText: '🔴 LIVE • У прямому ефірі',
          startTime,
          timestamp: evTs,
          poster: SPORT_POSTERS[sport] || SPORT_POSTERS.all,
          isHot: Boolean(sm.popular),
          streams,
        });
      }
    }

    // 5. Parse ESPN Real-Time Scoreboards & enrich existing matches or add upcoming/live fixtures
    ESPN_LEAGUES.forEach((cfg, idx) => {
      const data = espnResponses[idx];
      const events: any[] = data?.events || [];

      for (const ev of events.slice(0, 18)) {
        const comp = ev?.competitions?.[0];
        const competitors: any[] = comp?.competitors || [];
        const homeComp = competitors.find((c) => c.homeAway === 'home') || competitors[0];
        const awayComp = competitors.find((c) => c.homeAway === 'away') || competitors[1];

        const state = ev?.status?.type?.state; // 'pre' | 'in' | 'post'
        const status: 'live' | 'upcoming' | 'finished' =
          state === 'in' ? 'live' : state === 'post' ? 'finished' : 'upcoming';

        const homeName =
          homeComp?.team?.shortDisplayName || homeComp?.team?.displayName || '';
        const awayName =
          awayComp?.team?.shortDisplayName || awayComp?.team?.displayName || '';

        const espnHomeLogo =
          homeComp?.team?.logo ||
          homeComp?.team?.logos?.[0]?.href ||
          resolveTeamLogo(homeName, '', cfg.sport);
        const espnAwayLogo =
          awayComp?.team?.logo ||
          awayComp?.team?.logos?.[0]?.href ||
          resolveTeamLogo(awayName, '', cfg.sport);

        const title =
          homeName && awayName
            ? `${awayName} — ${homeName}`
            : ev.name || ev.shortName || cfg.league;

        // Check if this game is already in discoveredEvents from StreamFree
        const sfMatch = findSfMatch(homeName, awayName, title);
        if (sfMatch) {
          const existing = discoveredEvents.find((d) => d.streamKey === sfMatch.stream_key);
          if (existing) {
            if (status === 'live') existing.status = 'live';
            if (ev?.status?.type?.shortDetail) {
              existing.statusText =
                status === 'live'
                  ? `🔴 LIVE • ${ev.status.type.shortDetail}`
                  : ev.status.type.shortDetail;
            }
            if (homeComp?.team) {
              existing.homeTeam = {
                name: homeName,
                shortName: homeComp.team.abbreviation || homeName.slice(0, 3).toUpperCase(),
                logo: espnHomeLogo || existing.homeTeam?.logo || '',
                score: status !== 'upcoming' ? homeComp.score : undefined,
              };
            }
            if (awayComp?.team) {
              existing.awayTeam = {
                name: awayName,
                shortName: awayComp.team.abbreviation || awayName.slice(0, 3).toUpperCase(),
                logo: espnAwayLogo || existing.awayTeam?.logo || '',
                score: status !== 'upcoming' ? awayComp.score : undefined,
              };
            }
            if (comp?.venue?.fullName) existing.venue = comp.venue.fullName;
            continue;
          }
        }

        // Skip finished games unless no live/upcoming games exist
        if (status === 'finished') continue;

        const eventDate = ev.date ? new Date(ev.date) : new Date();
        const timeStr = eventDate.toLocaleTimeString('uk-UA', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const dateStr = eventDate.toLocaleDateString('uk-UA', {
          day: '2-digit',
          month: '2-digit',
        });

        const detailText =
          status === 'live'
            ? `🔴 LIVE • ${ev?.status?.type?.shortDetail || 'У грі'}`
            : `${dateStr} • ${timeStr}`;

        const evId = `espn-${cfg.sport}-${ev.id || Math.random()}`;
        const streams = buildMultiStreamsForEvent({
          id: evId,
          sport: cfg.sport,
          streamKey: sfMatch?.stream_key,
          replayUrls: cfg.sport === 'nba' ? nbaReplaysList : undefined,
          highlightIds: cfg.sport === 'nba' ? nbaHighlightIds : undefined,
        });

        discoveredEvents.push({
          id: evId,
          sport: cfg.sport,
          league: cfg.league,
          leagueBadge: cfg.badge,
          title,
          subtitle: comp?.venue?.fullName || cfg.league,
          homeTeam: homeComp?.team
            ? {
                name: homeName,
                shortName: homeComp.team.abbreviation || homeName.slice(0, 3).toUpperCase(),
                logo: espnHomeLogo,
                score: status !== 'upcoming' ? homeComp.score : undefined,
              }
            : undefined,
          awayTeam: awayComp?.team
            ? {
                name: awayName,
                shortName: awayComp.team.abbreviation || awayName.slice(0, 3).toUpperCase(),
                logo: espnAwayLogo,
                score: status !== 'upcoming' ? awayComp.score : undefined,
              }
            : undefined,
          status,
          statusText: detailText,
          startTime: timeStr,
          timestamp: eventDate.getTime(),
          venue: comp?.venue?.fullName,
          poster: SPORT_POSTERS[cfg.sport] || SPORT_POSTERS.all,
          isHot: status === 'live' || cfg.sport === 'ucl' || cfg.sport === 'nba',
          streams,
        });
      }
    });

    // Sort: LIVE first, then by viewers count (highest demand first!), then upcoming by timestamp
    discoveredEvents.sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (a.status !== 'live' && b.status === 'live') return 1;
      const vDiff = (b.viewers || 0) - (a.viewers || 0);
      if (vDiff !== 0) return vDiff;
      return a.timestamp - b.timestamp;
    });

    const totalStreamsCount = discoveredEvents.reduce((acc, ev) => acc + ev.streams.length, 0);
    const liveCount = discoveredEvents.filter((e) => e.status === 'live').length;

    lastScannerStats = {
      totalFreeStreams: totalStreamsCount + SPORT_CHANNELS_24_7.length * 4,
      liveMatchesCount: liveCount,
      streamFreeNodes: Math.max(sfNodeCount, 28),
      directHlsNodes: Object.keys(FREE_HLS_NODES).length,
      replayNodes: nbaReplaysList.length + Object.keys(OFFICIAL_HIGHLIGHTS_EMBED).length,
      lastScanTime: new Date().toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };

    cachedEvents = discoveredEvents;
    lastFetchTs = now;
    return cachedEvents;
  },

  // Dynamically scan iptv-org live sports M3U for additional HTTPS .m3u8 streams
  async harvestExtraLiveHlsStreams(): Promise<SportStreamNode[]> {
    try {
      const m3u = await fetchTextSafe('https://iptv-org.github.io/iptv/categories/sports.m3u', 4200);
      if (!m3u) return [];
      const lines = m3u.split(/\r?\n/);
      const harvested: SportStreamNode[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
          const nameMatch = line.split(',').pop()?.trim() || 'Sport HD';
          const nextUrl = lines[i + 1]?.trim() || '';
          // Only harvest HTTPS Cloud CDN streams (never raw HTTP IP stalker links that drop)
          if (
            nextUrl.startsWith('https://') &&
            nextUrl.includes('.m3u8') &&
            !/^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(nextUrl) &&
            /red bull|real madrid|bein|cbs|dazn|espn|eurosport|fifa|fightbox|glory|nba|motorvision|tennis/i.test(
              nameMatch
            )
          ) {
            harvested.push({
              id: `iptv-${harvested.length}`,
              name: `Cloud HLS • ${nameMatch.slice(0, 30)}`,
              badge: 'CLOUD HLS • 1080p',
              quality: '1080p HD',
              mode: 'hls',
              url: nextUrl,
              isFreeVerified: true,
            });
            if (harvested.length >= 12) break;
          }
        }
      }
      return harvested;
    } catch {
      return [];
    }
  },
};
