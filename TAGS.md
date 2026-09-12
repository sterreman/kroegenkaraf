# Categorieën en tags

De bron blijft `Volkscafés/cafes_100_jaar_v11.csv` op Google Drive. De nachtelijke
publicatie leest dezelfde bestand-ID. Bewerk geen afgeleide JSON als bronbestand.

Elke zaak heeft exact één van de negen categorieën in `Soort`. `Tags` bevat nul
of meer kenmerken, gescheiden door een puntkomma, bijvoorbeeld
`Terras; Speciaalbier; Biljart`. Gebruik de spelling uit `scripts/taxonomy.py`.

Tags worden alleen toegevoegd op basis van concrete informatie. Een ontbrekende
tag betekent dat het kenmerk niet is vastgelegd, niet dat het ontbreekt. Het
infoveld en de bronnotities blijven behouden. De eerste invulling van 12 september
2026 is gebaseerd op bestaande beschrijvingen, expliciete notities en eerdere
categorieën; dit is geen nieuwe externe verificatie van de zaken.

De lijst en kaart vereisen alle geselecteerde tags (EN). Tags worden ook in de
vrije zoektekst meegenomen en bij een geopende zaak getoond. `Alles wissen`
verwijdert alle geselecteerde tags en herstelt de bestaande standaardfilters.

De bouw stopt bij een onbekende categorie of tag. Een nieuwe tag kan bewust aan
de toegestane lijst worden toegevoegd als geen bestaande tag volstaat en het
kenmerk nuttig is voor filtering. Maak geen nieuwe categorieën aan.
