# Kroeg & Karaf — dagelijkse publicatie

Dit aanvullingspakket gebruikt de websitebestanden aan de root van de bestaande
repository. Upload alle inhoud, inclusief de map `.github`, naar diezelfde root.
Gebruik hiervoor dit pakket, niet het eerdere overdrachtspakket met een map `site`.
De websitebron blijft in `index.html`, `kaart.html` en `assets`.

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
