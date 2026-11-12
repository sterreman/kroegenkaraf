# Kroeg & Karaf: dagelijkse publicatie

Dit aanvullingspakket gebruikt de websitebestanden aan de root van de bestaande
repository. Upload alle inhoud, inclusief de map `.github`, naar diezelfde root.
Gebruik hiervoor dit pakket, niet het eerdere overdrachtspakket met een map `site`.
De websitebron blijft in `index.html` (de startpagina), `lijst.html`, `kaart.html`, `afspreken.html` en `assets`.

## Proefrun

Open Actions → Kroeg en Karaf dagelijkse publicatie → Run workflow.
Laat de publicatieoptie uitgevinkt. Bekijk na afloop het verslag en download
`kroegenkaraf-proefsite` bij Artifacts. Een commit start geen publicatie.
`ENABLE_DAILY_PUBLICATION` blijft `false` tot de overdracht volledig gecontroleerd is.

Benodigde secrets: `GOOGLE_SERVICE_ACCOUNT_JSON`, `CLOUDFLARE_API_TOKEN`.
Benodigde variabelen: `DRIVE_CSV_FILE_ID`, `CLOUDFLARE_ACCOUNT_ID`,
`ENABLE_DAILY_PUBLICATION`. De fotomap-ID staat in de workflow.
Geheimen horen uitsluitend in GitHub Secrets.

## Bouwproces

Een schone checkout maakt `.publication/site` met alleen de websitebronbestanden.
De Drive-downloads komen in `.publication`, los van de bestaande map `fotos`.
Het bouwscript maakt nieuwe JSON en AVIF-foto's en vult de datum in.
Wrangler publiceert uitsluitend `.publication/site`.
De oorspronkelijke rootbestanden en GitHub-data worden door de workflow niet gewijzigd.

De bestaande CSV-, status-, soort-, coördinaten- en fotocontroles blijven behouden.
Een daling van meer dan 10% in aantal zaken of gekoppelde foto's ten opzichte van
`data/zaken.json` in GitHub blokkeert de publicatie. Dit is een vaste referentie,
geen vergelijking met de vorige succesvolle dag. Werk de referentie bewust bij
als een gecontroleerde inhoudelijke wijziging deze drempel terecht overschrijdt.
De coördinatencontrole gebruikt een benaderende rechthoek, geen gemeentegrenzen.

## Nog vóór activering

De echte Drive-download, volledige bouw, visuele controle en Cloudflare-deploy
moeten in GitHub worden getest. Een betrouwbare vergelijking met de vorige
succesvolle publicatie is nog niet ingericht. Activeer de dagelijkse taak pas
nadat deze punten afgehandeld zijn. Pauzeer Claude vóór de eerste nieuwe publicatie
om twee gelijktijdige publicatiesystemen te vermijden.

De geplande tijd is 02:17 UTC (04:17 Belgische zomertijd, 03:17 wintertijd).
Rapporten staan in Actions, niet in een dagelijks chatbericht.

## Verhalen, gemeentepagina's en foto's met open licentie (10 oktober 2026)

Drie kleine configuratiebestanden in `assets/` sturen de generator (`scripts/cafepaginas.py`):

- `verhalen.json`: welke artikels welke zaken (ID's uit de csv) bespreken. Elke zaak krijgt
  daaruit een blokje Lees ook met een link naar het artikel.
- `gemeenten.json`: elke hoofdgemeente met minstens `drempel` zaken (standaard 3, open en
  gesloten samen) krijgt automatisch een pagina op `/gemeente/<naam>/` en staat op het overzicht
  `/gemeenten`. Namen onder `gemeenten` krijgen altijd een pagina, ook onder de drempel. De pagina
  haalt caf�s, deelgemeenten en gesloten zaken uit de csv.
- `fotos-extern.json`: foto's met een open licentie voor zaken zonder foto op Drive, met
  maker, licentie en bron (die staan onder de foto). Een foto van Drive gaat altijd voor.

Lokaal bouwen en bekijken zonder te publiceren: `python scripts/bouw_lokaal.py <werkmap>`
(standaard met de csv en foto's in `G:\Mijn Drive\Volkscaf�s`), daarna `<werkmap>\site` serveren.
De site draait op Cloudflare met schone urls (`/lijst`, niet `/lijst.html`); canonical en
sitemap gebruiken daarom de schone vorm.

## Op pad in de html (21 oktober 2026)

`assets/oppad.json` is de enige lijst met artikels. Daaruit komen de bronbestanden
die mee naar de bouw gaan, de sitemap, het linkblok in `lijst.html`, de controles en
de kaarten op `/oppad` en de startpagina. Een artikel toevoegen is dus: het
html-bestand aan de root en een regel in `oppad.json` (en in `verhalen.json` als
er cafés in besproken worden). Niets anders.

`scripts/oppad_statisch.py` zet de kaarten na `cafepaginas.py` al in de html, tussen
de markeringen `<!--oppad:...-->`. Zo staan de links naar de artikels er ook voor
wie geen JavaScript uitvoert. De JavaScript tekent alleen nog als die stap
ontbreekt. `scripts/test_oppad.py` controleert dat de markup uit Python
(`scripts/artikels.py`) byte voor byte gelijk is aan die van `assets/oppad.js`;
wie de kaart aanpast, past beide aan.

## Pas open (22 oktober 2026)

`assets/nieuwopen.json` stuurt de tegel Pas open op de startpagina: per zaak de ID, de maand
van (her)opening (`JJJJ-MM`) en `nieuw` of `heropend`. Alleen opnemen als de Info-tekst die
maand vermeldt, en nooit seizoenszaken (zomerbars, winterbars, pop-ups). `cafepaginas.py` zet de zaken die nog geverifieerd zijn in `data/start.json`;
de pagina toont zelf alleen wat de voorbije zes maanden opende, de recentste eerst. Oude
regels mogen blijven staan, ze vallen vanzelf weg.

Sinds 12 november 2026 kan het ook zonder de repo: zet in de Notitie van de zaak een regel
`Pas open: JJJJ-MM nieuw` of `Pas open: JJJJ-MM heropend`. `publiceer.py` leest die bij de
nachtelijke bouw en voegt ze toe aan de kopie van `nieuwopen.json` in de bouwmap; bij
dezelfde ID wint de Notitie. Een Notitie die Pas open noemt in een andere vorm geeft een
waarschuwing in het verslag. Zelfde voorwaarden: de Info noemt de maand, geen seizoenszaken,
en een nieuwe uitbater zonder sluiting telt niet als heropening.

## Rooster van Ontdek Belgische cafes (22 oktober 2026)

De zes cafes van de dag komen uit een rooster in `data/start.json` (`rooster`). `cafepaginas.py`
haalt elke nacht het rooster van de live site op en zet het verder: wat al getoond is blijft
staan, nieuwe zaken komen op een willekeurige plek in het nog niet getoonde deel, en elke zaak
komt een keer per ronde. Een nieuwe ronde zet de zaken van het einde van de vorige ronde
achteraan. Het rooster ligt minstens 45 dagen vooruit. Lukt het ophalen niet, dan begint het
rooster opnieuw (geen stop). Lokaal testen: `ROOSTER_BESTAND=<pad naar een start.json>`.
De knop Toon zes andere neemt zaken uit de tweede helft van de huidige ronde, niet die van morgen.
De tegel Laatste ronde werkt op dezelfde manier met een eigen rooster (`ronderooster`, een zaak
per dag, alleen zaken die minstens drie maanden dicht zijn). De knop Een ander verdwenen cafe
loopt verder in de tweede helft van die ronde.

## Eigen formulieren: melden en foto's (6 november 2026)

De site is statisch, maar `/api/*` loopt eerst langs `worker/melding.js`
(`main` en `run_worker_first` in `wrangler.jsonc`). Geen Tally of andere dienst.

- `/api/melding`: het formulier Weet je iets over ... onder elke zaak. Elke melding
  gaat als mail naar de redactie (send_email-binding `MELDER` van Cloudflare Email
  Routing). Niets bewaard.
- `/api/foto`: het fotoformulier. De foto's komen in de Drive-map
  `Foto-inzendingen/Te beoordelen`, met de zaak en de naamsvermelding in de
  eigenschappen van het bestand, en de redactie krijgt een mail met de link.
  **Goedkeuren = de foto naar `Foto-inzendingen/Goedgekeurd` slepen.** Afkeuren =
  verwijderen. `scripts/inzendingen.py` haalt Goedgekeurd elke nacht op; haal je
  er later een foto weg, dan verdwijnt hij ook van de site.

Eenmalig instellen:

1. Cloudflare Email Routing: het ontvangstadres staat als geverifieerd bestemmingsadres.
2. Google Cloud (zelfde project als de service-account): OAuth-client van het type
   Desktop aanmaken en als json downloaden; het toestemmingsscherm op In production.
3. Lokaal: `pip install google-auth-oauthlib` en
   `python scripts/foto_drive_instellen.py client_secret.json`. Dat maakt de mappen
   (recht drive.file: de site ziet alleen wat ze zelf maakte) en drukt de waarden af.
4. De map `Foto-inzendingen` in Drive naar `Volkscafés` slepen (leesrecht voor de bouw).
5. Cloudflare, Worker kroegenkaraf, secrets: `MELDING_AAN`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `FOTO_TE_BEOORDELEN`.
6. GitHub, Actions-variabele: `DRIVE_FOTO_GOEDGEKEURD_ID`.

Tegen misbruik: per bezoeker 4 en voor iedereen samen 30 inzendingen per minuut
(ratelimit-bindings in `wrangler.jsonc`), hoogstens 30 foto's per dag in Te beoordelen,
en een foto moet aan de eerste bytes herkenbaar een jpg, png of webp zijn.

Zolang iets ontbreekt, weigeren de formulieren netjes en verwijzen ze naar
info@kroegenkaraf.be. De oude Tally-inzendingen (sheet) blijven werken.

## Provinciepagina's en de startpagina in de html (12 november 2026)

`scripts/cafepaginas.py` bouwt per provincie een pagina op `/provincie/<naam>/`. Gemeenten
met een eigen pagina krijgen er een link, de cafés uit kleinere gemeenten staan er zelf.
Samen met de gemeentepagina's heeft zo elke cafépagina een gewone link in de html, ook
voor een zoekmachine die de lijst en de kaart niet uitvoert. De kruimelpaden van café-
en gemeentepagina's en het blok Per provincie op de startpagina verwijzen ernaar; de
url's staan in `sitemap-gemeenten.xml`.

Dezelfde stap zet op de startpagina de zes zaken van Ontdek Belgische cafés en de
provincies al in `index.html`, tussen de markeringen `<!--start:ontdek-->` en
`<!--start:provincies-->`. `assets/start.js` tekent Ontdek daarna opnieuw uit hetzelfde
rooster en laat de provincies staan. Wie de kaart van een Ontdek-zaak aanpast, past
`tekenOntdek()` in `start.js` en `start_statisch()` in `cafepaginas.py` samen aan.

## Titels en structured data (12 november 2026)

Een cafépagina heeft de deelgemeente en de hoofdgemeente in de titel (`Rosa, Ledeberg (Gent)`);
bij een lange naam valt de sitenaam weg. Café-, gemeente- en provinciepagina's krijgen een
`BreadcrumbList` met dezelfde stappen als het zichtbare kruimelpad, en zaken met provincie
Nederland krijgen `addressCountry: NL`.

`scripts/oppad_statisch.py` zet in elk artikel `Article`-data (titel, omschrijving en beeld uit
de head, de datum uit `oppad.json`, de besproken cafés uit `verhalen.json`) en vult
`og:site_name`, `og:locale` en `twitter:card` aan waar ze ontbreken. `/oppad` krijgt een
`CollectionPage`, de startpagina `WebSite` en `Organization`. Alles staat vlak voor `</head>`
tussen markeringen `<!--data:...-->`; in de bronbestanden hoeft daar niets voor te staan.
