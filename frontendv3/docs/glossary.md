# WreckLauncher Fogalomjegyzek

## Alapfogalmak

- Launcher: Jatekplatform (Steam, GOG, Itch), amihez jatek vagy muvelet tartozik.
- Platform kapcsolat: User account osszekotese egy launcherrel Settings oldalon.
- Owned game: Olyan jatek, ami a felhasznalo accountjan elerheto.
- Installed game: Olyan owned game, ami lokalisan telepitve van.
- App ID: Platform altal hasznalt egyedi azonosito (fokent Steam).
- Route: Az alkalmazas URL utvonala (pl. /store, /library).
- Game detail oldal: Egy konkret jatek reszletes oldala.
- IPC: Renderer es main process kozti kommunikacios csatorna Electronban.
- Preload API: A renderer szamara biztonsagosan expose-olt API (window.electronAPI).
- Token: Bejelentkezesi session azonosito.
- Auth expired: Lejart vagy ervenytelen token miatti kijelentkeztetes.
- Download progress: Letoltes allapotadatai (szazalek, sebesseg, ETA, peers).
- ETA: Becsult hatralevo ido a letoltes befejezeseig.
- Deduplikacio: Azonos jatekok kiszurese listak osszefesulesekor.
- Fallback: Tartalek viselkedes hianyzo handler vagy hiba eseten.

## UI allapotok

- Empty state: Ures allapotu oldal, amikor nincs megjelenitheto adat.
- Loading state: Adatbetoltes alatti vizualis allapot.
- Error state: Hibaval visszajelzett allapot.
- Success toast/message: Sikeres muvelet visszajelzese.

## QA terminusok

- Regresszio: Korabban mukodo funkcio elromlasa uj valtozas utan.
- Smoke check: Gyors alap ellenorzes a kritikus flow-kon.
- Acceptance criteria: Elore definiált, teljesiteshez kotott elvart viselkedes.
