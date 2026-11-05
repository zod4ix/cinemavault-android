export type SupportedLanguage = 'uk' | 'en' | 'pl' | 'es' | 'ru';

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  flag: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ru', name: 'Русский', flag: '🌐' },
];

export const translations = {
  uk: {
    // Header
    searchPlaceholder: 'Пошук фільмів, серіалів, аніме...',
    donateBtn: 'Донат автору',
    favoritesTitle: 'Обране',
    allTrends: 'Усі тренди',
    movies: 'Фільми',
    series: 'Серіали',
    cartoons: 'Мультфільми',
    anime: 'Аніме',
    hdr4k: '4K HDR',

    // Hero
    topRelease: 'Топ реліз 2024',
    watchNow: 'Дивитися',
    detailsAndEpisodes: 'Джерела та серії',
    inFavorites: 'В обране',
    min: 'хв',

    // Rows
    trendingRow: 'Зараз у тренді',
    trendingBadge: 'Гарячі релізи',
    ukrainianRow: '🇺🇦 Українське кіно та офіційний дубляж',
    ukrainianBadge: 'Рідна мова',
    seriesRow: 'Найкращі серіали з новими серіями',
    seriesBadge: 'Сезони 2024',
    hdrRow: 'Фільми у надвисокій якості 4K HDR',
    hdrBadge: 'Максимальний бітрейт',
    cartoonsRow: 'Мультфільми та сімейне кіно',
    cartoonsBadge: 'Для дітей та дорослих',
    animeRow: 'Світ Аніме',
    animeBadge: 'Японська анімація',

    // History
    continueWatching: 'Продовжити перегляд',
    savedPosition: 'Збережена позиція',
    watched: 'переглянуто',

    // Search & Favs
    searchResultsFor: 'Результати пошуку для:',
    found: 'знайдено',
    nothingFound: 'Нічого не знайдено за вашим запитом.',
    savedTitle: 'Мої збережені фільми та серіали',
    emptyFavorites: 'Ваш список обраного порожній. Додавайте фільми, натиснувши на сердечко!',

    // Details Modal
    movie: 'Фільм',
    tvSeries: 'Серіал',
    cartoon: 'Мультфільм',
    animeLabel: 'Аніме',
    voiced: 'Озвучено',
    votes: 'голосів',
    year: 'рік',
    tabEpisodes: 'Серії та Сезони',
    tabOnline: 'Онлайн (HDRezka & Дзеркала)',
    tabTorrents: 'Торренти (Hurtom / Rutor)',
    autoSearchNotice: 'Автоматичний пошук по найкращих CDN з перевіркою швидкості:',
    ping: 'Відгук',
    working100: '100% працездатне',
    download: 'Скачати',
    downloaded: 'Завантажено ✓',
    audioTracks: 'Озвучки:',
    availableQuality: 'Доступна якість:',
    torrentsTip: 'Торренти онлайн: максимальний бітрейт, оригінальний 4K HDR, об\'ємний звук Dolby Atmos / 5.1 без втрати якості.',
    seeds: 'сідів',
    size: 'Розмір:',
    copied: 'Скопійовано!',
    streaming: 'Стрімінг',

    // Player
    audioTrackMenu: 'Озвучка / Переклад',
    qualityMenu: 'Якість відео',
    rewind10: 'Назад на 10 сек',
    forward10: 'Вперед на 10 сек',
    seasonAbbr: 'сезон',
    episodeAbbr: 'серія',

    // Donate Modal
    donateHeader: 'Підтримати проєкт',
    forOurs: 'Для своїх',
    donateSubtitle: 'Підтримка дзеркал, швидкісних CDN та оновлення бази контенту',
    freeCinemaNotice: '100% вільний кінотеатр без настирливої реклами: Усі донати йдуть виключно на оренду швидкісних проксі, підтримку автономних парсерів і постійний доступ до найкращих озвучок та 4K релізів.',
    selectCrypto: 'Оберіть криптовалюту:',
    network: 'Мережа',
    scanQrHelp: 'Відскануйте QR-код мобільним додатком біржі або криптогаманця:',
    addressForTransfer: 'Адреса для переказу:',
    clickToCopy: 'Натисніть для копіювання',
    memoRequired: 'MEMO / Destination Tag (ОБОВ\'ЯЗКОВО ДЛЯ ЗАРАХУВАННЯ):',
    copyAddress: 'Скопіювати адресу',
    copyMemo: 'Скопіювати MEMO',
    addressCopied: 'Адресу успішно скопійовано!',
    memoCopied: 'MEMO скопійовано!',
    donateFooter: 'Дякуємо за підтримку вільного україномовного кінематографу! 🇺🇦',
  },

  en: {
    // Header
    searchPlaceholder: 'Search movies, TV shows, anime...',
    donateBtn: 'Donate to Author',
    favoritesTitle: 'Favorites',
    allTrends: 'All Trending',
    movies: 'Movies',
    series: 'TV Series',
    cartoons: 'Cartoons',
    anime: 'Anime',
    hdr4k: '4K HDR',

    // Hero
    topRelease: 'Top 2024 Release',
    watchNow: 'Watch Now',
    detailsAndEpisodes: 'Sources & Episodes',
    inFavorites: 'To Favorites',
    min: 'min',

    // Rows
    trendingRow: 'Trending Now',
    trendingBadge: 'Hot Releases',
    ukrainianRow: '🇺🇦 Ukrainian Cinema & Official Dubs',
    ukrainianBadge: 'Native Dubs',
    seriesRow: 'Top TV Shows with New Episodes',
    seriesBadge: '2024 Seasons',
    hdrRow: 'Ultra High Definition 4K HDR',
    hdrBadge: 'Max Bitrate',
    cartoonsRow: 'Cartoons & Family Movies',
    cartoonsBadge: 'Family Time',
    animeRow: 'World of Anime',
    animeBadge: 'Japanese Animation',

    // History
    continueWatching: 'Continue Watching',
    savedPosition: 'Saved Timestamp',
    watched: 'watched',

    // Search & Favs
    searchResultsFor: 'Search results for:',
    found: 'found',
    nothingFound: 'Nothing found for your search query.',
    savedTitle: 'My Saved Movies & Shows',
    emptyFavorites: 'Your favorites list is empty. Add movies by tapping the heart icon!',

    // Details Modal
    movie: 'Movie',
    tvSeries: 'TV Series',
    cartoon: 'Cartoon',
    animeLabel: 'Anime',
    voiced: 'Voiced',
    votes: 'votes',
    year: 'year',
    tabEpisodes: 'Episodes & Seasons',
    tabOnline: 'Online (HDRezka & Mirrors)',
    tabTorrents: 'Torrents (Hurtom / Rutor)',
    autoSearchNotice: 'Auto-searching across best CDNs with latency check:',
    ping: 'Ping',
    working100: '100% Working',
    download: 'Download',
    downloaded: 'Downloaded ✓',
    audioTracks: 'Audio tracks:',
    availableQuality: 'Available quality:',
    torrentsTip: 'Torrents online: maximum bitrate, native 4K HDR, Dolby Atmos / 5.1 surround sound with zero compression.',
    seeds: 'seeds',
    size: 'Size:',
    copied: 'Copied!',
    streaming: 'Streaming',

    // Player
    audioTrackMenu: 'Audio Track / Language',
    qualityMenu: 'Video Quality',
    rewind10: 'Rewind 10s',
    forward10: 'Forward 10s',
    seasonAbbr: 'season',
    episodeAbbr: 'episode',

    // Donate Modal
    donateHeader: 'Support the Project',
    forOurs: 'Private Community',
    donateSubtitle: 'Funding uncensored mirrors, high-speed CDNs and daily database updates',
    freeCinemaNotice: '100% Free Cinema with Zero Ads: All donations go strictly towards high-speed proxies, autonomous scrapers, and uninterrupted access to 4K releases and all dubs.',
    selectCrypto: 'Select Cryptocurrency:',
    network: 'Network',
    scanQrHelp: 'Scan this QR code with your mobile crypto wallet or exchange app:',
    addressForTransfer: 'Transfer Address:',
    clickToCopy: 'Click to copy',
    memoRequired: 'MEMO / Destination Tag (STRICTLY REQUIRED FOR DEPOSIT):',
    copyAddress: 'Copy Address',
    copyMemo: 'Copy MEMO',
    addressCopied: 'Address copied to clipboard!',
    memoCopied: 'MEMO copied!',
    donateFooter: 'Thank you for supporting community cinema! 🍿',
  },

  pl: {
    // Header
    searchPlaceholder: 'Szukaj filmów, seriali, anime...',
    donateBtn: 'Wesprzyj autora',
    favoritesTitle: 'Ulubione',
    allTrends: 'Wszystkie trendy',
    movies: 'Filmy',
    series: 'Seriale',
    cartoons: 'Kreskówki',
    anime: 'Anime',
    hdr4k: '4K HDR',

    // Hero
    topRelease: 'Top premiera 2024',
    watchNow: 'Oglądaj teraz',
    detailsAndEpisodes: 'Źródła i odcinki',
    inFavorites: 'Do ulubionych',
    min: 'min',

    // Rows
    trendingRow: 'Teraz na czasie',
    trendingBadge: 'Gorące premiery',
    ukrainianRow: '🇺🇦 Kino ukraińskie i oficjalny dubbing',
    ukrainianBadge: 'Dubbing',
    seriesRow: 'Najlepsze seriale z nowymi odcinkami',
    seriesBadge: 'Sezony 2024',
    hdrRow: 'Filmy w najwyższej jakości 4K HDR',
    hdrBadge: 'Maksymalny bitrate',
    cartoonsRow: 'Kreskówki i kino rodzinne',
    cartoonsBadge: 'Dla rodziny',
    animeRow: 'Świat Anime',
    animeBadge: 'Japońska animacja',

    // History
    continueWatching: 'Kontynuuj oglądanie',
    savedPosition: 'Zapisana pozycja',
    watched: 'obejrzano',

    // Search & Favs
    searchResultsFor: 'Wyniki wyszukiwania dla:',
    found: 'znaleziono',
    nothingFound: 'Nic nie znaleziono dla Twojego zapytania.',
    savedTitle: 'Moje zapisane filmy i seriale',
    emptyFavorites: 'Twoja lista ulubionych jest pusta. Dodaj filmy klikając serduszko!',

    // Details Modal
    movie: 'Film',
    tvSeries: 'Serial',
    cartoon: 'Kreskówka',
    animeLabel: 'Anime',
    voiced: 'Lektor/Dubbing',
    votes: 'głosów',
    year: 'rok',
    tabEpisodes: 'Odcinki i Sezony',
    tabOnline: 'Online (HDRezka i mirrory)',
    tabTorrents: 'Torrenty (Hurtom / Rutor)',
    autoSearchNotice: 'Automatyczne wyszukiwanie po najlepszych CDN z testem prędkości:',
    ping: 'Ping',
    working100: '100% działające',
    download: 'Pobierz',
    downloaded: 'Pobrano ✓',
    audioTracks: 'Ścieżki dźwiękowe:',
    availableQuality: 'Dostępna jakość:',
    torrentsTip: 'Torrenty online: maksymalny bitrate, oryginalne 4K HDR, dźwięk Dolby Atmos / 5.1 bez kompresji.',
    seeds: 'seedów',
    size: 'Rozmiar:',
    copied: 'Skopiowano!',
    streaming: 'Streaming',

    // Player
    audioTrackMenu: 'Ścieżka dźwiękowa / Język',
    qualityMenu: 'Jakość wideo',
    rewind10: 'Wstecz 10 sek',
    forward10: 'W przód 10 sek',
    seasonAbbr: 'sezon',
    episodeAbbr: 'odcinek',

    // Donate Modal
    donateHeader: 'Wesprzyj projekt',
    forOurs: 'Dla swoich',
    donateSubtitle: 'Wsparcie mirrorów, szybkich CDN i codziennej aktualizacji bazy',
    freeCinemaNotice: '100% darmowe kino bez reklam: Wszystkie wpłaty idą wyłącznie na szybkie serwery, autonomiczne parsery i dostęp do wydań 4K.',
    selectCrypto: 'Wybierz kryptowalutę:',
    network: 'Sieć',
    scanQrHelp: 'Zeskanuj kod QR aplikacją swojego portfela lub giełdy:',
    addressForTransfer: 'Adres do wpłaty:',
    clickToCopy: 'Kliknij, aby skopiować',
    memoRequired: 'MEMO / Destination Tag (WYMAGANE DO KSIĘGOWANIA):',
    copyAddress: 'Kopiuj adres',
    copyMemo: 'Kopiuj MEMO',
    addressCopied: 'Adres został pomyślnie skopiowany!',
    memoCopied: 'MEMO skopiowane!',
    donateFooter: 'Dziękujemy za wsparcie wolnego kina! 🍿',
  },

  es: {
    // Header
    searchPlaceholder: 'Buscar películas, series, anime...',
    donateBtn: 'Donar al Autor',
    favoritesTitle: 'Favoritos',
    allTrends: 'Tendencias',
    movies: 'Películas',
    series: 'Series',
    cartoons: 'Dibujos animados',
    anime: 'Anime',
    hdr4k: '4K HDR',

    // Hero
    topRelease: 'Estreno Top 2024',
    watchNow: 'Ver Ahora',
    detailsAndEpisodes: 'Fuentes y Episodios',
    inFavorites: 'A Favoritos',
    min: 'min',

    // Rows
    trendingRow: 'En Tendencia Ahora',
    trendingBadge: 'Estrenos Calientes',
    ukrainianRow: '🇺🇦 Cine Ucraniano y Doblaje Oficial',
    ukrainianBadge: 'Doblajes',
    seriesRow: 'Mejores Series con Nuevos Episodios',
    seriesBadge: 'Temporadas 2024',
    hdrRow: 'Películas en Máxima Calidad 4K HDR',
    hdrBadge: 'Máximo Bitrate',
    cartoonsRow: 'Animación y Películas Familiares',
    cartoonsBadge: 'Familiar',
    animeRow: 'Mundo del Anime',
    animeBadge: 'Animación Japonesa',

    // History
    continueWatching: 'Continuar Viendo',
    savedPosition: 'Posición Guardada',
    watched: 'visto',

    // Search & Favs
    searchResultsFor: 'Resultados de búsqueda para:',
    found: 'encontrados',
    nothingFound: 'No se encontraron resultados para su búsqueda.',
    savedTitle: 'Mis Películas y Series Guardadas',
    emptyFavorites: 'Tu lista de favoritos está vacía. ¡Añade películas tocando el corazón!',

    // Details Modal
    movie: 'Película',
    tvSeries: 'Serie',
    cartoon: 'Animación',
    animeLabel: 'Anime',
    voiced: 'Doblaje',
    votes: 'votos',
    year: 'año',
    tabEpisodes: 'Episodios y Temporadas',
    tabOnline: 'Online (HDRezka y Espejos)',
    tabTorrents: 'Torrents (Hurtom / Rutor)',
    autoSearchNotice: 'Búsqueda automática en los mejores CDN con prueba de latencia:',
    ping: 'Ping',
    working100: '100% Funcional',
    download: 'Descargar',
    downloaded: 'Descargado ✓',
    audioTracks: 'Pistas de audio:',
    availableQuality: 'Calidad disponible:',
    torrentsTip: 'Torrents online: máximo bitrate, 4K HDR nativo, sonido envolvente Dolby Atmos / 5.1 sin pérdida.',
    seeds: 'seeds',
    size: 'Tamaño:',
    copied: '¡Copiado!',
    streaming: 'Streaming',

    // Player
    audioTrackMenu: 'Pista de Audio / Idioma',
    qualityMenu: 'Calidad de Vídeo',
    rewind10: 'Retroceder 10s',
    forward10: 'Avanzar 10s',
    seasonAbbr: 'temporada',
    episodeAbbr: 'episodio',

    // Donate Modal
    donateHeader: 'Apoyar el Proyecto',
    forOurs: 'Comunidad Privada',
    donateSubtitle: 'Mantenimiento de espejos, CDN de alta velocidad y base de datos diaria',
    freeCinemaNotice: 'Cine 100% libre sin anuncios molestos: Todas las donaciones se destinan exclusivamente a servidores proxy rápidos, scrapers autónomos y acceso a 4K.',
    selectCrypto: 'Selecciona Criptomoneda:',
    network: 'Red',
    scanQrHelp: 'Escanea el código QR con tu aplicación móvil de billetera o exchange:',
    addressForTransfer: 'Dirección de Transferencia:',
    clickToCopy: 'Haz clic para copiar',
    memoRequired: 'MEMO / Destination Tag (OBLIGATORIO PARA EL DEPÓSITO):',
    copyAddress: 'Copiar Dirección',
    copyMemo: 'Copiar MEMO',
    addressCopied: '¡Dirección copiada con éxito!',
    memoCopied: '¡MEMO copiado!',
    donateFooter: '¡Gracias por apoyar el cine libre comunitario! 🍿',
  },

  ru: {
    // Header
    searchPlaceholder: 'Поиск фильмов, сериалов, аниме...',
    donateBtn: 'Донат автору',
    favoritesTitle: 'Избранное',
    allTrends: 'Все тренды',
    movies: 'Фильмы',
    series: 'Сериалы',
    cartoons: 'Мультфильмы',
    anime: 'Аниме',
    hdr4k: '4K HDR',

    // Hero
    topRelease: 'Топ релиз 2024',
    watchNow: 'Смотреть',
    detailsAndEpisodes: 'Источники и серии',
    inFavorites: 'В избранное',
    min: 'мин',

    // Rows
    trendingRow: 'Сейчас в тренде',
    trendingBadge: 'Горячие релизы',
    ukrainianRow: '🇺🇦 Украинское кино и официальный дубляж',
    ukrainianBadge: 'Родной язык',
    seriesRow: 'Лучшие сериалы с новыми сериями',
    seriesBadge: 'Сезоны 2024',
    hdrRow: 'Фильмы в ультра качестве 4K HDR',
    hdrBadge: 'Максимальный битрейт',
    cartoonsRow: 'Мультфильмы и семейное кино',
    cartoonsBadge: 'Для всей семьи',
    animeRow: 'Мир Аниме',
    animeBadge: 'Японская анимация',

    // History
    continueWatching: 'Продолжить просмотр',
    savedPosition: 'Сохраненная позиция',
    watched: 'просмотрено',

    // Search & Favs
    searchResultsFor: 'Результаты поиска для:',
    found: 'найдено',
    nothingFound: 'Ничего не найдено по вашему запросу.',
    savedTitle: 'Мои сохраненные фильмы и сериалы',
    emptyFavorites: 'Ваш список избранного пуст. Добавляйте фильмы, нажимая на сердечко!',

    // Details Modal
    movie: 'Фильм',
    tvSeries: 'Сериал',
    cartoon: 'Мультфильм',
    animeLabel: 'Аниме',
    voiced: 'Озвучено',
    votes: 'голосов',
    year: 'год',
    tabEpisodes: 'Серии и Сезоны',
    tabOnline: 'Онлайн (HDRezka и Зеркала)',
    tabTorrents: 'Торренты (Hurtom / Rutor)',
    autoSearchNotice: 'Автоматический поиск по лучшим CDN с проверкой скорости:',
    ping: 'Отклик',
    working100: '100% рабочее',
    download: 'Скачать',
    downloaded: 'Загружено ✓',
    audioTracks: 'Озвучки:',
    availableQuality: 'Доступное качество:',
    torrentsTip: 'Торренты онлайн: максимальный битрейт, оригинальный 4K HDR, объемный звук Dolby Atmos / 5.1 без сжатия.',
    seeds: 'сидов',
    size: 'Размер:',
    copied: 'Скопировано!',
    streaming: 'Стриминг',

    // Player
    audioTrackMenu: 'Озвучка / Язык',
    qualityMenu: 'Качество видео',
    rewind10: 'Назад на 10 сек',
    forward10: 'Вперед на 10 сек',
    seasonAbbr: 'сезон',
    episodeAbbr: 'серия',

    // Donate Modal
    donateHeader: 'Поддержать проект',
    forOurs: 'Для своих',
    donateSubtitle: 'Поддержка зеркал, скоростных CDN и ежедневное обновление базы',
    freeCinemaNotice: '100% свободный кинотеатр без навязчивой рекламы: Все донаты идут исключительно на скоростные прокси, парсеры и доступ к 4K релизам.',
    selectCrypto: 'Выберите криптовалюту:',
    network: 'Сеть',
    scanQrHelp: 'Отсканируйте QR-код мобильным приложением кошелька или биржи:',
    addressForTransfer: 'Адрес для перевода:',
    clickToCopy: 'Нажмите для копирования',
    memoRequired: 'MEMO / Destination Tag (ОБЯЗАТЕЛЬНО ДЛЯ ЗАЧИСЛЕНИЯ):',
    copyAddress: 'Скопировать адрес',
    copyMemo: 'Скопировать MEMO',
    addressCopied: 'Адрес успешно скопирован!',
    memoCopied: 'MEMO скопировано!',
    donateFooter: 'Спасибо за поддержку свободного кинотеатра! 🍿',
  }
};
