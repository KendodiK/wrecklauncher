# WreckLauncher Frontend - Fejlesztoi Dokumentacio

Utolso ellenorzes: 2026-04-21
Scope: frontend (React) + preload IPC boundary

## Dokumentum celja es olvasasi modja

Ez az anyag a WreckLauncher frontend retegrol ad egy modern, rendszerszintu fejlesztoi kepet. Nem az a celja, hogy gyors referenciakent elszort tenyeket soroljon, hanem az, hogy egy uj vagy visszatero fejleszto egyetlen dokumentumbol at tudja latni a mukodes logikajat, a felelossegi hatarokat, a valtoztatasok kockazatait es a legfontosabb uzemi mintazatokat.

A dokumentum felulete szandekosan narrativ: az egyes fejezetek egymasra epulnek. Eloszor az architekturat mutatja be, utana a futasi eletciklust, majd a feature-teruleteket, vegul a hibakeresesi es minosegbiztositasi gyakorlatot. Igy a fejleszto nem kulonallo alrendszereket lat, hanem egy koherens alkalmazast, ahol a route, az allapotkezeles es az IPC boundary egyetlen rendszerkent mukodik.

## Architektura: a frontend mint reteges rendszer

A frontend Electron renderer processzben futtatott React alkalmazas. A renderer oldali megjelenitesi es allapotlogika React komponensekben es context providerekben szervezodik, mig a privilegizalt muveletek preload bridge-en keresztul jutnak a main process handlerjeihez. A preload reteg ezzel nem csak technikai kozvetito, hanem biztonsagi es szerzodeses boundary is.

A teknologiai alap stabil es tudatosan szetvalasztott. A route kezeles HashRouterre epul, a build folyamat Vite alapu, a stilus pedig utility-first Tailwind es globalis CSS kombinalasabol all. Ez a kombinacio gyors fejlesztest ad, de csak akkor marad jol karbantarthato, ha a vizualis reteget nem terheljuk ra adatformalo vagy transport-jellegu logikaval.

### A boundary elv gyakorlati jelentosege

A renderer oldali kod nem hivhat kozvetlen Node API-kat. Minden olyan muvelet, amely fajlrendszert, rendszerfolyamatot, kulso kliensintegraciot vagy szinkronizacios oldalmellekhatast erint, preload endpointon at kell, hogy menjen. Ez a szabaly egyszerre ad vedelmet es fegyelmet: csokkenti a tamadasi feluletet, es javitja a valtoztatasok nyomon kovethetoseget.

## Futasi eletciklus: az alkalmazas indulasatol a stabil shellig

Az indulas sorrendje kulcsfontossagu a helyes allapotfelallas szempontjabol. Az Electron shell betolti a renderer oldalt, a React root felall, majd az App komponens inicializalja a route-szintu kompoziciot, az auth bootstrapot es a globalis shell elemeket. Ez a fazis nem pusztan technikai startup, hanem egy dontesi pont: itt valik el, hogy a felhasznalo hitelesitett flow-ba lep-e, vagy visszairanyitas tortenik login oldalra.

A session felallasa soran az alkalmazas token ellenorzest vegez, majd sikeres esetben felhasznaloi kontextust epit. Lejart tokennel a preload oldali auth-expired jelzes guard mechanizmuson keresztul biztonsagos route valtasba fordul. A legfontosabb elv itt az, hogy az auth ne oldalankent legyen "javitgatva", hanem centralizalt allapotkepzeskent mukodjon.

## Szerkezeti attekintes: ownership es kodbazis-hatarok

A kodbazis szervezese feature es felelossegi alapon epul. A route-szintu oldalak a pages retegben talalhatok, a store es library jellegu teruletek sajat komponenscsoportot kapnak, a navbar a globalis shell resze, mig a context reteg a tobb oldalt erinto allapotmegorzest kezeli. A utility es data konyvtarak a transzformacios illetve statikus konfiguracios igenyeket fedik le.

Ez a felosztas akkor mukodik jol, ha a fejlesztes elejen tisztazott marad, hogy egy valtozas UI-komponens, page-flow, vagy alkalmazasszintu state problema. Amikor ezek osszekeverednek, jellemzoen ket problema jelenik meg: elszaporodnak a keresztfuggosegek, illetve a regresszios hibak reprodukcioja jelentosen lelassul.

## Route reteg es oldalszintu felelossegek

A jelenlegi route terkep tobb uzleti utat fed le, kulon kiemelve a login, store, game detail, library, downloads, friends, settings es profile oldalakat. A rendszerben vannak olyan route variansok is, amelyek hasonlo nezeteket jelenitenek meg kulonbozo URL-semak alatt. Ez bizonyos UX szempontoknal rugalmas, de fejlesztoi oldalrol karbantartasi koltseget hoz: ugyanazon viselkedes tobb ponton valtozhat el.

A route reteg ezert nem passziv URL-mapping, hanem allapot- es felelossegelosztasi mechanizmus. A store oldal alapvetoen listaepitesi es szuresi logikaval dolgozik, a library kulso platform allapotot fordit UI-modellekre, a downloads event- es poll-vezerelt frissiteseket kezel, a settings pedig konfiguracios forraspontkent mukodik.

## IPC boundary reszletek: szerzodes, stabilitas, hibaturo kepesseg

A renderer oldali funkcionalis hivasok a window.electronAPI feluleten keresztul erik el az auth, store, library, settings es torrent jellegu muveleteket. Az IPC szerzodes stabilitasa azon mulik, hogy a preload mapping, a main process channel-regisztracio es a valaszformatum ugyanazon logika szerint fejlodik.

A leggyakoribb regresszios minta az, amikor gyors UI igenyre ideiglenes workaround kerul be, es egy idovel mar nem egyertelmu, hogy melyik endpoint milyen sema szerint ad vissza adatot. Emiatt az uj endpointoknal kotelezo tervezesi elem legyen a keretadatok, hibaszemantika es fallback viselkedes tisztazasa. Ha ez hianyzik, a kliens oldali hibaturo logika hosszabb tavon inkonzisztens allapotokat termel.

### Javasolt szerzodesi kontrollpontok

| Kontrollterulet | Mit kell ellenorizni | Miert kritikus |
| --- | --- | --- |
| Endpoint mapping | preload nev es main channel egyezik-e | Elkerulheto a no-handler tipusu uzemi hiba |
| Valasz sema | sikeres es hibas valasz mezoi stabilak-e | A renderer oldali parser nem torik verziofrissiteskor |
| Hibaag | fallback aktivacio feltetelei explicit-e | Nem csuszik csendes, felrevezeto allapotba a UI |
| Event lifecycle | feliratkozas es leiratkozas korrekt-e | Nem lesz memoria-szivargas vagy duplikalt frissites |

## Feature-domenek melyebb elemzese

### Store: listaepites, normalizalas, deduplikacio

A store oldal viselkedese a paginalt listabetoltesre, a kiemelt blokkok osszerendezesere es a filter-pipeline helyes sorrendjere epul. A normalizalas itt nem kiegeszito lepes, hanem alapfeltetel: route variansok, offset valtasok es kulonbozo API valaszok mellett ugyanaz a jatek konnyen tobbszor is bekerulhet a renderelendo halmazba.

A store regressziok tipikusan nem ott jelennek meg, ahol a hiba keletkezik. Gyakran egy apro mapping-elteres okoz tobbes megjelenitest, hibas filtereredmenyt vagy inkonzisztens kartyasorrendet. Emiatt valtoztatas utan mindig egyutt kell validalni a normalizalo reteget es a vizualis listakepzest.

### Library: kulso platform adatokbol UI-allapot

A library oldal platformkapcsolati allapotbol indul, majd az owned es installed listakat egyesiti egy renderelheto, cimkezett modellbe. A kulso adatforrasok idozitesi es minosegi szorasa miatt itt kulonosen fontos a tolerans parser es a vedett UI allapot-atmenet.

A legacy elnevezesek es route-nev elirasok fejlesztoi csapdakent jelennek meg. Nem feltetlenul futasi hibat okoznak, de novelik az onboarding es hibakereses idejet, mert a valtoztatasi pontok nem intuitiv helyen talalhatok.

### Downloads: hibrid frissitesi modell

A downloads oldal ket csatornat kombinal: periodikus status lekero ciklust es valos ideju progress eventeket. Az infoHash alapu upsert strategia jol skalazodik aktiv forgalomban, ugyanakkor ujrainditas utan csak akkor all helyre megbizhatoan a lista, ha megtortenik a teljes kezdeti status rekonstrukcio.

Fejlesztoi szemszogbol ez az oldal lifecycle erzekeny terulet: subscription hibak, hianyzo kezdeti szinkron vagy felrekezelt torlesi allapot gyorsan felhasznaloi bizalomveszteshez vezet.

### Settings: konfiguracios kozpont es allapotkonzisztencia

A settings oldal egyesiti a platformkapcsolatokat, altalanos preferenciakat es bizonyos fallback agakat. A kesoi handler-regisztracios helyzetek miatt itt gyakran jelenik meg retry logika, amely uzemi robusztussagot adhat, de csak akkor, ha a kliens oldali ideiglenes allapot nem valik tartosan elszakadtta a backend valos allapotatol.

Ez a terulet kiemelten alkalmas szerzodeses tesztelesre: nem eleg azt nezni, hogy egy kapcsolo kapcsolhato-e, azt is ellenorizni kell, hogy az ujraolvasott allapot valoban ugyanazt mutatja-e.

## Allapotatmeneti mintazatok es versenyhelyzetek

A frontend legnehezebb hibai jellemzoen nem az egyes fuggvenyekben, hanem az aszinkron allapotatmenetek kozott keletkeznek. A store es library adatfolyamoknal a normalizalas sorrendje, a downloadsnal az event-poll osszhang, az authnal pedig a route-guard idozitese hatarozza meg a stabilitast.

Ezert a state atmenetek dokumentacioja legalabb annyira fontos, mint a komponens API dokumentacio. Ha ket kulonbozo helyen mas szabaly szerint tortenik ugyanannak az adatnak a transzformacioja, elobb-utobb regresszio lesz belole, akkor is, ha lokalisan minden kodresz onmagaban helyesnek tunik.

## UI es stilusrendszer: utility-first fegyelemmel

A Tailwind es globalis stylesheet kombinacio gyors termekfejlesztest tesz lehetove, de minoseget csak kovetkezetes strukturaval ad. A komponens osztalylistak maradjanak vizualis jelleguek, az uzleti dontesek keruljenek a megfelelo logikai retegbe. Ahol a stilusvariansok bonyolultta valnak, ott erdemes konszolidalni a visszatero mintakat, kulonben a kisebb UI valtozasok is artalanul nagy diffeket fognak eredmenyezni.

## Hibakeresesi keretrendszer

Hibakeresesnel a leggyorsabb ut a reteges ellenorzes. Eloszor a channel es mapping egyezest kell igazolni, mert a no-handler jellegu hibak itt buknak ki a legkorabban. Utana a valasznormalizalo reteget erdemes megnezni, majd csak ezt kovetoen a route- vagy komponensszintu allapotatmeneteket. Ez a sorrend jelentos idot sporol olyan esetekben, ahol a tunet vizualis, de az ok valojaban szerzodeses.

Ures library eseten a kapcsolatallapot, a kapcsolt felhasznaloi adatok es az owned/installed forrasvalaszok egyutt vizsgalandok. Valos ideju downloads hibanal a subscription eletciklus, az infoHash jelenlet es a kezdeti status-visszaepites adja a legfontosabb diagnosztikai haromszoget.

## Minosegbiztositas es regresszios validalas

A frontend valtoztatasoknal kulonosen fontos a funkcionalis ellenorzes es a vizualis regresszio parhuzamos kezelese. A route- es IPC-valtozasokat mindig erdemes vegigfuttatni egy teljes felhasznaloi utvonalon: login, store lista, game detail, downloads, settings visszaellenorzes. A desktop es keskeny viewport validacio mar korai fazisban hasznos, mert szamos state-problema csak bizonyos layouttorzulas mellett lathato.

Ha egy valtozas preload szerzodest is erint, ajanlott kulon elfogadasi felteteleket dokumentalni arra, hogy a sikeres es hibas valaszok UI szinten milyen allapotot kell eredmenyezzenek. Ez a gyakorlat jelentosen csokkenti a "mukodik, de nem konzisztens" tipusu hibakat.

## Uj fejleszto onboarding gyakorlat

Az onboarding leghatekonyabb modja a teljes flow-kovetes. Nem egyes komponenseket erdemes eloszor tanulni, hanem egy vegeigfutott termekutat: hitelesites, bolti felfedezes, reszletmegtekintes, letoltesi allapot, beallitasi visszaellenorzes. Ez a megkozelites gyorsan megmutatja, hol vannak az alkalmazas valos torontjai es mely reszek igenyelnek kulon ovatos fejlesztoi beavatkozast.

## Fejlesztesi irany es adossagkezeles

A jelenlegi kodbazisban tobb legacy nev, route-atfedes es fallback alapu workaround talalhato. Ezek nem feltetlenul kritikus hibak, de osszeadodva novelik a valtoztatasi kockazatot. Az adossagkezeles akkor lesz hatekony, ha szuk, priorizalt szeletekben tortenik: eloszor szerzodesi egysegesites, utana elnevezesi rendbetetel, majd route-konszolidacio.

Ez a sorrend azert praktikus, mert a szerzodesi stabilitas adja a regressziobiztos alapot. Ha ezt megeluzi a felszini tisztitas, a rendszer viselkedese tovabbra is rejtett inkonzisztenciakat hordozhat.

## Vizualis dokumentacio: diagramok es screenshot terv

A dokumentaciot erdemes kiegesziteni route-tree, IPC adatfolyam es DownloadManager allapotatmeneti diagramokkal, mert ezek a szoveges leirast konkret rendszerkepekre forditjak. A screenshot alapcsomagban legalabb a login, store (szurokkel), game detail, library (ures es feltoltott), downloads aktiv torrenttel, valamint a settings platformkapcsolati allapotai szerepeljenek. Ezek kesobb regresszios referenciakent is hasznalhatok.

### Mappastruktura kivonat (frontend + dokumentacio)

Az alabbi reszlet mutatja, hol vannak a dokumentacios assetek es a screenshothoz kapcsolodo fo UI komponensek.

```text
frontendv3/
├─ docs/
│  ├─ developer-frontend.md
│  ├─ user-guide.md
│  ├─ README.md
│  └─ assets/
│     ├─ screenshots/
│     └─ diagrams/
└─ src/
	├─ App.jsx
	├─ index.css
	└─ components/
		├─ mainnavbar.jsx
		├─ pages/
		│  ├─ login.jsx
		│  ├─ shopveiw.jsx
		│  ├─ StoreGamePage.jsx
		│  ├─ libraray.jsx
		│  ├─ download.jsx
		│  └─ setting.jsx
		├─ library/
		│  ├─ LibraryGameStrip.jsx
		│  ├─ AllGamesDrawer.jsx
		│  └─ PlatformBadge.jsx
		├─ store/
		├─ navbar/
		└─ shared/
```

### Screenshot terv: mit kell fotozni es honnan

| Nezet | Kod/komponens kiindulopont | Mit fotozz | Javasolt fajlnev |
| --- | --- | --- | --- |
| Login oldal | `src/App.jsx` route + `src/components/pages/login.jsx` | Teljes login UI (inputok + CTA) | `screenshot-login-main-v1.png` |
| Store fo nezet | `src/components/pages/shopveiw.jsx` | Kiemelt kartya + szurok + lista kezdo allapot | `screenshot-store-main-v1.png` |
| Game detail | `src/components/pages/StoreGamePage.jsx` | Hero blokk + ar/reszletek + launcher action | `screenshot-game-detail-v1.png` |
| Library ures | `src/components/pages/libraray.jsx` | Ures allapot uzenet/action gombok | `screenshot-library-empty-v1.png` |
| Library feltoltott | `src/components/pages/libraray.jsx` + `src/components/library/LibraryGameStrip.jsx` | Carousel + aktiv kartya + platform badge | `screenshot-library-filled-v1.png` |
| Library osszes jatek drawer | `src/components/library/AllGamesDrawer.jsx` | Oldalsav lista + badge + aktiv elem | `screenshot-library-drawer-v1.png` |
| Downloads | `src/components/pages/download.jsx` | Aktiv letoltes/progress + allapot | `screenshot-downloads-active-v1.png` |
| Settings kapcsolatok | `src/components/pages/setting.jsx` | Platform kapcsolat blokkok + mentesi allapot | `screenshot-settings-platforms-v1.png` |

### Mentési szabaly

- A screenshotok helye: `docs/assets/screenshots/`
- A diagramok helye: `docs/assets/diagrams/`
- Egy nezet tobb allapota kulon fajlba keruljon (`-v1`, `-v2`, stb.).
- Dokumentumban relativ hivatkozas hasznalando (pelda: `assets/screenshots/screenshot-library-filled-v1.png`).

## Zaro elvek

Ennek a frontendnek a hosszu tavu minosege nem elsosorban uj framework valasztasan mulik, hanem a szerzodesek kovetkezetes kezelesen, a state atmenetek tiszta dokumentaciojan, es azon, hogy a gyors workaroundokat idoben visszaforgatjuk stabil, tesztelheto megoldasokba. Ha ez a fegyelem megmarad, a rendszer egyszerre marad gyorsan fejlesztheto es uzembiztos.

## Szerzodesalapu fejlesztesi modell

A projekt egyik legfontosabb stabilitasi pillere az, hogy a frontend valtozasokat szerzodesalapon kezeli. Ez azt jelenti, hogy az endpoint-nev, a bemenet, a kimenet, a hibaszemantika es a fallback viselkedes egyutt alkotja a valodi interfeszt, nem csak az, hogy egy hivas sikeres esetben visszaad-e valamilyen JSON-t. Ha barmelyik elem valtozik, az mar API-kompatibilitasi es regresszios kerdes.

A szerzodesalapu szemlelet gyakorlati elonye, hogy a valtozasok hatasa jobban becsulheto. Egy uj feature bevezetesenel mar a tervezes elejen lathato, hogy melyik route, melyik state-atmenet es melyik IPC csatorna lesz erintett, igy csokken annak eselye, hogy a javitas kesobb varatlan helyen torje meg a mukodest. Ez kulonosen fontos itt, ahol a preload boundary egyszerre biztonsagi es alkalmazas-szervezesi hatar.

### Szerzodes definicio minimumkovetelmenye

Minden uj vagy modositott IPC endpoint eseteben a kovetkezo elemeket kotelezonek kell tekinteni: a hivas celja, a bemeneti parameterlista tipus-es alaki megkotesei, a sikeres valasz kotelezo mezoi, a varhato hibakategoriak, valamint a UI oldali degradacios strategia. Ezt nem kulon adminisztracios teherkent erdemes kezelni, hanem olyan fejlesztoi eszkozkent, amely mar a kodiras kozben csokkenti a bizonytalansagot.

## Adatmodellezesi iranyelvek

A renderer oldali adatmodellezesben a legfobb elv az, hogy kulso valaszok ne kozvetlenul keruljenek a komponens renderbe. Elobb normalizalas tortenjen, amely egysegesiti az elnevezeseket, kezeli a hianyos mezoket es stabil azonositast ad. A normalizalas utan kovetkezzen deduplikacio, majd csak ezutan a feature-specifikus szures es rendezes. Ezzel az adatfolyam determinisztikusabb lesz, es kevesebb rejtett versenyhelyzet jelenik meg.

A store, library es download domenben ez mar most is tobb helyen megjelenik, de erdemes explicit szaballya emelni: komponensben ne legyen ad hoc parser. A parser a domain helperben vagy context kozeleben eljen, ahol ujrahasznalhato es tesztelheto. Igy a UI csak mar stabil, renderelheto modellekkel dolgozik.

### Azonositas es deduplikacio sorrendje

Az azonositas sorrendje kulcsfontossagu. Elso helyen a domain-natural key legyen, masodik helyen a platform-szintu egyedi azonosito, harmadik helyen a vedett fallback kulcs. Ha a fallback kulcs tul koran lep be, a rendszer hamisan kulonbozo elemkent tarolhatja ugyanazt az entitast. Ez tipikus oka a kettos kartyamegjelenesnek es a furcsa szuroeredmenyeknek.

## Allapotkezelesi dontesi fa

Az allapotkezelesnel a leggyakoribb kerdes, hogy page-local state, context state vagy backend-driven source of truth legyen-e a megfelelo megoldas. A donteshez az alabbi gyakorlat javasolt. Ha az adat csak egyetlen oldal ideiglenes UI donteset erinti, page-local state eleg. Ha ket vagy tobb route kozosen hasznalja, contextbe kell emelni. Ha az allapotnak sessionok kozott is konzisztenseknek kell maradnia, backend vagy preload oldali persisted allapot legyen az elsodleges forras.

Ez a dontesi rend segit elkerulni azt a tipikus helyzetet, amikor egy gyors valtoztatas page-localan mukodik, de routevaltassal elveszik, vagy masik oldalon eltero allapot kepzodik belole.

## Hibaturo viselkedes es degradacios policy

A frontendnek tudnia kell kezelni a reszleges uzemi hibakat. Nem csak teljes kieses letezik, hanem olyan helyzet is, amikor egyes endpointok mukodnek, masok kesnek vagy idonkent hibat adnak. Erre egyseges degradacios policy szukseges.

Elso elv, hogy minden kritikus aszinkron muvelethez legyen elkulonitett loading, success es error allapot. Masodik elv, hogy a hiba uzenet ne technikai stack dump legyen, hanem felhasznalo szinten ertelmezheto visszajelzes. Harmadik elv, hogy ahol lehetseges, legyen retry mechanizmus kontrollalt upper bounddal. Negyedik elv, hogy fallback esetben is legyen egyertelmu jelzes: a UI ne tunjon teljesen sikeresnek, ha valojaban ideiglenes lokalis allapotban fut.

## Teljesitmeny es valaszidoszint celok

A jelenlegi architektura mellett hasznos, ha a csapat explicit valaszidoszint-celokat allit be. Ilyen lehet peldaul az, hogy routevaltas utan a kritikus fold alatti tartalom megjelenese a tipikus fejlesztoi gepeken egy masodpercen belul tortenjen, vagy hogy listafeltoltesnel a felhasznalo legalabb skeleton allapotot kapjon rovid idon belul.

A teljesitmenyellenorzesnel nem csak a nyers ido szamit, hanem a felhasznaloi erzet is. Egy kiszamithatoan animalt, fokozatosan feltolto oldal sokkal stabilabbnak tunik, mint egy hirtelen villogo, allapotot tobbszor ujraepito felulet. Emiatt a render ciklusok es a lista-transzformaciok koltsege kulon merendo azoknal a nezeteknel, ahol sok elem mozog egyszerre.

### Teljesitmeny hotspotok a jelenlegi kodbazisban

Kulon figyelmet erdemelnek a tobbfazisu lista-transzformaciok, a gyakori pollinggal parositott valos ideju eventek, valamint azok a routeok, ahol egyszerre tobb kulso adatforras erkezik. Itt ajanlott idonkenti profiling, mert ezekben a pontokban mar egy kisebb regresszio is szemmel lathato UX romlast okozhat.

## Biztonsagi es adatvedelmi minimumok

Mivel a frontend Electron kornyezetben fut, a preload boundary vedelme elsodleges. A renderer oldali kodba ne keruljon kozvetlen rendszerhivas, es ne keruljenek visszaellenorzes nelkul tovabbadott, nyers kulso adatok a privilegizalt csatornakon. A user-level tokenkezeles maradjon centralizalt, es minden auth-hibaag kovesse ugyanazt a kilogikazott utat.

Adatvedelmi oldalon fontos, hogy a naplozas ne tartalmazzon felesleges szemelyes adatot. Hibaelemzeshez eleg a reprodukalhatosagot segito minimalis kontextus. Ahol userazonosito vagy profiladat szerepel, ott a logolasi szintet es a retention gyakorlatot is tudatosan kell kezelni.

## Valtozaskezeles es release folyamat

A frontend release minosege nagyban javul, ha a valtozasok nem csak tematikusan, hanem kockazat szerint is csoportositva kerulnek be. Erdemes kulon kezelni a vizualis-only valtozasokat, az allapotkezelesi valtozasokat es az IPC szerzodest erinto modositast. A harom tipus mas tesztterhelest es mas rollback strategiakat igenyel.

### Ajanlott release gate rendszer

| Gate | Mit ellenoriz | Elfogadasi kriterium |
| --- | --- | --- |
| Build gate | renderer build, type es lint alapok | nincs blocker szintu hiba |
| Flow gate | login, store, detail, downloads, settings | kritikus userut teljesen vegigfut |
| Contract gate | preload-main endpoint egyezes | nincs no-handler es sema-eltetes |
| UX gate | desktop es keskeny viewport | nincs torott layout vagy blokkolt interakcio |
| Recovery gate | auth-expired, retry, fallback | hibaagakban is kontrollalt viselkedes |

## Rollback es incident runbook

Ha egy release utan uzemi regresszio jelenik meg, a legfontosabb, hogy eloszor a tunet-osztalyt tisztazzuk. Vizualis, szerzodeses, auth, vagy download lifecycle jellegu hibarol van szo. A tunet-osztaly meghatarozza, hogy gyors client oldali hotfixre, endpoint visszafel kompatibilis patchre, vagy teljes rollbackre van szukseg.

Incident alatt erdemes egy rovid, strukturalt naplot vezetni: mikor jelentkezett eloszor, melyik route-on reprodukalhato, milyen auth allapot mellett jelenik meg, es mely endpoint valasz a gyanus. Ez a minimalis keret mar eleg ahhoz, hogy a hiba ne ad hoc nyomozassa valjon, hanem gyorsan priorizalhato mernoki feladatta.

### Incident timeline sablon

| Idopont | Esemeny | Megfigyeles | Kovetkezo lepes |
| --- | --- | --- | --- |
| T0 | hiba bejelentes | route + tunet rogzites | reprodukcio inditasa |
| T1 | reprodukcio | auth/state/endpoint kontextus gyujtes | izolacio |
| T2 | izolacio | root cause valoszinu tartomany | hotfix vagy rollback dontes |
| T3 | javitas | validalt fix branch | regresszio teszt |
| T4 | zaras | monitorozott stabil allapot | postmortem roviden |

## Tesztstrategia reszletesebben

A teszteles itt tobb retegre bonthato. Szerzodes szinten endpoint-paritas es valasz-sema stabilitas ellenorzes szukseges. Allapotatmeneti szinten a retry, fallback, auth-expired es event lifecycle forgatokonyveket kell lefedni. Felhasznaloi szinten a teljes fobelepesi utvonalakat kell rendszeresen vegigjatszani.

A tesztstrategia akkor hatekony, ha a legnagyobb uzleti kockazatu teruletek gyakrabban futnak. Ilyen a login/session, a store lista megjelenites, a library szinkron, valamint a downloads progress allapot. Ezeknel mar egy kisebb regresszio is azonnal lathato es felhasznaloi bizalomvesztest okozhat.

### QA matrix javaslat

| Terulet | Alapeset | Hibaag | Elvart eredmeny |
| --- | --- | --- | --- |
| Auth | token ervenyes | token lejart | automatikus redirect loginra |
| Store | lista tolt | hianyos valaszmezo | stabil fallback kartya megjelenites |
| Library | owned+installed merge | egyik forras kesik | nem omlik ossze, reszleges allapot lathato |
| Downloads | progress frissul | event kimaradas | polling visszaallitja allapotot |
| Settings | mentes sikeres | handler hianyzik | lokalis fallback + egyertelmu uzenet |

## Dokumentacios karbantartasi protokoll

Ez a dokumentacio akkor marad hasznos, ha minden erdemi frontend valtozasnal frissul legalabb harom ponton. Frissiteni kell a szerzodesi hatast, vagyis mely endpoint vagy valasz-sema valtozott. Frissiteni kell a flow-hatast, vagyis mely userutvonal valtozott. Es frissiteni kell a teszt-hatast, vagyis milyen uj regresszios ellenorzes lett kotelezo.

Egy ilyen konnyu, de kovetkezetes protokoll mellett a dokumentacio nem utolagos adminisztracios teher lesz, hanem a fejlesztes resze. Ez nagyban segiti az onboardingot, a release minoseget es az incident utani gyors helyreallitast.
