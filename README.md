# 🎬 CinemaVault PRO v3.0 (Android 4K Cinema App)

> **Автономний мультиплатформний онлайн-кінотеатр «для своїх»**: без реклами, з підтримкою 7 незалежних стрімінг-серверів (`VidSrc PRO`, `Ashdi UA`, `HDRezka`, `VidLink 4K`, `AutoEmbed`, `Kodik`), живим глобальним пошуком по 15+ млн тайтлів (`IMDb` + `Wikidata UA` + `TVMaze` + `Jikan Anime` + `iTunes`), P2P-торрентами (`Hurtom / Toloka`) та вбудованим крипто-донатом із QR-кодами.

## 📲 Завантажити готовий Android `.apk`
- **[Завантажити CinemaVault-PRO-v3.0.apk (GitHub Releases)](https://github.com/zod4ix/cinemavault-android/releases/latest)**

---

## 🔥 Що нового у версії v3.0 PRO

1. **📱 Ідеальна адаптація під Android 14 / 15 / 16 (Edge-to-Edge Safe Area)**:
   - Нативна обробка системних відступів (`WindowInsetsCompat` для верхнього статус-бару, вирізу камери, нижньої панелі жестів/кнопок та клавіатури).
   - Підтримка системної кнопки/жесту **«Назад»** на Android (закриває плеєр → модальне вікно → пошук → головна).
   - Кнопка **«Горизонтально»** у відеоплеєрі з нативним поворотом екрана у повноцінний кінотеатральний Landscape-режим.

2. **⚡ 7 реальних серверів відтворення + Вбудований AdBlock**:
   - **VidSrc PRO (1080p Global)** — миттєвий запуск повних фільмів та серій за `IMDb ID` без VPN.
   - **UA / HDRezka Multi (`Kinobox`)** — український дубляж (`Ashdi`, `DniproFilm`, `Цікава Ідея`, `HDRezka Studio`, `Kodik`, `Alloha`).
   - **VidLink 4K HDR**, **AutoEmbed**, **VidSrc Mirror**, **SuperEmbed** — резервні світові дзеркала.
   - **YouTube 4K Трейлер + Нативний HLS (`.m3u8` / `.mp4`)** із можливістю вставити власне посилання потоку (наприклад, `TorrServe`).
   - Нативний захист `WebView` від спливаючої реклами (`onCreateWindow` popup-blocker) та підтримка third-party HLS cookies.

3. **🔍 5-рівневий живий глобальний пошук (5 мовами)**:
   - Працює через нативний Android HTTP (`CapacitorHttp`) без жодних CORS-обмежень.
   - Розуміє запити **українською, англійською, польською, іспанською та російською** мовами.
   - Поєднує офлайн мега-каталог, **IMDb Official Suggestion API (15M+ фільмів і серіалів)**, **Wikidata (`P345` IMDb + укр. локалізація)**, **TVMaze** (реальні сезони та серії), **Jikan v4 (MyAnimeList)** та **Apple iTunes**.

4. **💛 Модуль підтримки проєкту (QR-коди + Гаманці)**:
   - **USDT (TRC-20)**: `TMZ63AFLMUeir97AURFFZKZexMVMP1MPC7`
   - **USDT (BEP-20)**: `0xef0604c6416b307907abf20e9a90ea800878d1cf`
   - **TON**: `UQAg2HaykkgoM1YNycPIJFiBlzQ6tgCPkxzVIWHQ9uNiDu7w`
   - **Bitcoin (BTC)**: `16UEHnixSV6Pk7tUG6tTVUuPZA8E8fKHrF`
   - **Ethereum (ETH)**: `0x6543c9CEd42eb21a08cD63F4a6cb8Ae7B283B9BB`
   - **Solana (SOL)**: `Eu32mBk24mvZ3zB6PwezgRh1nMQEUdbZxREDDBCTxyvo`
   - **Dogecoin (DOGE)**: `DG4BvJjtHwrdtX8gaiD42Y6Dpbe4tBQnyU`
   - **Ripple (XRP)**: `rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh` *(Обов'язкове MEMO: `427632553`)*

---

## 🛠️ Розробка та збірка з вихідного коду

```bash
# 1. Встановлення залежностей
npm install

# 2. Запуск у режимі розробки
npm run dev

# 3. Продакшн-збірка та синхронізація Capacitor Android
npm run cap:sync

# 4. Компіляція APK (потрібен JDK 21 та Android SDK)
cd android && ./gradlew assembleDebug
```
