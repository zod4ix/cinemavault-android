import { MediaItem } from '../types/movie';

/**
 * Detects Russian and Soviet productions so they are NEVER displayed as posters on the main screen,
 * home rows, curated catalog, or category browsing in ANY language.
 *
 * They remain accessible ONLY when the user explicitly searches for them by title.
 */
export function isRussianOrSoviet(item: MediaItem): boolean {
  if (!item) return false;

  // 1. NEVER filter Ukrainian cinema or Ukrainian audio productions
  if (
    item.genres?.includes('Українське кіно') ||
    item.hasUkrainianAudio ||
    String(item.id).startsWith('dovbush') ||
    String(item.id).startsWith('kaidash') ||
    String(item.id).startsWith('pamfir') ||
    String(item.id).startsWith('mavka') ||
    String(item.id).startsWith('cyborgs') ||
    String(item.id).startsWith('luxembourg')
  ) {
    return false;
  }

  // 2. Check country field (from Cinemeta, IMDb, or TMDB)
  if (item.country) {
    const c = item.country.toLowerCase();
    if (
      c.includes('russia') ||
      c.includes('soviet') ||
      c.includes('ussr') ||
      c.includes('россия') ||
      c.includes('ссср') ||
      c.includes('росій')
    ) {
      return true;
    }
  }

  // 3. Check genres
  if (item.genres && item.genres.some((g) => /росій|радянськ|ссср|ussr/i.test(g))) {
    return true;
  }

  // 4. Known Soviet and Russian production studios
  const studioRegex =
    /(мосфильм|ленфильм|союзмультфильм|киностудия им\.? горького|гостелерадио ссср|базелевс|yellow,? black and white|ctb film company|кинокомпания ств|централ партнершип|тнт-телесеть)/i;
  if (
    studioRegex.test(item.overview || '') ||
    studioRegex.test(item.director || '')
  ) {
    return true;
  }

  // 5. Explicit Russian/Soviet franchise and film titles
  const titleRegex =
    /^(слово пацана|маша и медведь|смешарики|три богатыря|чебурашка|иван васильевич|бриллиантовая рука|операция .ы.|ирония судьбы|служебный роман|джентльмены удачи|кавказская пленница|брат\b|брат 2|бумер|бригада|улицы разбитих|улицы разбитых|глухарь|ликвидация|холоп|лед [123]|майор гром|вампиры средней полосы|кухня\b|отель элеон|интерны|реальные пацаны|физрук|непослушник|москва слезам не верит|любовь и голуби|белое солнце пустыни|семнадцать мгновений|место встречи изменить|особенности национальной|ночной дозор|дневной дозор|самый лучший фильм|горько\b|елки\b|богатырь)/i;

  if (
    titleRegex.test(item.title || '') ||
    titleRegex.test(item.originalTitle || '')
  ) {
    return true;
  }

  return false;
}
