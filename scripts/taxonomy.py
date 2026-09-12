"""Shared validation for the agreed café categories and tags."""
CATEGORIES = ('Volkscafé', 'Bruin café', 'Biercafé', 'Eetcafé', 'Muziekcafé',
              'Sportcafé', 'Dans- & feestcafé', 'Stadscafé / Grand Café', 'Cocktail- & wijnbar')
TAGS = ('Terras|Groot terras|Verwarmd terras|Live muziek|DJ|Jazz|Rock|Dansen|Feestcafé|'
        'Darts|Biljart|Pool|Kaarten|Sport op tv|Supporterscafé|Speciaalbier|Belgische bieren|'
        'Grote bierkaart|Trappist|Brouwerijcafé|Cocktails|Wijn|Natuurwijn|Aperitief|Sterke drank|'
        'Eten|Kleine kaart|Lunch|Brunch|Snacks|Historisch|Authentiek interieur|Erfgoed|Dorpscafé|'
        'Buurtcafé|Stamcafé|Studentencafé|Fietscafé|Motorrijders|Gezinsvriendelijk|Honden welkom|'
        'Late night|Rustig|Gezellig|Trendy|Alternatief|Speakeasy|Date night|Café met tuin|'
        'Aan het water|Uitzicht|Zomerbar|Koffie|Ontbijt').split('|')

def parse_tags(value):
    tags = [tag.strip() for tag in (value or '').split(';') if tag.strip()]
    unknown = set(tags) - set(TAGS)
    if unknown:
        raise ValueError('onbekende tag(s): ' + ', '.join(sorted(unknown)))
    return list(dict.fromkeys(tags))
