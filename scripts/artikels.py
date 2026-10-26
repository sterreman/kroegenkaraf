"""De artikels van Op pad, voor de bouw.

assets/oppad.json is de enige lijst met artikels. Alles wat een artikel moet
kennen (de bronbestanden die meegaan, de sitemap, het linkblok in lijst.html,
de controles en de kaarten op /oppad en de startpagina) leest hier.

kaart() maakt precies dezelfde markup als OpPad.kaart() in assets/oppad.js.
Wie het een aanpast, past het ander mee aan; scripts/test_oppad.py vergelijkt
beide byte voor byte.
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

MAANDEN = ('januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus',
           'september', 'oktober', 'november', 'december')

SIZES = {'groot': '(min-width: 900px) 46vw, 100vw', 'klein': '(min-width: 520px) 180px, 96px',
         'lijst': '(min-width: 900px) 520px, 100vw'}
SCHEIDING = '<span aria-hidden="true"> · </span>'


def laad(map_):
    """De artikels uit <map_>/assets/oppad.json, in bestandsvolgorde, zoals OpPad.laad()."""
    pad = Path(map_) / 'assets/oppad.json'
    artikels = json.loads(pad.read_text(encoding='utf-8')).get('artikels', [])
    return [a for a in artikels if a.get('url') and a.get('titel')]


def ordenen(artikels):
    """Het recentste artikel eerst; bij een gelijke datum de bestandsvolgorde,
    zonder datum achteraan. Zoals OpPad.ordenen()."""
    rij = sorted(enumerate(artikels), key=lambda x: (x[1].get('datum') or '', -x[0]), reverse=True)
    return [a for _, a in rij]


def startselectie(artikels, nu=None):
    """De drie van de startpagina, bewust met drie verschillende invalshoeken: het
    recentste artikel, een seizoensartikel ('maanden' bevat de huidige maand) en een
    verrassend thema ('verrassing': true, dagelijks wisselend). Twee artikels met
    hetzelfde 'reeks' of 'thema' staan nooit samen, en 'startpagina': false houdt een
    artikel van de startpagina. Is een plaats niet in te vullen, dan komt het recentste
    artikel dat nog past. Zoals OpPad.startselectie(). `nu` is een datum (standaard
    vandaag, volgens UTC zoals de bouw)."""
    nu = nu or datetime.now(timezone.utc).date()
    dag = nu.toordinal() - 719163  # dagen sinds 1970-01-01, zoals Date.UTC(...) / 864e5
    rij = [a for a in ordenen(artikels) if a.get('startpagina') is not False]

    def sleutel(a):
        return a.get('reeks') or a.get('thema') or a.get('id') or a.get('url')

    keuze = []

    def vrij(a):
        return all(a is not k and sleutel(a) != sleutel(k) for k in keuze)

    if rij:
        keuze.append(rij[0])
    seizoen = next((a for a in rij if vrij(a) and nu.month in (a.get('maanden') or [])), None)
    if seizoen:
        keuze.append(seizoen)
    verrassend = [a for a in rij if a.get('verrassing') and vrij(a)]
    if verrassend:
        keuze.append(verrassend[dag % len(verrassend)])
    for a in rij:
        if len(keuze) < 3 and vrij(a):
            keuze.append(a)
    return keuze

def bestand(a):
    """'/bij-de-kachel' wordt 'bij-de-kachel.html'."""
    naam = a['url'].strip('/')
    if not re.fullmatch(r'[a-z0-9-]+', naam):
        raise SystemExit(f"STOP: oppad.json heeft een ongeldige url: {a['url']}")
    return naam + '.html'


def esc(s):
    """Zoals OpPad.esc: alleen & < > en het dubbele aanhalingsteken."""
    s = '' if s is None else str(s)
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;'))


def _getal(n):
    return str(int(n)) if isinstance(n, float) and n.is_integer() else str(n)


def datum(a):
    m = re.fullmatch(r'(\d{4})-(\d{2})-(\d{2})', a.get('datum') or '')
    if not m:
        return ''
    return f'<time datetime="{a["datum"]}">{int(m[3])} {MAANDEN[int(m[2]) - 1]} {m[1]}</time>'


def beeld(a, sizes, eerste):
    b = a.get('beeld')
    if not b or not b.get('bestanden'):
        return ''
    for veld in ('breed', 'hoog'):
        if not isinstance(b.get(veld), (int, float)):
            raise SystemExit(f"STOP: oppad.json mist '{veld}' bij het beeld van {a['url']}.")

    def reeks(soort):
        return ', '.join(f'{esc(f[soort])} {_getal(f["w"])}w' for f in b['bestanden'])

    basis = next((f for f in b['bestanden'] if f['w'] == b['breed']), b['bestanden'][0])
    return ('<span class="opfoto"><picture>'
            f'<source type="image/avif" srcset="{reeks("avif")}" sizes="{esc(sizes)}">'
            f'<source type="image/webp" srcset="{reeks("webp")}" sizes="{esc(sizes)}">'
            f'<img src="{esc(basis["webp"])}" width="{_getal(b["breed"])}" height="{_getal(b["hoog"])}"'
            f' alt="{esc(b.get("alt") or "")}"'
            + (' fetchpriority="high"' if eerste else ' loading="lazy"') + ' decoding="async"></picture></span>')


def credit(a):
    b = (a.get('beeld') or {}).get('bron')
    if not b:
        return ''
    return (f'<small class="opbron">Foto: {esc(b.get("maker"))}, <a href="{esc(b.get("licentieurl"))}"'
            f' rel="license noopener">{esc(b.get("licentie"))}</a></small>')


def kaart(a, variant, eerste=False):
    """variant: 'groot' (uitgelicht), 'klein' (compact) of 'lijst' (overzicht)"""
    feiten = (f'<ul class="opfeiten">{"".join(f"<li>{esc(f)}</li>" for f in a["feiten"])}</ul>'
              if a.get('feiten') else '')
    klein = variant == 'klein'
    rubriek = ''
    if a.get('rubriek') or a.get('datum'):
        delen = [x for x in (esc(a['rubriek']) if a.get('rubriek') else '', datum(a)) if x]
        rubriek = '<p class="oprubriek">' + SCHEIDING.join(delen) + '</p>'
    return (f'<article class="opkaart op-{variant}">'
            + beeld(a, SIZES[variant], eerste)
            + ('' if klein else credit(a))
            + '<div class="optekst">'
            + rubriek
            + f'<h3 class="optitel"><a href="{esc(a["url"])}">{esc(a["titel"])}</a></h3>'
            + ('' if klein else (f'<p class="opomschrijving">{esc(a["omschrijving"])}</p>'
                                 if a.get('omschrijving') else '') + feiten)
            + (credit(a) if klein else '<p class="oplees" aria-hidden="true">Lees het artikel</p>')
            + '</div></article>')
