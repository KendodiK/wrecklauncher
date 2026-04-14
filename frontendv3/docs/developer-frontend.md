# WreckLauncher Frontend - Fejlesztoi Dokumentacio

Utolso ellenorzes: 2026-04-11
Scope: frontend (React) + preload IPC boundary

## 1. Technologia es runtime attekintes

A frontend egy Electron renderer-ben futtott React alkalmazas.

- UI: React + React Router (HashRouter)
- Stilus: Tailwind + global CSS
- Build: Vite
- Bridge: preload.js (window.electronAPI)
- Main process IPC: electron/main.js

Fo cel: a renderer ne hivjon kozvetlen Node API-kat, hanem preload endpointokon keresztul kommunikaltasson.

## 2. Belepesi pontok

- [index.html](../index.html): root mount hely
- [src/main.jsx](../src/main.jsx): React bootstrap + global CSS import
- [src/App.jsx](../src/App.jsx): route definiciok, auth bootstrap, global layout

## 3. Route terkep es felelos oldalak

A route definiciok [src/App.jsx](../src/App.jsx) fajlban vannak.

- /login -> Login
- /store -> Store (Shopveiw wrapper)
- /store/game/:platform/:id -> StoreGamePage
- /library -> LibraryPage
- /all-games -> AllGamesPage
- /shop/all-games -> AllGamesPage
- /shop/platform/:platform -> AllGamesPage
- /game es /game/:id -> GamePage
- /downloads -> DownloadsPage
- /friends -> FriendsPage
- /settings -> SettingsPage
- /profile/:userId? -> ProfilePage
- / -> Store

## 4. Konyvtarszerkezet es ownership

- [src/components/pages](../src/components/pages): route szintu oldalak
- [src/components/store](../src/components/store): store nezeti elemek (filters, grid, sidebar)
- [src/components/library](../src/components/library): library tabs, strips, drawers
- [src/components/navbar](../src/components/navbar): top nav atomok
- [src/context](../src/context): global context provider-ek
- [src/utils](../src/utils): normalizalas, routing segedek
- [src/data](../src/data): mock adatok / statikus konfiguracio

## 5. Auth es session flow

Az auth bootstrap [src/App.jsx](../src/App.jsx) komponensben tortenik.

1. App mount utan getToken() ellenorzes.
2. Ha van token, getCurrentUser() hydrate-olja a user state-et.
3. Auth lejart eseten preload egy wreck:auth-expired eventet kuld.
4. AuthExpiredGuard /login oldalra navigal.

Megjegyzes: token sync logika preload oldalon fut, localStorage kulccsal.

## 6. IPC boundary (frontend szemszog)

Fo API objektum: window.electronAPI, definicio: [preload.js](../preload.js)

Gyakori hasznalat:

- Auth: login, register, getToken, getCurrentUser, clearToken
- Store: getGames, getAllDetailsByID, getAllDetailsByAppIDAndPlatform
- Library/Steam: getOwnedGamesFromSteam, getSteamInstalledGames, runSteamGame, installSteamGame
- Settings: getSettings, updateSetting, updateSettings, updatePlatformConnection
- Torrent: torrentStart, torrentPause, torrentResume, torrentRemove, torrentGetStatus, onTorrentProgress

IPC handler oldala: [electron/main.js](../electron/main.js)

## 7. Layout es global shell

Global layout:

- Top navigation: [src/components/mainnavbar.jsx](../src/components/mainnavbar.jsx)
- Tartalom: route-olt oldalak
- Download state provider: [src/context/DownloadManagerContext.jsx](../src/context/DownloadManagerContext.jsx)

Navbar alrendszer:

- App icon menu
- Vissza/elo navigacio
- Linkek (Store, Library, stb.)
- User area (logout)
- Window controls (min/max/close)

## 8. Fobb oldalak fejlesztoi szemmel

### 8.1 Store

Kulcs fajlok:

- [src/components/pages/store.jsx](../src/components/pages/store.jsx)
- [src/components/pages/shopveiw.jsx](../src/components/pages/shopveiw.jsx)

Viselkedes:

- kezdeti game lista toltese paginaltan
- featured/discounted/upcoming carousel logikak
- filter pipeline: combineFilters utility
- route-ra navigalas jatek kattintas utan

Kockazat:

- duplikacio kezeles kulon logikakkal tortenik
- tobb offset allapot egyszerre mozog

### 8.2 Library

Kulcs fajl:

- [src/components/pages/libraray.jsx](../src/components/pages/libraray.jsx)

Viselkedes:

- settings alapjan Steam kapcsolat ellenorzes
- owned + installed lista osszefesules
- allapot tagek: Owned / Installed / Ready to install / Played

Kockazat:

- route-nev eliras (libraray) konvencio szinten konnyen felrevihet

### 8.3 Downloads

Kulcs fajlok:

- [src/components/pages/download.jsx](../src/components/pages/download.jsx)
- [src/context/DownloadManagerContext.jsx](../src/context/DownloadManagerContext.jsx)

Viselkedes:

- status poll + live torrent progress subscription
- upsert normalizalas infoHash alapjan
- pause/resume/remove lifecycle

Kockazat:

- restart utan in-memory state elveszhet, csak uj status sync tolti vissza

### 8.4 Settings

Kulcs fajl:

- [src/components/pages/setting.jsx](../src/components/pages/setting.jsx)

Viselkedes:

- retry mechanizmus settings:get handler kesoi regisztracio esetre
- platform connection sync (Steam/GOG/Itch)
- fallback local update, ha backend handler hianyzik

Kockazat:

- handler hiany es fallback miatt konnyu inkonzisztens allapotot tesztelni

## 9. Data flow mintak

### 9.1 Store game listing

1. oldal mount
2. preload getGames(offset)
3. map + normalize + dedupe
4. filter pipeline
5. grid render

### 9.2 Steam library sync

1. getSettings
2. steam connected check
3. parallel: getOwnedGamesFromSteam + getSteamInstalledGames
4. map toSteamLibraryGame
5. dedupe es render

### 9.3 Torrent progress

1. start download (torrentStart)
2. main process kuld torrent:progress eventeket
3. onTorrentProgress callback
4. context upsert
5. downloads page rerender

## 10. Stilus rendszer

- Global CSS: [src/index.css](../src/index.css), [src/animations.css](../src/animations.css)
- Tailwind config: [tailwind.config.js](../tailwind.config.js)

Konvencio:

- utility-first class hasznalat
- komponensekben inline Tailwind class stringek
- kulon animacios class-ok global stylesheetben

## 11. Uj fejleszto onboarding (gyors)

1. Nezd at route map-et [src/App.jsx](../src/App.jsx) alapjan.
2. Olvasd el preload endpointokat [preload.js](../preload.js) fajlban.
3. Kovess vegig egy flow-t login -> store -> game detail -> downloads.
4. Ellenorizd mely endpointokat hivja az oldal, amit modositasz.
5. UI regressziot ellenorizz desktop mereten es keskeny viewporton is.

## 12. Modoitasi checklist (ha uj feature jon)

1. Kell uj route? App.jsx-ben add hozza.
2. Kell uj IPC endpoint? preload + main handler + controller chain.
3. Kell global state? contextbe tedd, ne page-local hack legyen.
4. Kell user-visible hiba? mutass visszajelzest (error/success).
5. Kell tesztelheto acceptance? irj QA lepeseket a user guide-ba.

## 13. Ismert technikai adossagok

- tobb legacy/eliras nev: libraray, profle, shopveiw
- duplazott routek (all-games variansok)
- nehol fallback invoke es direkt endpoint hivas keveredik
- nem teljes platform parity (Steam a legerosebben kiepitett)
- egyes preload endpointok jelenleg nincsenek aktiv UI-ban hasznalva

## 14. Troubleshooting

### "No handler registered" hiba

- Ellenorizd, hogy a channel tenyleg regisztralva van [electron/main.js](../electron/main.js) fajlban.
- Ellenorizd preload endpoint mappinget [preload.js](../preload.js) fajlban.
- Settings oldalnal figyeld a retry/fallback agat.

### Library ures, pedig van Steam account

- Settings oldalon Steam kapcsolat connected + username + profileLink legyen.
- Ellenorizd getOwnedGamesFromSteam valaszt.
- Ellenorizd normalizalo map-et a library oldalon.

### Download lista nem frissul real-time

- Ellenorizd onTorrentProgress subscriptiont contextben.
- Ellenorizd, hogy infoHash nem ures.
- Frissits manualisan refreshStatus gombbal.

## 15. Diagram helyorzok

### TODO diagram: App shell + route tree

Helye: docs/assets/diagrams/diagram-route-tree-v1.png

### TODO diagram: Renderer -> Preload -> Main IPC flow

Helye: docs/assets/diagrams/diagram-ipc-flow-v1.png

### TODO diagram: DownloadManager state flow

Helye: docs/assets/diagrams/diagram-download-flow-v1.png

## 16. Screenshot helyorzok

- TODO screenshot: Login oldal
- TODO screenshot: Store fo oldal filterekkel
- TODO screenshot: Store game detail oldal
- TODO screenshot: Library oldal ures allapot
- TODO screenshot: Library oldal feltoltott allapot
- TODO screenshot: Downloads oldal aktiv torrenttel
- TODO screenshot: Settings oldal platform kapcsolatokkal
