# WreckLauncher - Felhasznaloi es QA Dokumentacio

Utmutato celkozonseg: vegfelhasznalo + manualis QA tesztelo
Utolso ellenorzes: 2026-04-11

## 1. Mi ez az alkalmazas?

A WreckLauncher egy desktop launcher felulet, ahol jatekokat bongeszhetsz, platform kapcsolatokat kezelhetsz, sajat konyvtarat nezhetsz, es a letolteseket monitorozhatod.

## 2. Kezdes

1. App inditas utan a Login oldal jelenik meg, ha nincs aktiv session.
2. Lepj be vagy regisztralj.
3. Sikeres login utan alapertelmezetten a Store oldal nyilik.

## 3. Fo layout es navigacio

Globalis layout elemek:

- Felso sav: app menu, user area, ablakkezelok
- Navigacios linkek: Store, Library, Downloads, Friends, Settings, Profile
- Fo tartalom terulet: az aktiv oldal

Gyors navigacio:

- Vissza/elo gombok a felso savban
- Link kattintasra route valtas uj ablak nelkul

## 4. Oldalak es hasznalatuk

### 4.1 Login

Mit tudsz itt csinalni:

- bejelentkezes felhasznalonev + jelszo
- regisztracio (email opcionallal kiegeszitve)

Tipikus hiba:

- rossz jelszo/felhasznalonev -> hibauzenet
- letezo felhasznalonev regisztracional -> hibauzenet

QA ellenorzes:

1. Hibas loginra jelenjen meg hiba.
2. Sikeres login utan route valtas tortenjen a Store oldalra.

### 4.2 Store

Mit latsz:

- kiemelt jatekok slider
- szurt jateklista
- filter panel (kereses, mufaj, platform, ar)

Mit tudsz csinalni:

- jatek keresese nev alapjan
- szures genre/platform/price szerint
- jatek kartya kattintas -> jatek reszlet oldal

QA ellenorzes:

1. Filter modositas utan valtozzon a lista.
2. Kattintasra nyiljon meg a megfelelo game detail oldal.

### 4.3 Store Game Detail

Mit latsz:

- boritokep, hero kep, cim, leiras
- screenshot blokkok
- action gombok (platform fuggo)

Mit tudsz csinalni:

- Steam jateknal Play/Open Store jellegu gombok hasznalata

QA ellenorzes:

1. URL-ben levo platform es id alapjan jo adat toltodjon.
2. Hibas id eseten ne omoljon ossze az oldal.

### 4.4 Library

Mit latsz:

- owned jatekok listaja (fokent Steam)
- launcher tabs
- allapot tagek (Owned, Installed, Ready to install, Played)

Mit tudsz csinalni:

- keresni a sajat jatekok kozott
- rendezni cim vagy playtime szerint
- jatekra kattintani es store/game detail oldalra ugrani

Fontos:

- ha nincs kapcsolt Steam account, ures allapot jelenhet meg

QA ellenorzes:

1. Kapcsolt Steam accountnal jelenjen meg legalabb 1 owned jatek.
2. Disconnect utan jelenjen meg ures/allapot jelzes.

### 4.5 Downloads

Mit latsz:

- aktiv/szuneteltetett/kesz torrent elemek
- progress bar, sebesseg, peers, ETA

Mit tudsz csinalni:

- pause/resume
- remove
- status frissites refresh gombbal

QA ellenorzes:

1. Pause gomb valtsa allapotot.
2. Resume visszaallitsa aktiv allapotra.
3. Remove tuntesse el az elemet.

### 4.6 Settings

Mit latsz:

- profil adatok (bio, avatar)
- platform kapcsolatok (Steam, GOG, Itch)
- altalanos beallitasok

Mit tudsz csinalni:

- Steam kapcsolat felvetele username + profile link mezovel
- GOG/Itch kapcsolat allapot kezeles
- beallitasok reset es cache torles

QA ellenorzes:

1. Steam connect valid adatokkal sikeres legyen.
2. Steam disconnect utan connected allapot legyen false.
3. Mentett beallitas app ujranyitas utan is maradjon meg (ha backend tamogatja).

### 4.7 Friends

Mit latsz:

- baratlista status jelzokkel
- chat panel jellegu felulet

Megjegyzes:

- bizonyos elemek jelenleg mock adatot hasznalhatnak

### 4.8 Profile

Mit latsz:

- sajat profil vagy mas user profil nezet
- bio/avatar adatok

Mit tudsz csinalni:

- sajat profil adatok modositasat settings oldalon keresztul kezeld

## 5. Tipikus felhasznaloi folyamatok

### 5.1 Elso hasznalat

1. Regisztralj vagy lepj be.
2. Menj Settings oldalra, allitsd be platform kapcsolatot.
3. Menj Library oldalra es ellenorizd a syncelt jatekokat.

### 5.2 Jatek keresese es inditasa

1. Store oldalon keress ra a jatekra.
2. Nyisd meg a game detail oldalt.
3. Hasznald a platform fuggvenyhez tartozo action gombot (pl. Steam Play/Open).

### 5.3 Letoltes monitorozasa

1. Indits letoltest (flow platformtol fugg).
2. Nyisd meg a Downloads oldalt.
3. Figyeld a progress bart es statisztikakat.
4. Szuukseg eseten pause/resume/remove.

## 6. Ismert korlatok

- Nem minden platform funkcio teljesen azonos szinten kiepitett.
- Egyes oldalak reszben mock adatokkal mukodhetnek.
- Ha a hatter handler nem elerheto, bizonyos beallitasok csak lokalisan latszanak frissulni.
- Library oldalon a legerosebb tamogatas jelenleg Steam oldalon van.

## 7. Hibaelharitas (felhasznalo)

### Nem toltodik a Library

- Ellenorizd Settings oldalon a platform kapcsolatot.
- Ellenorizd, hogy van-e kitoltott username/profile link (Steamnel).
- Probald ujrainditani az alkalmazast.

### Letoltes nem halad

- Nyomj refresh-t a Downloads oldalon.
- Pause majd Resume probaja.
- Ellenorizd, hogy van-e aktiv peers ertek.

### Login utan visszadob loginra

- Valoszinuleg auth lejart vagy ervenytelen.
- Lepj be ujra.

## 8. QA regresszios minimum checklist

Minden release elott legalabb ezeket futtasd:

1. Login: hibas + sikeres forgatokonyv
2. Store: szures + detail navigacio
3. Settings: Steam connect/disconnect
4. Library: ures allapot + feltoltott allapot
5. Downloads: pause/resume/remove
6. Navbar: route valtas minden fo oldalra

## 9. Screenshot helyorzok

- TODO screenshot: Login kepernyo
- TODO screenshot: Store oldal alapallapot
- TODO screenshot: Store oldal aktiv filterekkel
- TODO screenshot: Game detail
- TODO screenshot: Library ures allapot
- TODO screenshot: Library jatekokkal
- TODO screenshot: Downloads aktiv torrenttel
- TODO screenshot: Settings platform connect
- TODO screenshot: Friends oldal
- TODO screenshot: Profile oldal
