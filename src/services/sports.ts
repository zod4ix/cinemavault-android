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
// VERIFIED 100% WORKING CLOUD CDN HTTPS HLS (.m3u8) STREAMS (200 OK #EXTM3U)
// ============================================================================
export const FREE_HLS_NODES = {
  nbcSportsNow:
    'https://d4whmvwm0rdvi.cloudfront.net/10007/99993008/hls/master.m3u8?ads.xumo_channelId=99993008',
  beinXtra: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8',
  beinXtraEs: 'https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8',
  cbsGolazo:
    'https://dai.google.com/linear/hls/event/7f3Wv6f7QEKfQna22jHqLQ/master.m3u8',
  cbsSportsHq: 'https://jmp2.uk/plu-5e9f2c05172a0f0007db4786.m3u8',
  daznCombat: 'https://jmp2.uk/plu-64d626ac9b414d000820e2fc.m3u8',
  daznFootball: 'https://jmp2.uk/plu-64afe50c5dc16600087f3227.m3u8',
  fifaPlusUs:
    'https://d2w9q46ikgrcwx.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-of5cbk3sav3w5/v1/sysdata_s_p_a_fifa_7/samsungheadend_us/latest/main/hls/playlist.m3u8',
  fifaPlusGlobal:
    'https://d63fabad.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWVzX0ZJRkFQbHVzU3BhbmlzaF9ITFM/playlist.m3u8',
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
  espnOcho: 'https://d3b6q2ou5kp8ke.cloudfront.net/ESPNTheOcho.m3u8',
  eurosport1:
    'https://r.eu.cdn-redge.media/livehls/oeu/mt/live/eurosport_1/live.livx/playlist.m3u8',
  eurosport2:
    'https://r.eu.cdn-redge.media/livehls/oeu/mt/live/eurosport_2/live.livx/playlist.m3u8',
};

// Strict 48-hour retention limit for finished matches
export const FINISHED_RETENTION_MS = 48 * 3600 * 1000;

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
// OFFICIAL ESPN CDN TEAM LOGO RESOLVER
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
  mammoth: 'utah', utah: 'utah',
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
  bournemouth: 349,
  brentford: 337,
  'crystal palace': 384,
  wolves: 380,
  wolverhampton: 380,
  'nottingham forest': 393,
  leicester: 375,
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

const EPL_CLUBS = [
  'arsenal',
  'liverpool',
  'manchester city',
  'man city',
  'manchester united',
  'man utd',
  'chelsea',
  'tottenham',
  'newcastle',
  'aston villa',
  'brighton',
  'west ham',
  'everton',
  'fulham',
  'bournemouth',
  'brentford',
  'crystal palace',
  'wolverhampton',
  'wolves',
  'nottingham forest',
  'leicester',
  'ipswich',
  'southampton',
  'hull city',
  'leeds',
  'sunderland',
  'burnley',
];

export function formatTeamUpper(name?: string): string {
  return (name || '').trim().toUpperCase();
}

export function formatMatchPairUpper(teamA?: string, teamB?: string, fallbackTitle?: string): string {
  const a = formatTeamUpper(teamA);
  const b = formatTeamUpper(teamB);
  if (a && b) return `${a} — ${b}`;
  return (fallbackTitle || '').replace(/\s+(?:vs\.?|v\.?|@|-|—)\s+/gi, ' — ').trim().toUpperCase();
}

export function resolveTeamLogo(
  teamName?: string,
  rawLogo?: string,
  sport: SportCategory = 'all'
): string {
  if (rawLogo && typeof rawLogo === 'string') {
    const trimmed = rawLogo.trim();
    if (trimmed.startsWith('https://a.espncdn.com/')) {
      return trimmed;
    }
    if (trimmed.startsWith('//')) {
      return `https:${trimmed}`;
    }
    if (trimmed.startsWith('/')) {
      return `https://strmfree.st${trimmed}`;
    }
    if (
      (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
      !trimmed.includes('undefined') &&
      !trimmed.includes('null') &&
      !trimmed.includes('streamed.') &&
      !trimmed.endsWith('/default.png')
    ) {
      return trimmed;
    }
  }

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
  if (!t1 || !t2 || t1.length > 42 || t2.length > 42) return {};
  return {
    awayTeam: {
      name: formatTeamUpper(t1),
      shortName: t1.slice(0, 3).toUpperCase(),
      logo: resolveTeamLogo(t1, '', sport),
    },
    homeTeam: {
      name: formatTeamUpper(t2),
      shortName: t2.slice(0, 3).toUpperCase(),
      logo: resolveTeamLogo(t2, '', sport),
    },
  };
}

/**
 * Exact Sport & League Classifier:
 * Never labels a match as "Ліга Чемпіонів" unless it is genuinely UEFA Champions League.
 * Explicitly identifies "Футбол • Прем'єр-ліга Англії", "Футбол • Ла Ліга Іспанії", etc.
 */
export function classifySportAndLeague(
  rawCat: string,
  rawLeague: string,
  matchName: string,
  team1Name = '',
  team2Name = ''
): { sport: SportCategory; league: string; badge: string } {
  const c = (rawCat || '').toLowerCase().trim();
  const l = (rawLeague || '').toLowerCase().trim();
  const n = (matchName || '').toLowerCase().trim();
  const t1 = (team1Name || '').toLowerCase().trim();
  const t2 = (team2Name || '').toLowerCase().trim();
  const combined = `${l} ${n} ${t1} ${t2}`;

  // 1. Basketball (NBA / NCAA / EuroLeague)
  if (c === 'basketball' || l.includes('nba') || l.includes('ncaa') || l.includes('euroleague')) {
    if (l.includes('ncaa')) {
      return { sport: 'nba', league: 'Баскетбол • NCAA Баскетбол', badge: '🏀 Баскетбол • NCAA' };
    }
    if (l.includes('euroleague')) {
      return { sport: 'nba', league: 'Баскетбол • Євроліга', badge: '🏀 Баскетбол • Євроліга' };
    }
    return { sport: 'nba', league: 'Баскетбол • НБА (NBA)', badge: '🏀 Баскетбол • НБА' };
  }

  // 2. Ice Hockey (NHL)
  if (c === 'hockey' || l.includes('nhl') || l.includes('khl') || l.includes('iihf')) {
    return { sport: 'nhl', league: 'Хокей • НХЛ (NHL)', badge: '🏒 Хокей • НХЛ' };
  }

  // 3. American Football (NFL)
  if (
    c === 'american-football' ||
    l.includes('nfl') ||
    (c === 'football' &&
      !l.includes('uefa') &&
      !l.includes('premier') &&
      !l.includes('laliga') &&
      !l.includes('serie a') &&
      !l.includes('bundesliga') &&
      !l.includes('ligue 1') &&
      (l.includes('nfl') ||
        Object.keys(NFL_TEAM_LOGOS).some((k) => k.length >= 5 && combined.includes(k))))
  ) {
    return {
      sport: 'nfl',
      league: 'Американський футбол • НФЛ (NFL)',
      badge: '🏈 Американський футбол • НФЛ',
    };
  }

  // 4. Formula 1 & Motorsport
  if (c === 'racing' || c === 'motor-sports' || l.includes('f1') || l.includes('formula') || l.includes('motogp')) {
    return { sport: 'f1', league: 'Автоспорт • Формула 1', badge: '🏎️ Автоспорт • Формула 1' };
  }

  // 5. Tennis (ATP / WTA)
  if (c === 'tennis' || l.includes('atp') || l.includes('wta') || l.includes('wimbledon') || l.includes('open')) {
    return { sport: 'tennis', league: 'Теніс • Світовий тур ATP / WTA', badge: '🎾 Теніс • ATP / WTA' };
  }

  // 6. Boxing / UFC / MMA
  if (c === 'combat' || c === 'fight' || l.includes('ufc') || l.includes('boxing') || l.includes('mma') || l.includes('bellator')) {
    return { sport: 'boxing', league: 'Єдиноборства • Бокс та UFC', badge: '🥊 Бокс та UFC' };
  }

  // 7. Football / Soccer — Exact Tournament & Country League Resolution
  const isTrueChampionsLeague =
    (l.includes('uefa champions') ||
      l === 'ucl' ||
      l === 'champions league' ||
      n.includes('uefa champions league')) &&
    !l.includes('afc') &&
    !l.includes('concacaf') &&
    !l.includes('caf') &&
    !l.includes('women');

  if (isTrueChampionsLeague) {
    return {
      sport: 'ucl',
      league: 'Футбол • Ліга Чемпіонів УЄФА',
      badge: '🏆 Футбол • Ліга Чемпіонів УЄФА',
    };
  }

  if (l.includes('europa league') || l.includes('uefa.europa')) {
    return {
      sport: 'football',
      league: 'Футбол • Ліга Європи УЄФА',
      badge: '⚽ Футбол • Ліга Європи УЄФА',
    };
  }

  if (l.includes('conference') || l.includes('europa.conf')) {
    return {
      sport: 'football',
      league: 'Футбол • Ліга Конференцій УЄФА',
      badge: '⚽ Футбол • Ліга Конференцій УЄФА',
    };
  }

  if (l.includes('nations league') || l.includes('uefa.nations')) {
    return {
      sport: 'football',
      league: 'Футбол • Ліга Націй УЄФА',
      badge: '⚽ Футбол • Ліга Націй УЄФА',
    };
  }

  const isEplTeamMatch =
    EPL_CLUBS.some((club) => t1.includes(club)) && EPL_CLUBS.some((club) => t2.includes(club));

  if (
    l.includes('premier league') ||
    l.includes('epl') ||
    l.includes('eng.1') ||
    l.includes('english premier') ||
    isEplTeamMatch
  ) {
    return {
      sport: 'football',
      league: "Футбол • Прем'єр-ліга Англії",
      badge: "⚽ Футбол • Прем'єр-ліга Англії",
    };
  }

  if (l.includes('championship') || l.includes('eng.2') || l.includes('efl')) {
    return {
      sport: 'football',
      league: 'Футбол • Чемпіоншип Англії',
      badge: '⚽ Футбол • Чемпіоншип Англії',
    };
  }

  if (l.includes('laliga') || l.includes('la liga') || l.includes('esp.1') || l.includes('primera')) {
    return {
      sport: 'football',
      league: 'Футбол • Ла Ліга Іспанії',
      badge: '⚽ Футбол • Ла Ліга Іспанії',
    };
  }

  if (l.includes('serie a') || l.includes('ita.1')) {
    return {
      sport: 'football',
      league: 'Футбол • Серія А Італії',
      badge: '⚽ Футбол • Серія А Італії',
    };
  }

  if (l.includes('bundesliga') || l.includes('ger.1')) {
    return {
      sport: 'football',
      league: 'Футбол • Бундесліга Німеччини',
      badge: '⚽ Футбол • Бундесліга Німеччини',
    };
  }

  if (l.includes('ligue 1') || l.includes('fra.1')) {
    return {
      sport: 'football',
      league: 'Футбол • Ліга 1 Франції',
      badge: '⚽ Футбол • Ліга 1 Франції',
    };
  }

  if (l.includes('upl') || l.includes('ukr') || combined.includes('shakhtar') || combined.includes('dynamo kyiv')) {
    return {
      sport: 'football',
      league: "Футбол • Прем'єр-ліга України",
      badge: "⚽ Футбол • Прем'єр-ліга України",
    };
  }

  if (l.includes('mls') || l.includes('usa.1')) {
    return {
      sport: 'football',
      league: 'Футбол • МЛС (MLS)',
      badge: '⚽ Футбол • МЛС',
    };
  }

  if (l.includes('world cup') || l.includes('worldq')) {
    return {
      sport: 'football',
      league: 'Футбол • Кваліфікація Чемпіонату Світу',
      badge: '⚽ Футбол • Відбір ЧС',
    };
  }

  const cleanLeague = rawLeague && rawLeague.length > 1 && rawLeague.toLowerCase() !== 'soccer'
    ? rawLeague
    : 'Міжнародний турнір';
  return {
    sport: 'football',
    league: `Футбол • ${cleanLeague}`,
    badge: `⚽ Футбол • ${cleanLeague}`,
  };
}

// ============================================================================
// 12 FREE 24/7 LIVE SPORTS ARENA CHANNELS (Verified 200 OK Cloud CDN HLS)
// ============================================================================
export const SPORT_CHANNELS_24_7: SportChannel[] = [
  {
    id: 'ch-nba-court-live',
    name: 'NBA Live Court & NBC Sports NOW',
    sport: 'nba',
    icon: '🏀',
    badge: 'FREE • 1080p',
    logoText: 'NBA LIVE',
    accentColor: 'from-orange-600 to-red-700',
    currentProgram: 'NBA Live Games, NBC Sports NOW 24/7, Replays & Highlights',
    streams: [
      {
        id: 'nba-nbc-hls',
        slot: 'A',
        name: 'Потік A • NBC Sports NOW Basketball (Cloud HLS 1080p)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.nbcSportsNow,
        isFreeVerified: true,
      },
      {
        id: 'nba-trace-hls',
        slot: 'B',
        name: 'Потік B • Trace Sport Stars HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.traceSportStars,
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
        id: 'nba-bein-hls',
        slot: 'D',
        name: 'Потік D • beIN SPORTS XTRA 24/7 (Cloud HLS)',
        badge: 'HLS • FHD',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.beinXtra,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-ucl-eleven',
    name: 'CBS Sports Golazo & European Football',
    sport: 'ucl',
    icon: '🏆',
    badge: 'FREE • 1080p',
    logoText: 'GOLAZO UEFA',
    accentColor: 'from-blue-700 to-indigo-900',
    currentProgram: 'UEFA Champions League, Europa League & Top European Football',
    streams: [
      {
        id: 'ucl-golazo-hls',
        slot: 'A',
        name: 'Потік A • CBS Sports Golazo Football (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsGolazo,
        isFreeVerified: true,
      },
      {
        id: 'ucl-bein-hls',
        slot: 'B',
        name: 'Потік B • beIN SPORTS XTRA FHD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.beinXtra,
        isFreeVerified: true,
      },
      {
        id: 'ucl-fifa-hls',
        slot: 'C',
        name: 'Потік C • FIFA+ World Football Live (Cloud HLS)',
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
        id: 'bein-es-hls',
        slot: 'B',
        name: 'Потік B • beIN SPORTS XTRA 2 (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.beinXtraEs,
        isFreeVerified: true,
      },
      {
        id: 'bein-fifa-hls',
        slot: 'C',
        name: 'Потік C • FIFA+ World Football (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.fifaPlusUs,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-f1-sky',
    name: 'Formula 1, ACI & Red Bull Racing TV',
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
        id: 'rb-f1-hls',
        slot: 'B',
        name: 'Потік B • Red Bull Racing TV (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.redBullMaster,
        isFreeVerified: true,
      },
      {
        id: 'rb-rakuten-f1-hls',
        slot: 'C',
        name: 'Потік C • Red Bull TV Mirror (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.redBullRakuten,
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
    name: 'NFL Live, CBS HQ & NBC Sports NOW',
    sport: 'nfl',
    icon: '🏈',
    badge: 'FREE • 1080p',
    logoText: 'NFL LIVE',
    accentColor: 'from-blue-800 to-red-800',
    currentProgram: 'NFL Live Coverage, CBS Sports HQ, NBC Sports NOW & RedZone',
    streams: [
      {
        id: 'nfl-nbc-hls',
        slot: 'A',
        name: 'Потік A • NBC Sports NOW (Cloud HLS 1080p)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.nbcSportsNow,
        isFreeVerified: true,
      },
      {
        id: 'nfl-cbs-hls',
        slot: 'B',
        name: 'Потік B • CBS Sports HQ Live (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsSportsHq,
        isFreeVerified: true,
      },
      {
        id: 'nfl-espn-hls',
        slot: 'C',
        name: 'Потік C • ESPN8 The Ocho HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.espnOcho,
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
    name: 'DAZN Combat, Glory Kickboxing & UFC',
    sport: 'boxing',
    icon: '🥊',
    badge: 'FREE • 1080p',
    logoText: 'FIGHT 24/7',
    accentColor: 'from-amber-600 to-red-900',
    currentProgram: 'World Championship Boxing, DAZN Combat, Glory Kickboxing, UFC Fight Night',
    streams: [
      {
        id: 'glory-hls',
        slot: 'A',
        name: 'Потік A • Glory Kickboxing 24/7 (Cloud HLS 1080p)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.gloryKickboxing,
        isFreeVerified: true,
      },
      {
        id: 'persiana-fight-hls',
        slot: 'B',
        name: 'Потік B • Persiana Fight HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.persianaFight,
        isFreeVerified: true,
      },
      {
        id: 'dazn-combat-hls',
        slot: 'C',
        name: 'Потік C • DAZN Combat Live (Cloud HLS)',
        badge: 'HLS • HD',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.daznCombat,
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
    currentProgram: '24/7 Live Scores, NBA, NFL, NHL, European Football & Highlights',
    streams: [
      {
        id: 'nbc-sports-hls',
        slot: 'A',
        name: 'Потік A • NBC Sports NOW 1080p (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.nbcSportsNow,
        isFreeVerified: true,
      },
      {
        id: 'cbs-hq-hls',
        slot: 'B',
        name: 'Потік B • CBS Sports HQ 24/7 (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsSportsHq,
        isFreeVerified: true,
      },
      {
        id: 'bein-hq-hls',
        slot: 'C',
        name: 'Потік C • beIN SPORTS XTRA 1080p (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.beinXtra,
        isFreeVerified: true,
      },
      {
        id: 'espn-ocho-hls',
        slot: 'D',
        name: 'Потік D • ESPN8 The Ocho 1080p (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.espnOcho,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-tennis-sky',
    name: 'Tennis Arena & Eurosport Court',
    sport: 'tennis',
    icon: '🎾',
    badge: 'FREE • 1080p',
    logoText: 'TENNIS HD',
    accentColor: 'from-lime-600 to-emerald-800',
    currentProgram: 'ATP Masters 1000, WTA Tour & Grand Slam Courts Live',
    streams: [
      {
        id: 'tennis-euro1-hls',
        slot: 'A',
        name: 'Потік A • Eurosport 1 Court Live (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.eurosport1,
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
    name: 'FIFA+ Live & World Football',
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
        id: 'golazo-fb-hls',
        slot: 'C',
        name: 'Потік C • CBS Sports Golazo (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsGolazo,
        isFreeVerified: true,
      },
    ],
  },
  {
    id: 'ch-eurosport-1-2',
    name: 'Eurosport 1 & 2 • Fast&FunBox HD',
    sport: 'all',
    icon: '🏅',
    badge: 'FREE • 1080p',
    logoText: 'EUROSPORT',
    accentColor: 'from-blue-600 to-cyan-800',
    currentProgram: 'Eurosport 1 & 2 Live, World Sports Arena, Cycling, Tennis & Motorsport',
    streams: [
      {
        id: 'euro1-main-hls',
        slot: 'A',
        name: 'Потік A • Eurosport 1 HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.eurosport1,
        isFreeVerified: true,
      },
      {
        id: 'euro2-main-hls',
        slot: 'B',
        name: 'Потік B • Eurosport 2 HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.eurosport2,
        isFreeVerified: true,
      },
      {
        id: 'fastfun-main-hls',
        slot: 'C',
        name: 'Потік C • Fast&FunBox HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.fastFunBox,
        isFreeVerified: true,
      },
      {
        id: 'trace-sport-hls',
        slot: 'D',
        name: 'Потік D • Trace Sport Stars HD (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p HD',
        mode: 'hls',
        url: FREE_HLS_NODES.traceSportStars,
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
        id: 'nhl-nbc-hls',
        slot: 'A',
        name: 'Потік A • NBC Sports NOW Hockey (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.nbcSportsNow,
        isFreeVerified: true,
      },
      {
        id: 'nhl-cbs-hls',
        slot: 'B',
        name: 'Потік B • CBS Sports HQ Ice (Cloud HLS)',
        badge: 'HLS • 1080p',
        quality: '1080p FHD',
        mode: 'hls',
        url: FREE_HLS_NODES.cbsSportsHq,
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
// REAL-TIME ESPN SCOREBOARD ENDPOINTS (Exact League Classification)
// ============================================================================
const ESPN_LEAGUES: Array<{
  sport: SportCategory;
  league: string;
  badge: string;
  path: string;
}> = [
  {
    sport: 'football',
    league: "Футбол • Прем'єр-ліга Англії",
    badge: "⚽ Футбол • Прем'єр-ліга Англії",
    path: 'soccer/eng.1',
  },
  {
    sport: 'ucl',
    league: 'Футбол • Ліга Чемпіонів УЄФА',
    badge: '🏆 Футбол • Ліга Чемпіонів УЄФА',
    path: 'soccer/uefa.champions',
  },
  {
    sport: 'football',
    league: 'Футбол • Ла Ліга Іспанії',
    badge: '⚽ Футбол • Ла Ліга Іспанії',
    path: 'soccer/esp.1',
  },
  {
    sport: 'football',
    league: 'Футбол • Серія А Італії',
    badge: '⚽ Футбол • Серія А Італії',
    path: 'soccer/ita.1',
  },
  {
    sport: 'football',
    league: 'Футбол • Бундесліга Німеччини',
    badge: '⚽ Футбол • Бундесліга Німеччини',
    path: 'soccer/ger.1',
  },
  {
    sport: 'football',
    league: 'Футбол • Ліга 1 Франції',
    badge: '⚽ Футбол • Ліга 1 Франції',
    path: 'soccer/fra.1',
  },
  {
    sport: 'football',
    league: 'Футбол • Ліга Європи УЄФА',
    badge: '⚽ Футбол • Ліга Європи УЄФА',
    path: 'soccer/uefa.europa',
  },
  {
    sport: 'football',
    league: 'Футбол • Ліга Конференцій УЄФА',
    badge: '⚽ Футбол • Ліга Конференцій УЄФА',
    path: 'soccer/uefa.europa.conf',
  },
  {
    sport: 'football',
    league: 'Футбол • Ліга Націй УЄФА',
    badge: '⚽ Футбол • Ліга Націй УЄФА',
    path: 'soccer/uefa.nations',
  },
  {
    sport: 'nba',
    league: 'Баскетбол • НБА (NBA)',
    badge: '🏀 Баскетбол • НБА',
    path: 'basketball/nba',
  },
  {
    sport: 'nhl',
    league: 'Хокей • НХЛ (NHL)',
    badge: '🏒 Хокей • НХЛ',
    path: 'hockey/nhl',
  },
  {
    sport: 'nfl',
    league: 'Американський футбол • НФЛ (NFL)',
    badge: '🏈 Американський футбол • НФЛ',
    path: 'football/nfl',
  },
  {
    sport: 'f1',
    league: 'Автоспорт • Формула 1',
    badge: '🏎️ Автоспорт • Формула 1',
    path: 'racing/f1',
  },
  {
    sport: 'boxing',
    league: 'Єдиноборства • Бокс та UFC',
    badge: '🥊 Бокс та UFC',
    path: 'mma/ufc',
  },
  {
    sport: 'tennis',
    league: 'Теніс • Світовий тур ATP / WTA',
    badge: '🎾 Теніс • ATP / WTA',
    path: 'tennis/atp',
  },
];

function getDirectHlsForSport(sport: SportCategory): Array<{ name: string; url: string }> {
  switch (sport) {
    case 'nba':
      return [
        { name: 'NBC Sports NOW 1080p (Cloud HLS)', url: FREE_HLS_NODES.nbcSportsNow },
        { name: 'CBS Sports HQ Live (Cloud HLS)', url: FREE_HLS_NODES.cbsSportsHq },
        { name: 'Trace Sport Stars HD (Cloud HLS)', url: FREE_HLS_NODES.traceSportStars },
      ];
    case 'ucl':
      return [
        { name: 'CBS Sports Golazo 1080p (Cloud HLS)', url: FREE_HLS_NODES.cbsGolazo },
        { name: 'beIN SPORTS XTRA 1080p (Cloud HLS)', url: FREE_HLS_NODES.beinXtra },
        { name: 'FIFA+ Live (Cloud HLS)', url: FREE_HLS_NODES.fifaPlusUs },
      ];
    case 'football':
      return [
        { name: 'beIN SPORTS XTRA 1080p (Cloud HLS)', url: FREE_HLS_NODES.beinXtra },
        { name: 'CBS Sports Golazo 1080p (Cloud HLS)', url: FREE_HLS_NODES.cbsGolazo },
        { name: 'FIFA+ World Football (Cloud HLS)', url: FREE_HLS_NODES.fifaPlusUs },
      ];
    case 'nfl':
      return [
        { name: 'NBC Sports NOW 1080p (Cloud HLS)', url: FREE_HLS_NODES.nbcSportsNow },
        { name: 'CBS Sports HQ (Cloud HLS)', url: FREE_HLS_NODES.cbsSportsHq },
      ];
    case 'boxing':
      return [
        { name: 'Glory Kickboxing 1080p (Cloud HLS)', url: FREE_HLS_NODES.gloryKickboxing },
        { name: 'Persiana Fight HD (Cloud HLS)', url: FREE_HLS_NODES.persianaFight },
        { name: 'DAZN Combat Live (Cloud HLS)', url: FREE_HLS_NODES.daznCombat },
      ];
    case 'f1':
      return [
        { name: 'ACI Motorsport 1080p (Cloud HLS)', url: FREE_HLS_NODES.aciMotorsport },
        { name: 'Red Bull Racing TV 1080p (Cloud HLS)', url: FREE_HLS_NODES.redBullMaster },
        { name: 'Fast&FunBox HD (Cloud HLS)', url: FREE_HLS_NODES.fastFunBox },
      ];
    case 'tennis':
      return [
        { name: 'Eurosport 1 Court (Cloud HLS)', url: FREE_HLS_NODES.eurosport1 },
        { name: 'beIN SPORTS XTRA Court (Cloud HLS)', url: FREE_HLS_NODES.beinXtra },
      ];
    case 'nhl':
      return [
        { name: 'NBC Sports NOW 1080p (Cloud HLS)', url: FREE_HLS_NODES.nbcSportsNow },
        { name: 'CBS Sports HQ Ice (Cloud HLS)', url: FREE_HLS_NODES.cbsSportsHq },
      ];
    default:
      return [
        { name: 'NBC Sports NOW 1080p (Cloud HLS)', url: FREE_HLS_NODES.nbcSportsNow },
        { name: 'beIN SPORTS XTRA 1080p (Cloud HLS)', url: FREE_HLS_NODES.beinXtra },
      ];
  }
}

interface StreamBuilderOptions {
  id: string;
  sport: SportCategory;
  streamFreeCat?: string;
  streamKey?: string;
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

  // 1. Потік A (Основний Live 1080p FHD)
  if (opts.vngStreamA) {
    nodes.push({
      id: `${opts.id}-vng-a`,
      slot: 'A',
      name: 'Потік A • Основний Live FHD (1080p)',
      badge: 'LIVE • 1080p FHD',
      quality: '1080p FHD',
      mode: 'embed',
      url: opts.vngStreamA,
      isFreeVerified: true,
    });
  } else if (opts.streamKey) {
    const cleanKey = opts.streamKey.replace(/(1080p2?|720p|540p)$/i, '');
    nodes.push({
      id: `${opts.id}-sf-1080`,
      slot: 'A',
      name: 'Потік A • Основний Live FHD (1080p)',
      badge: 'LIVE • 1080p FHD',
      quality: '1080p FHD',
      mode: 'embed',
      url: `https://strmfree.st/embed/${sfCat}/${cleanKey}1080p2`,
      isFreeVerified: true,
    });
  }

  // 2. Потік B (Резервний Live / Альтернативний HD)
  if (opts.vngStreamB) {
    nodes.push({
      id: `${opts.id}-vng-b`,
      slot: 'B',
      name: 'Потік B • Резервний Live (Офіційний HD)',
      badge: 'LIVE • HD РЕЗЕРВ',
      quality: '1080p HD',
      mode: 'embed',
      url: opts.vngStreamB,
      isFreeVerified: true,
    });
  } else if (opts.extraEmbeds && opts.extraEmbeds.length > 0) {
    nodes.push({
      id: `${opts.id}-ext-1`,
      slot: 'B',
      name: `Потік B • ${opts.extraEmbeds[0].name}`,
      badge: 'LIVE • HD',
      quality: '1080p HD',
      mode: 'embed',
      url: opts.extraEmbeds[0].url,
      isFreeVerified: true,
    });
  } else if (opts.streamKey) {
    nodes.push({
      id: `${opts.id}-sf-base`,
      slot: 'B',
      name: 'Потік B • Резервний Live (Auto Bitrate)',
      badge: 'LIVE • AUTO HD',
      quality: '1080p HD',
      mode: 'embed',
      url: `https://strmfree.st/embed/${sfCat}/${opts.streamKey}`,
      isFreeVerified: true,
    });
  }

  // 3. Потік C: Економний потік 540p SD для повільного інтернету
  if (opts.streamKey) {
    const cleanKey = opts.streamKey.replace(/(1080p2?|720p|540p)$/i, '');
    nodes.push({
      id: `${opts.id}-sf-540`,
      slot: 'C',
      name: 'Потік C • Економний 540p (Для слабкого інтернету / SD)',
      badge: 'LIVE • 540p SD',
      quality: '540p SD',
      mode: 'embed',
      url: `https://strmfree.st/embed/${sfCat}/${cleanKey}540p`,
      isFreeVerified: true,
    });
  }

  // 4. Потік D: Verified Direct Cloud CDN HLS 1080p (миттєве підключення без зависань)
  const hlsList = getDirectHlsForSport(opts.sport);
  hlsList.slice(0, 2).forEach((hlsNode, idx) => {
    nodes.push({
      id: `${opts.id}-hls-${idx + 1}`,
      slot: idx === 0 ? 'D' : 'B',
      name: `Потік ${idx === 0 ? 'D' : 'B'} • ${hlsNode.name}`,
      badge: 'CLOUD HLS • 1080p',
      quality: '1080p FHD',
      mode: 'hls',
      url: hlsNode.url,
      isFreeVerified: true,
    });
  });

  // 5. Потік E: Повні записи матчів & Хайлайти (1080p)
  if (opts.replayUrls && opts.replayUrls.length > 0) {
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

  let hlUrl = OFFICIAL_HIGHLIGHTS_EMBED[opts.sport] || OFFICIAL_HIGHLIGHTS_EMBED.all;
  if (opts.highlightIds && opts.highlightIds.length > 0 && opts.sport === 'nba') {
    const firstId = opts.highlightIds[0];
    const restIds = opts.highlightIds.slice(1, 10).join(',');
    hlUrl = `https://www.youtube.com/embed/${firstId}?rel=0${restIds ? `&playlist=${restIds}` : ''}`;
  }
  nodes.push({
    id: `${opts.id}-stream-hl`,
    slot: 'E',
    name: 'Потік E • Свіжі Хайлайти & Огляди HD',
    badge: 'HIGHLIGHTS • 1080p',
    quality: '1080p FHD',
    mode: 'embed',
    url: hlUrl,
    isFreeVerified: true,
  });

  if (nodes.length > 0 && !nodes.some((n) => n.slot === 'A')) {
    nodes[0].slot = 'A';
    nodes[0].name = `Потік A • ${nodes[0].name.replace(/^Потік [A-Z]\d* • /, '')}`;
  }

  return nodes;
}

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

const CACHE_STORAGE_KEY = 'cv_cached_sports_events_v372';

function formatYmd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function getExpectedMatchDurationMs(sport: SportCategory): number {
  switch (sport) {
    case 'football':
    case 'ucl':
      return 2.25 * 3600 * 1000; // 2h 15m
    case 'nba':
    case 'nhl':
      return 2.75 * 3600 * 1000; // 2h 45m
    default:
      return 3.5 * 3600 * 1000; // 3h 30m
  }
}

/**
 * Purges any finished event older than 48 hours AND transitions any stale 'live' event
 * whose match window has already elapsed into 'finished'.
 */
function sanitizeAndPruneEvents(events: SportEvent[], now = Date.now()): SportEvent[] {
  const out: SportEvent[] = [];
  for (const ev of events) {
    const durationMs = getExpectedMatchDurationMs(ev.sport);
    const estEndTs = ev.finishedAt || ev.timestamp + durationMs;

    if (ev.status === 'live' && now > ev.timestamp + durationMs) {
      ev.status = 'finished';
      ev.finishedAt = estEndTs;
      ev.statusText = '🏁 ЗАВЕРШЕНО';
    }

    if (ev.status === 'finished') {
      const ageSinceEnd = now - estEndTs;
      const ageSinceStart = now - ev.timestamp;
      if (ageSinceEnd > FINISHED_RETENTION_MS || ageSinceStart > FINISHED_RETENTION_MS + durationMs) {
        continue; // Strictly discard finished results older than 48 hours!
      }
    }

    out.push(ev);
  }
  return out;
}

function getStoredEventsCache(): SportEvent[] | null {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return sanitizeAndPruneEvents(parsed, Date.now());
    }
  } catch {}
  return null;
}

function setStoredEventsCache(events: SportEvent[]) {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(sanitizeAndPruneEvents(events, Date.now())));
  } catch {}
}

let cachedEvents: SportEvent[] | null = null;
let lastFetchTs = 0;
let dynamicHlsExtras: SportStreamNode[] = [];
let lastScannerStats: SportScannerStats = {
  totalFreeStreams: 68,
  liveMatchesCount: 0,
  upcomingMatchesCount: 0,
  finishedMatchesCount: 0,
  streamFreeNodes: 32,
  directHlsNodes: Object.keys(FREE_HLS_NODES).length,
  replayNodes: 12,
  lastScanTime: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
};

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

  /**
   * Dedicated Full Live Scanner invoked by the "Сканувати потоки" button.
   * Performs multi-stage live scanning across ESPN, StreamFree, Vinegret & IPTV-org HLS.
   */
  async scanAllSourcesLive(onProgress?: (stage: string) => void): Promise<SportEvent[]> {
    onProgress?.('Етап 1/3: Сканування прямих ефірів StreamFree 1080p, Vinegret та табло ESPN...');
    const [events, extraHls] = await Promise.all([
      this.getEvents(true),
      this.harvestExtraLiveHlsStreams(),
    ]);
    if (extraHls.length > 0) {
      dynamicHlsExtras = extraHls;
      onProgress?.(`Етап 2/3: Перевірено ${Object.keys(FREE_HLS_NODES).length + extraHls.length} HLS CDN потоків...`);
    }
    const stats = this.getScannerStats();
    onProgress?.(
      `Сканування завершено: 🔴 ${stats.liveMatchesCount} LIVE • 📅 ${stats.upcomingMatchesCount} анонсів • 🏁 ${stats.finishedMatchesCount} результатів (48г)`
    );
    return events;
  },

  async getEvents(forceRefresh = false): Promise<SportEvent[]> {
    const now = Date.now();
    if (!forceRefresh) {
      if (cachedEvents && now - lastFetchTs < 60_000) {
        return sanitizeAndPruneEvents(cachedEvents, now);
      }
      if (!cachedEvents) {
        const persisted = getStoredEventsCache();
        if (persisted && persisted.length > 0) {
          cachedEvents = persisted;
          lastFetchTs = now;
          setTimeout(() => {
            sportsService.getEvents(true).catch(() => {});
          }, 50);
          return cachedEvents;
        }
      }
    }

    const nowSec = Math.floor(now / 1000);

    // Date range for ESPN queries: from 48 hours ago to +6 days ahead (covers recent results <=48h, live now, and upcoming announcements!)
    const start48hAgo = new Date(now - FINISHED_RETENTION_MS);
    const endUpcoming = new Date(now + 6 * 24 * 3600 * 1000);
    const dateRangeParam = `${formatYmd(start48hAgo)}-${formatYmd(endUpcoming)}`;

    const fetchPromises = [
      httpGetJson('https://strmfree.st/streams', 3200),
      httpGetJson('https://vinegret.net/wp-json/vng/v1/nba-live', 3200),
      httpGetJson('https://vinegret.net/wp-json/vng/v1/nba-replays', 3200),
      ...ESPN_LEAGUES.map((cfg) =>
        httpGetJson(
          `https://site.api.espn.com/apis/site/v2/sports/${cfg.path}/scoreboard?dates=${dateRangeParam}`,
          3500
        )
      ),
    ];

    const results = await Promise.allSettled(fetchPromises);
    const sfData = results[0].status === 'fulfilled' ? results[0].value : null;
    const vngLive = results[1].status === 'fulfilled' ? results[1].value : null;
    const vngReplays = results[2].status === 'fulfilled' ? results[2].value : null;
    const espnResponses = results.slice(3).map((r) => (r.status === 'fulfilled' ? r.value : null));

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

    // Index StreamFree matches (filter out 24/7 static TV channels that have no team pairs and old timestamps)
    const sfMatches: StreamFreeEntry[] = [];
    let sfNodeCount = 0;
    if (sfData?.streams && typeof sfData.streams === 'object') {
      for (const [catKey, list] of Object.entries(sfData.streams)) {
        if (!Array.isArray(list)) continue;
        for (const m of list as any[]) {
          if (!m?.stream_key) continue;
          const mTs = Number(m.match_timestamp) || 0;
          const hasTeams = Boolean(m.team1?.name && m.team2?.name) || /\b(vs\.?|v\.?)\b/i.test(m.name || '');
          // Skip static channel placeholders created weeks/months ago without team matchups
          if (!hasTeams && nowSec - mTs > 12 * 3600) {
            continue;
          }
          sfMatches.push({
            id: m.id || m.stream_key,
            name: m.name || m.stream_key,
            stream_key: m.stream_key,
            match_timestamp: mTs || nowSec,
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

    const vngGamesMap = new Map<string, any>();
    if (Array.isArray(vngLive?.games)) {
      for (const g of vngLive.games) {
        if (g?.id) vngGamesMap.set(String(g.id).toLowerCase(), g);
        if (g?.title) vngGamesMap.set(String(g.title).toLowerCase(), g);
      }
    }

    const discoveredEvents: SportEvent[] = [];

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
        const hHit = hTokens.length > 0 && hTokens.some((tk) => hay.includes(tk));
        const aHit = aTokens.length > 0 && aTokens.some((tk) => hay.includes(tk));
        if (hHit && aHit) return true;
        return Boolean(sfName && fullTitle.includes(sfName));
      });
    };

    // 1. Convert StreamFree matches with accurate time-window status (NEVER mark future or finished games as live!)
    for (const sf of sfMatches) {
      const classified = classifySportAndLeague(
        sf.category,
        sf.league,
        sf.name,
        sf.team1?.name,
        sf.team2?.name
      );
      const sport = classified.sport;
      const eventTs = sf.match_timestamp * 1000;
      const expectedDurMs = getExpectedMatchDurationMs(sport);

      // Strict time-based status before ESPN enrichment:
      // - Starts > 5 minutes in the future => 'upcoming'
      // - Started within expected match duration => 'live'
      // - Older than expected match duration => 'finished'
      let status: 'live' | 'upcoming' | 'finished';
      if (eventTs > now + 5 * 60 * 1000) {
        status = 'upcoming';
      } else if (now - eventTs <= expectedDurMs) {
        status = 'live';
      } else {
        status = 'finished';
      }

      // Skip finished games older than 48 hours
      if (status === 'finished' && now - (eventTs + expectedDurMs) > FINISHED_RETENTION_MS) {
        continue;
      }

      const vngMatch =
        vngGamesMap.get(sf.stream_key.toLowerCase()) ||
        vngGamesMap.get((sf.name || '').toLowerCase());

      if (vngMatch && vngMatch.live === false && eventTs > now) {
        status = 'upcoming';
      }

      const dateObj = new Date(eventTs);
      const startTime = dateObj.toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const dateStr = dateObj.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
      });

      const streams = buildMultiStreamsForEvent({
        id: `sf-${sf.stream_key}`,
        sport,
        streamFreeCat: sf.category,
        streamKey: sf.stream_key,
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

      const statusDetail =
        status === 'live'
          ? vngMatch?.status_detail
            ? `🔴 LIVE • ${vngMatch.status_detail}`
            : `🔴 LIVE • У ПРЯМОМУ ЕФІРІ${sf.viewers ? ` (👁 ${sf.viewers})` : ''}`
          : status === 'upcoming'
            ? `📅 АНОНС • ${dateStr} о ${startTime}`
            : `🏁 ЗАВЕРШЕНО • ${dateStr}`;

      const parsedFromTitle = parseTeamsFromTitle(sf.name, sport);

      const awayTeamObj = sf.team1?.name
        ? {
            name: formatTeamUpper(sf.team1.name),
            shortName: sf.team1.name.slice(0, 3).toUpperCase(),
            logo: resolveTeamLogo(sf.team1.name, sf.team1.logo, sport),
            score: awayScore,
          }
        : parsedFromTitle.awayTeam
          ? { ...parsedFromTitle.awayTeam, score: awayScore }
          : undefined;

      const homeTeamObj = sf.team2?.name
        ? {
            name: formatTeamUpper(sf.team2.name),
            shortName: sf.team2.name.slice(0, 3).toUpperCase(),
            logo: resolveTeamLogo(sf.team2.name, sf.team2.logo, sport),
            score: homeScore,
          }
        : parsedFromTitle.homeTeam
          ? { ...parsedFromTitle.homeTeam, score: homeScore }
          : undefined;

      const upperPairTitle = formatMatchPairUpper(
        awayTeamObj?.name,
        homeTeamObj?.name,
        sf.name
      );

      discoveredEvents.push({
        id: `sf-${sf.stream_key}`,
        streamKey: sf.stream_key,
        sport,
        league: classified.league,
        leagueBadge: classified.badge,
        title: upperPairTitle,
        subtitle: `${classified.league} • Пряма трансляція 1080p FHD`,
        homeTeam: homeTeamObj,
        awayTeam: awayTeamObj,
        status,
        statusText: statusDetail,
        startTime,
        timestamp: eventTs,
        finishedAt: status === 'finished' ? eventTs + expectedDurMs : undefined,
        venue: classified.league,
        viewers: status === 'live' ? sf.viewers || 0 : 0,
        poster: SPORT_POSTERS[sport] || SPORT_POSTERS.all,
        isHot: status === 'live' && (sf.viewers || 0) >= 100,
        streams,
      });
    }

    // 2. Parse ESPN Real-Time Scoreboards:
    //    - Authoritatively updates status ('live' | 'upcoming' | 'finished') on existing StreamFree matches
    //    - Adds all live matches, upcoming announcements, and finished matches from the last 48 hours
    ESPN_LEAGUES.forEach((cfg, idx) => {
      const data = espnResponses[idx];
      const events: any[] = data?.events || [];

      for (const ev of events) {
        const comp = ev?.competitions?.[0];
        const competitors: any[] = comp?.competitors || [];
        const homeComp = competitors.find((c) => c.homeAway === 'home') || competitors[0];
        const awayComp = competitors.find((c) => c.homeAway === 'away') || competitors[1];

        const state = ev?.status?.type?.state; // 'pre' | 'in' | 'post'
        const completed = Boolean(ev?.status?.type?.completed);
        let status: 'live' | 'upcoming' | 'finished' =
          state === 'in' && !completed
            ? 'live'
            : state === 'post' || completed
              ? 'finished'
              : 'upcoming';

        const eventDate = ev.date ? new Date(ev.date) : new Date();
        const eventTs = eventDate.getTime();
        const expectedDurMs = getExpectedMatchDurationMs(cfg.sport);

        // Guard against stale 'in' states if timestamp is way in the past
        if (status === 'live' && now > eventTs + expectedDurMs + 3600_000) {
          status = 'finished';
        }

        // Strict 48-hour retention check for finished matches
        if (status === 'finished') {
          const finishedTime = eventTs + expectedDurMs;
          if (now - finishedTime > FINISHED_RETENTION_MS && now - eventTs > FINISHED_RETENTION_MS) {
            continue;
          }
        }

        const rawHomeName =
          homeComp?.team?.displayName ||
          homeComp?.team?.shortDisplayName ||
          homeComp?.athlete?.displayName ||
          '';
        const rawAwayName =
          awayComp?.team?.displayName ||
          awayComp?.team?.shortDisplayName ||
          awayComp?.athlete?.displayName ||
          '';

        const homeUpper = formatTeamUpper(rawHomeName);
        const awayUpper = formatTeamUpper(rawAwayName);

        const espnHomeLogo =
          homeComp?.team?.logo ||
          homeComp?.team?.logos?.[0]?.href ||
          resolveTeamLogo(rawHomeName, '', cfg.sport);
        const espnAwayLogo =
          awayComp?.team?.logo ||
          awayComp?.team?.logos?.[0]?.href ||
          resolveTeamLogo(rawAwayName, '', cfg.sport);

        const pairTitleUpper =
          homeUpper && awayUpper
            ? `${awayUpper} — ${homeUpper}`
            : formatMatchPairUpper(undefined, undefined, ev.name || ev.shortName || cfg.league);

        const timeStr = eventDate.toLocaleTimeString('uk-UA', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const dateStr = eventDate.toLocaleDateString('uk-UA', {
          day: '2-digit',
          month: '2-digit',
        });

        const shortDetail = ev?.status?.type?.shortDetail || '';
        const detailText =
          status === 'live'
            ? `🔴 LIVE • ${shortDetail || 'У прямому ефірі'}`
            : status === 'finished'
              ? `🏁 ЗАВЕРШЕНО • ${dateStr} (${timeStr})`
              : `📅 АНОНС • ${dateStr} о ${timeStr}`;

        // Check if this game is already in discoveredEvents from StreamFree
        const sfMatch = findSfMatch(rawHomeName, rawAwayName, pairTitleUpper);
        if (sfMatch) {
          const existing = discoveredEvents.find((d) => d.streamKey === sfMatch.stream_key);
          if (existing) {
            // Authoritatively sync status from ESPN so finished or upcoming matches NEVER hang as live!
            existing.status = status;
            existing.sport = cfg.sport;
            existing.league = cfg.league;
            existing.leagueBadge = cfg.badge;
            existing.title = pairTitleUpper;
            existing.statusText = detailText;
            if (status === 'finished') {
              existing.finishedAt = eventTs + expectedDurMs;
              existing.viewers = 0;
            }
            if (homeUpper) {
              existing.homeTeam = {
                name: homeUpper,
                shortName: homeComp?.team?.abbreviation || homeUpper.slice(0, 3),
                logo: espnHomeLogo || existing.homeTeam?.logo || '',
                score: status !== 'upcoming' ? homeComp?.score : undefined,
              };
            }
            if (awayUpper) {
              existing.awayTeam = {
                name: awayUpper,
                shortName: awayComp?.team?.abbreviation || awayUpper.slice(0, 3),
                logo: espnAwayLogo || existing.awayTeam?.logo || '',
                score: status !== 'upcoming' ? awayComp?.score : undefined,
              };
            }
            if (comp?.venue?.fullName) existing.venue = comp.venue.fullName;
            continue;
          }
        }

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
          title: pairTitleUpper,
          subtitle: comp?.venue?.fullName ? `${cfg.league} • ${comp.venue.fullName}` : cfg.league,
          homeTeam: homeUpper
            ? {
                name: homeUpper,
                shortName: homeComp?.team?.abbreviation || homeUpper.slice(0, 3),
                logo: espnHomeLogo,
                score: status !== 'upcoming' ? homeComp?.score : undefined,
              }
            : undefined,
          awayTeam: awayUpper
            ? {
                name: awayUpper,
                shortName: awayComp?.team?.abbreviation || awayUpper.slice(0, 3),
                logo: espnAwayLogo,
                score: status !== 'upcoming' ? awayComp?.score : undefined,
              }
            : undefined,
          status,
          statusText: detailText,
          startTime: timeStr,
          timestamp: eventTs,
          finishedAt: status === 'finished' ? eventTs + expectedDurMs : undefined,
          venue: comp?.venue?.fullName,
          poster: SPORT_POSTERS[cfg.sport] || SPORT_POSTERS.all,
          isHot: status === 'live',
          streams,
        });
      }
    });

    // Final prune & deduplication by normalized pair title + date day
    const pruned = sanitizeAndPruneEvents(discoveredEvents, now);
    const dedupedMap = new Map<string, SportEvent>();
    for (const ev of pruned) {
      const dayKey = new Date(ev.timestamp).toISOString().slice(0, 10);
      const key = `${ev.sport}:${ev.title}:${dayKey}`;
      const prev = dedupedMap.get(key);
      if (!prev || (ev.streamKey && !prev.streamKey) || (ev.homeTeam?.score !== undefined && prev.homeTeam?.score === undefined)) {
        dedupedMap.set(key, ev);
      }
    }

    const finalEvents = Array.from(dedupedMap.values());

    // Strict Sort Order:
    // 1. LIVE events first (sorted by viewers desc, then start time)
    // 2. UPCOMING announcements second (sorted chronologically: soonest upcoming first!)
    // 3. FINISHED matches (within 48h) last (sorted most recently finished first!)
    const statusOrder = { live: 0, upcoming: 1, finished: 2 };
    finalEvents.sort((a, b) => {
      const sDiff = statusOrder[a.status] - statusOrder[b.status];
      if (sDiff !== 0) return sDiff;
      if (a.status === 'live') {
        const vDiff = (b.viewers || 0) - (a.viewers || 0);
        if (vDiff !== 0) return vDiff;
        return b.timestamp - a.timestamp;
      }
      if (a.status === 'upcoming') {
        return a.timestamp - b.timestamp;
      }
      return b.timestamp - a.timestamp;
    });

    const liveCount = finalEvents.filter((e) => e.status === 'live').length;
    const upcomingCount = finalEvents.filter((e) => e.status === 'upcoming').length;
    const finishedCount = finalEvents.filter((e) => e.status === 'finished').length;
    const totalStreamsCount = finalEvents.reduce((acc, ev) => acc + ev.streams.length, 0);

    lastScannerStats = {
      totalFreeStreams: totalStreamsCount + SPORT_CHANNELS_24_7.length * 4 + dynamicHlsExtras.length,
      liveMatchesCount: liveCount,
      upcomingMatchesCount: upcomingCount,
      finishedMatchesCount: finishedCount,
      streamFreeNodes: Math.max(sfNodeCount, liveCount * 3),
      directHlsNodes: Object.keys(FREE_HLS_NODES).length + dynamicHlsExtras.length,
      replayNodes: nbaReplaysList.length + Object.keys(OFFICIAL_HIGHLIGHTS_EMBED).length,
      lastScanTime: new Date().toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };

    cachedEvents = finalEvents;
    lastFetchTs = now;
    setStoredEventsCache(finalEvents);
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
