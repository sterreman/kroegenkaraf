"""Geeft elke zaak een eigen pagina op /cafe/<plaats>/<naam>/.

Draait in .publication, na publiceer.py en voor check_build.py. Leest
site/data/zaken.json en schrijft:

  site/cafe/<plaats>/<naam>/index.html   de pagina van de zaak
  site/cafe/<plaats>/<naam>/deel.jpg     het kaartje dat WhatsApp en co tonen
  site/data/slugs.json                   het register met de vaste url's
  site/sitemap.xml, site/robots.txt, site/_redirects

en zet de url van elke zaak als veld 'u' terug in zaken.json, zodat de lijst en
de kaart ernaar kunnen linken.

Vaste url's
-----------
Een gedeelde link mag nooit breken, ook niet als de naam of de gemeente later
verbeterd wordt. Daarom wordt een url niet elke nacht opnieuw uit de naam
afgeleid. Het register data/slugs.json wordt mee gepubliceerd en bij de volgende
bouw van de live site teruggehaald: wie er al in staat, houdt zijn url.

Een zaak wordt in het register teruggevonden
  1. op naam en gemeente, precies zoals ze er stonden;
  2. anders op de kern van de naam (zonder Café, De, 't, ...) samen met dezelfde
     hoofdgemeente of een ligging binnen 300 meter. Zo overleeft een url een
     verbeterde schrijfwijze of een deelgemeente die erbij komt.
Een zaak die uit de lijst verdwijnt, verliest haar pagina maar niet haar link:
_redirects stuurt de oude url door naar de zaak die nu op die plek staat, of
anders naar de lijst gefilterd op de gemeente. Een eenmaal gebruikte url wordt
nooit aan een andere zaak gegeven.

Is de live site onbereikbaar, dan stopt de bouw. Zonder register zouden
hernoemde zaken stilletjes een nieuwe url krijgen en oude links breken. Pas bij
een 404 (het register bestaat nog niet) begint het register van nul.
"""
import datetime
import heapq
import html
import json
import math
import os
import re
import shutil
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ORIGIN = os.environ.get('SITE_ORIGIN', 'https://kroegenkaraf.be').rstrip('/')
SITE = Path('site')
REPO = Path(__file__).resolve().parents[1]
FONTS = Path(__file__).resolve().parent / 'fonts'
REGISTER = 'data/slugs.json'

BUREN = 5            # zoveel zaken in het blok In de buurt
BUREN_MAX_KM = 15    # verder weg telt niet meer als in de buurt

MAANDEN = ('januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
           'augustus', 'september', 'oktober', 'november', 'december')

VOOR = ('cafe', 'cafee', 'eetcafe', 'eetkafee', 'kafee', 'taverne', 'herberg',
        'bistro', 'brasserie', 'de', 'den', 'het', 't', 'in', 'bij', 'oud', 'oude')


# ---- kleine hulpjes ----------------------------------------------------------

def zonder_accent(t):
    t = unicodedata.normalize('NFD', t or '')
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn')


def sleutel(t):
    return re.sub(r'[^a-z0-9]+', '', zonder_accent(t).lower())


def url_deel(t):
    """Leesbaar stuk url: 'Café 't Hoekske' wordt 'cafe-t-hoekske'."""
    t = zonder_accent(t).lower().replace("'", '').replace('’', '')
    t = t.replace('&', ' en ')
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-') or 'zaak'


def kern(naam):
    w = [x for x in re.split(r"[^A-Za-z0-9À-ſ]+", naam or '') if x]
    while len(w) > 1 and sleutel(w[0]) in VOOR:
        w.pop(0)
    return sleutel(''.join(w)) or sleutel(naam)


def plaats(g):
    """'Wespelaar (Haacht)' wordt 'Wespelaar'."""
    return (g or '').split(' (')[0].strip()


def hoofdgemeente(g):
    m = re.search(r'\(([^)]+)\)', g or '')
    return (m.group(1) if m else g or '').strip()


def km(a, b):
    r = math.pi / 180
    h = (math.sin((b[0] - a[0]) * r / 2) ** 2
         + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2)
    return 12742 * math.asin(math.sqrt(min(1, h)))


def afstand_tekst(x):
    if x < 1:
        return f'{max(10, round(x * 100) * 10)} m'
    return (f'{x:.1f}' if x < 10 else f'{x:.0f}').replace('.', ',') + ' km'


def datum(t):
    m = re.fullmatch(r'(\d{4})-(\d{2})-(\d{2})', (t or '').strip())
    if not m:
        return (t or '').strip()
    j, mnd, d = map(int, m.groups())
    return f'{d} {MAANDEN[mnd - 1]} {j}'


def e(t):
    return html.escape(t or '', quote=True)


def alineas(t):
    """Info in alinea's: elke regelovergang in de cel begint een nieuwe alinea."""
    return [a.strip() for a in re.split(r'\r?\n', t or '') if a.strip()]


def kort(t, n=158):
    t = re.sub(r'\s+', ' ', t or '').strip()
    if len(t) <= n:
        return t
    return t[:n].rsplit(' ', 1)[0].rstrip(',;:.') + '…'


def maps_zoek(d):
    q = ', '.join(x for x in (d.get('n'), d.get('a'), d.get('g'), 'België') if x)
    return 'https://www.google.com/maps/search/?api=1&query=' + urllib.parse.quote(q)


def maps_route(d):
    q = ', '.join(x for x in (d.get('n'), d.get('a'), d.get('g'), 'België') if x)
    return 'https://www.google.com/maps/dir/?api=1&destination=' + urllib.parse.quote(q)


# ---- het register ------------------------------------------------------------

def haal_register():
    if os.environ.get('SLUGS_BESTAND'):          # enkel om lokaal te testen
        p = Path(os.environ['SLUGS_BESTAND'])
        return json.loads(p.read_text(encoding='utf-8')) if p.exists() else None
    nonce = datetime.datetime.now(datetime.timezone.utc).timestamp()
    req = urllib.request.Request(f'{ORIGIN}/{REGISTER}?bouw={nonce}',
                                 headers={'Cache-Control': 'no-cache',
                                          'User-Agent': 'KroegEnKaraf-publicatie/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise SystemExit(f'STOP: register met vaste urls niet op te halen ({exc}). '
                         'Zonder register kunnen gedeelde links breken.')
    except (OSError, ValueError) as exc:
        raise SystemExit(f'STOP: register met vaste urls niet op te halen ({exc}). '
                         'Zonder register kunnen gedeelde links breken.')


def ken_urls_toe(data, register):
    oud = list(register.get('zaken', [])) if register else []
    weg_oud = list(register.get('weg', [])) if register else []
    for x in oud + weg_oud:
        if not (isinstance(x, dict) and isinstance(x.get('u'), str)
                and x['u'].startswith('cafe/')):
            raise SystemExit('STOP: het register met vaste urls is ongeldig.')
    bezet = {x['u'] for x in oud} | {x['u'] for x in weg_oud}
    vrij = set(range(len(oud)))
    toegekend = {}

    # 1. zelfde naam en gemeente
    per_sleutel = {}
    for i, x in enumerate(oud):
        per_sleutel.setdefault((sleutel(x.get('n')), sleutel(x.get('g'))), []).append(i)
    for j, d in enumerate(data):
        kand = [i for i in per_sleutel.get((sleutel(d['n']), sleutel(d.get('g'))), []) if i in vrij]
        if kand:
            toegekend[j] = oud[kand[0]]['u']
            vrij.discard(kand[0])

    # 2. zelfde kern van de naam, en dezelfde hoofdgemeente of vlakbij
    hernoemd = 0
    for j, d in enumerate(data):
        if j in toegekend:
            continue
        kand = []
        for i in vrij:
            x = oud[i]
            if kern(x.get('n')) != kern(d['n']):
                continue
            zelfde_gem = sleutel(hoofdgemeente(x.get('g'))) == sleutel(hoofdgemeente(d.get('g')))
            dichtbij = ('lat' in x and 'lat' in d
                        and km((x['lat'], x['lon']), (d['lat'], d['lon'])) < .3)
            if zelfde_gem or dichtbij:
                kand.append(i)
        if len(kand) == 1:
            toegekend[j] = oud[kand[0]]['u']
            vrij.discard(kand[0])
            hernoemd += 1
            print(f'  url behouden na wijziging: {oud[kand[0]].get("n")} '
                  f'({oud[kand[0]].get("g")}) is nu {d["n"]} ({d.get("g")})')

    # 3. nieuwe zaken krijgen een nieuwe url, nooit een die al ooit gebruikt is
    nieuw = 0
    for j, d in enumerate(data):
        if j in toegekend:
            continue
        basis = f'cafe/{url_deel(plaats(d.get("g")) or d.get("p") or "belgie")}/{url_deel(d["n"])}'
        u, n = basis, 2
        while u in bezet:
            u, n = f'{basis}-{n}', n + 1
        bezet.add(u)
        toegekend[j] = u
        nieuw += 1

    for j, d in enumerate(data):
        d['u'] = toegekend[j]

    weg = weg_oud + [oud[i] for i in sorted(vrij)]
    print(f'vaste urls: {len(data) - nieuw - hernoemd} ongewijzigd, {hernoemd} behouden '
          f'na een naamswijziging, {nieuw} nieuw, {len(vrij)} zaken uit de lijst verdwenen')
    return weg


def nieuw_register(data, weg):
    def item(d):
        x = {'u': d['u'], 'n': d['n'], 'g': d.get('g', '')}
        if 'lat' in d:
            x['lat'], x['lon'] = d['lat'], d['lon']
        return x
    return {'schema': 1, 'zaken': [item(d) for d in data], 'weg': weg}


def doorverwijzingen(data, weg):
    """Oude url's van verdwenen zaken: naar de zaak op dezelfde plek, anders naar
    de lijst gefilterd op de gemeente."""
    regels = []
    for x in weg:
        doel = None
        if 'lat' in x:
            dichtst = min((d for d in data if 'lat' in d),
                          key=lambda d: km((x['lat'], x['lon']), (d['lat'], d['lon'])),
                          default=None)
            if dichtst and km((x['lat'], x['lon']), (dichtst['lat'], dichtst['lon'])) < .015:   # zelfde adres, niet de buren
                doel = f'/{dichtst["u"]}/'
        if not doel:
            doel = '/?q=' + urllib.parse.quote(plaats(x.get('g')) or '')
        regels.append(f'/{x["u"]}/ {doel} 301')
        regels.append(f'/{x["u"]} {doel} 301')
    return regels


# ---- in de buurt -------------------------------------------------------------

def zoek_buren(data):
    open_ = [d for d in data if 'lat' in d and d.get('s') != 'Gesloten']
    buren = {}
    for d in data:
        if 'lat' not in d:
            continue
        p = (d['lat'], d['lon'])
        kand = []
        for x in open_:
            if x is d:
                continue
            # snelle voorselectie in graden, pas dan de echte afstand
            if abs(x['lat'] - p[0]) > .15 or abs(x['lon'] - p[1]) > .25:
                continue
            a = km(p, (x['lat'], x['lon']))
            if a <= BUREN_MAX_KM:
                kand.append((a, x['u'], x))
        buren[d['u']] = [(a, x) for a, _, x in heapq.nsmallest(BUREN, kand)]
    return buren


# ---- het deelkaartje ---------------------------------------------------------

MARINE, CREME, VERMILJOEN, GRIJS = (19, 39, 56), (247, 238, 223), (239, 106, 64), (154, 169, 182)
W, H = 1200, 630


def lettertype(naam, grootte, gewicht=None, breedte=100):
    f = ImageFont.truetype(str(FONTS / naam), grootte)
    if gewicht:
        try:
            f.set_variation_by_axes([gewicht, breedte] if naam == 'Archivo.ttf' else [gewicht])
        except (OSError, ValueError):
            pass
    return f


def breek(draw, tekst, font, breedte):
    woorden, regels, huidig = tekst.split(), [], ''
    for w in woorden:
        proef = (huidig + ' ' + w).strip()
        if draw.textlength(proef, font=font) <= breedte or not huidig:
            huidig = proef
        else:
            regels.append(huidig)
            huidig = w
    if huidig:
        regels.append(huidig)
    return regels


class Kaartjes:
    def __init__(self):
        self.logo = Image.open(REPO / 'assets/logo.png').convert('RGBA')

    def maak(self, d, pad):
        img = Image.new('RGB', (W, H), MARINE)
        draw = ImageDraw.Draw(img)
        foto = None
        if d.get('foto'):
            try:
                foto = Image.open(SITE / 'fotos' / (d['foto'] + '.avif'))
                foto.load()
            except Exception as exc:
                print(f'  LET OP: foto van {d["n"]} niet te lezen voor het deelkaartje: {exc}')
                foto = None

        links, tekstbreedte = 72, 660
        if foto:
            vak = ImageOps.fit(foto.convert('RGB'), (460, H), Image.LANCZOS)
            img.paste(vak, (W - 460, 0))
            tekstbreedte = W - 460 - links - 56
            logo = self.logo.copy()
            logo.thumbnail((230, 175), Image.LANCZOS)
            img.paste(logo, (links - 6, 44), logo)
            boven = 44 + logo.height + 22
        else:
            logo = self.logo.copy()
            logo.thumbnail((400, 303), Image.LANCZOS)
            img.paste(logo, (W - logo.width - 64, (H - logo.height) // 2), logo)
            tekstbreedte = W - logo.width - 64 - links - 48
            boven = 120

        dicht = d.get('s') == 'Gesloten'
        soortlijn = ' · '.join(x for x in ((d.get('t') or 'Café').upper(),) if x)
        f_klein = lettertype('Archivo.ttf', 28, 700, 85)
        draw.text((links, boven), soortlijn, font=f_klein, fill=VERMILJOEN)
        if dicht:
            # het label staat naast de soort, dan duwt het nooit tegen de voet
            f_band = lettertype('Archivo.ttf', 20, 800)
            label = 'GESLOTEN' + (f' {d["z"]}'.upper() if d.get('z') else '')
            x0 = links + draw.textlength(soortlijn, font=f_klein) + 18
            tb = draw.textlength(label, font=f_band)
            draw.rectangle((x0, boven - 3, x0 + tb + 22, boven + 31), outline=GRIJS, width=2)
            draw.text((x0 + 11, boven + 2), label, font=f_band, fill=GRIJS)

        # naam: zo groot als past, hoogstens drie regels
        # dezelfde smalle, zware Archivo als de naam op de pagina
        for grootte in (112, 100, 90, 80, 72, 64, 56, 50):
            f_naam = lettertype('Archivo.ttf', grootte, 800, 66)
            regels = breek(draw, d['n'], f_naam, tekstbreedte)
            past = all(draw.textlength(r, font=f_naam) <= tekstbreedte for r in regels)
            wees = len(regels) > 1 and min(len(r) for r in regels) < 4   # geen 't alleen op een regel
            if len(regels) <= 3 and past and not wees:
                break
        y = boven + 46
        for r in regels[:3]:
            draw.text((links, y), r, font=f_naam, fill=CREME)
            y += int(grootte * .98)

        f_plaats = lettertype('Petrona.ttf', 38, 500)
        plaatslijn = d.get('g') or d.get('p') or ''
        for r in breek(draw, plaatslijn, f_plaats, tekstbreedte)[:2]:
            y += 14
            draw.text((links, y), r, font=f_plaats, fill=CREME)
            y += 40

        f_voet = lettertype('Archivo.ttf', 24, 600)
        draw.text((links, H - 64), 'kroegenkaraf.be', font=f_voet, fill=GRIJS)
        pad.parent.mkdir(parents=True, exist_ok=True)
        img.save(pad, 'JPEG', quality=84, optimize=True, progressive=True)


# ---- de pagina ---------------------------------------------------------------

MERK = {
    'fb': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>',
    'ig': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 0 1-2.88 0 1.44 1.44 0 0 1 2.88 0z"/></svg>',
}
SPELD = ('<svg viewBox="0 0 24 24" aria-hidden="true">'
         '<path class="pin" d="M12 2.2a7 7 0 0 0-7 7c0 5.25 7 12.6 7 12.6s7-7.35 7-12.6a7 7 0 0 0-7-7z"/>'
         '<circle class="dot" cx="12" cy="9.2" r="2.5"/></svg>')
ICOON_ROUTE = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/>'
               '<path d="M9 14v-2.5a1.5 1.5 0 0 1 1.5-1.5H15M13 8l2 2-2 2"/></svg>')
ICOON_DEEL = ('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/>'
              '<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/>'
              '<path d="m8.3 13.3 7.4 4.4M15.7 6.3l-7.4 4.4"/></svg>')

VERSIE = 'pagina-20260929d'

KORT_VERHAAL = 480   # tot zoveel tekens blijft de hele beschrijving bovenaan

FONTS_URL = ('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..100,500..800'
             '&family=Petrona:ital,wght@0,400..600;1,400&display=swap')


def status_blok(d):
    if d.get('s') == 'Geverifieerd':
        t = ('Online gecontroleerd' + (f' op {datum(d["v"])}' if d.get('v') else '')
             + '. Dat zegt niets over de openingsuren van vandaag.')
        return f'<p class="controle">{e(t)}</p>'
    if d.get('s') == 'Gesloten':
        return ''
    return ('<p class="controle">Status nog te bevestigen. Controleer voor je bezoek of de '
            'zaak nog actief is en wanneer ze open is.</p>')


ZIN = re.compile(r"(?<=[a-zà-ÿ0-9)]{2}[.!?])\s+(?=[A-ZÀ-Ý'‘])")


def lead_en_rest(info):
    """De eerste zin van Info als introductie, als die kort genoeg is. De rest
    blijft gewone tekst. Er wordt niets herschreven, alleen gesplitst."""
    al = alineas(info)
    if not al:
        return '', []
    zinnen = ZIN.split(al[0], maxsplit=1)
    eerste = zinnen[0].strip()
    if len(eerste) > 190:
        return '', al
    rest = ([zinnen[1].strip()] if len(zinnen) > 1 else []) + al[1:]
    return eerste, rest


def naam_html(n):
    """Alleen 't en zijn varianten blijven met een vaste spatie aan het volgende
    woord, zodat 't nooit alleen op een regel staat. Langere voorwoorden niet:
    die zouden met het volgende woord een blok vormen dat niet meer past."""
    return re.sub(r"(?<![^\s(])([’'‘]t)\s+", lambda m: m.group(1) + '\u00a0',
                  e(n).replace('&#x27;', "'"))


_MAAT = None


def langste_blok_em(n):
    """Breedte in em van het langste stuk van de naam dat niet mag breken, gemeten
    in dezelfde smalle Archivo als op de pagina. De css laat de naam krimpen tot
    dat stuk op een regel past, zodat geen woord ooit middendoor gaat."""
    global _MAAT
    if _MAAT is None:
        _MAAT = lettertype('Archivo.ttf', 1000, 800, 66)
    tekst = re.sub(r"(?<![^\s(])([’'‘]t)\s+", lambda m: m.group(1) + '\u00a0', n)
    blokken = [b for b in re.split(r'[ \t\n-]+', tekst) if b]
    breedste = max((_MAAT.getlength(b) for b in blokken), default=0)
    return round(breedste / 1000 * 1.04 + .02, 3)


def plaats_html(g):
    """'Borgerhout (Antwerpen)': de hoofdgemeente iets stiller."""
    m = re.fullmatch(r'(.*?)\s*\(([^)]+)\)', g or '')
    if m:
        return f'{e(m.group(1))} <span>({e(m.group(2))})</span>'
    return e(g)


def json_ld(d, url, beeld):
    if d.get('s') == 'Gesloten':
        return ''
    x = {'@context': 'https://schema.org', '@type': 'BarOrPub', 'name': d['n'],
         'url': url, 'image': beeld}
    adres = {'@type': 'PostalAddress', 'addressLocality': hoofdgemeente(d.get('g')),
             'addressRegion': d.get('p', ''), 'addressCountry': 'BE'}
    if d.get('a'):
        adres['streetAddress'] = d['a']
    x['address'] = adres
    if 'lat' in d:
        x['geo'] = {'@type': 'GeoCoordinates', 'latitude': d['lat'], 'longitude': d['lon']}
    if d.get('i'):
        x['description'] = ' '.join(alineas(d['i']))
    zelf = [v for v in (d.get('fb'), d.get('ig')) if v]
    if zelf:
        x['sameAs'] = zelf
    blob = json.dumps(x, ensure_ascii=False).replace('</', '<\\/')
    return f'<script type="application/ld+json">{blob}</script>\n'


def pagina(d, buren):
    url = f'{ORIGIN}/{d["u"]}/'
    beeld = f'{ORIGIN}/{d["u"]}/deel.jpg'
    dicht = d.get('s') == 'Gesloten'
    gem = d.get('g') or ''
    adres = ', '.join(x for x in (d.get('a'), gem) if x)
    titel = f'{d["n"]}, {plaats(gem)}' if gem else d['n']
    omschrijving = kort(d.get('i')) or kort(
        f'{d.get("t") or "Café"} in {gem or d.get("p", "")}'
        + (f', {d["a"]}' if d.get('a') else '') + '. Adres, ligging en cafés in de buurt.')
    if dicht:
        omschrijving = kort(f'Gesloten{" sinds " + d["z"] if d.get("z") else ""}. ' + omschrijving)
    deeltekst = f'{d["n"]} in {plaats(gem) or d.get("p", "")}, gevonden op Kroeg & Karaf'
    q = urllib.parse.quote

    kruimel = ['<a href="/">Alle zaken</a>']
    if d.get('p'):
        kruimel.append(f'<a href="/?q={q(d["p"])}">{e(d["p"])}</a>')
    if gem and sleutel(plaats(gem)) != sleutel(d.get('p')):
        kruimel.append(f'<a href="/?q={q(plaats(gem))}">{e(plaats(gem))}</a>')

    # ---- de kop: naam, soort, plaats en de eerste zin
    lengte = len(d['n'])
    maat = ' zeerlang' if lengte > 38 else ' lang' if lengte > 20 else ''
    dichtlabel = ''
    if dicht:
        dichtlabel = ('<p class="dichtlabel">Gesloten'
                      + (f' sinds {e(datum(d["z"]))}' if d.get('z') else '') + '</p>')
    soort = f'<p class="soort">{e(d["t"])}</p>' if d.get('t') else ''
    plaatsregel = f'<p class="plaats">{plaats_html(gem)}</p>' if gem else (
        f'<p class="plaats">{e(d["p"])}</p>' if d.get('p') else '')
    # Een korte beschrijving blijft in een stuk bovenaan, naast het praktische blok.
    # Alleen een lange tekst loopt verder onder de kop, met de eerste zin als opening.
    lead, rest = lead_en_rest(d.get('i'))
    kort_verhaal = len(' '.join(alineas(d.get('i')))) <= KORT_VERHAAL
    verhaal = ''
    if kort_verhaal:
        verhaal = ((f'<p class="lead">{e(lead)}</p>' if lead else '')
                   + ''.join(f'<p>{e(a)}</p>' for a in rest))
        rest = []
    elif lead:
        verhaal = f'<p class="lead">{e(lead)}</p>'
    if d.get('tags'):
        verhaal += ('<p class="kenmerken"><span class="etiket">Kenmerken</span>'
                    + ', '.join(e(t) for t in d['tags']) + '</p>')

    foto = ''
    if d.get('foto'):
        foto = (f'<figure class="kopfoto"><img src="/fotos/{e(d["foto"])}.avif" '
                f'alt="Foto van {e(d["n"])}" width="1100" height="733" decoding="async"></figure>')

    # ---- praktisch: adres, route, delen, links, controle
    acties = []
    if not dicht:
        acties.append(f'<a class="route" href="{e(maps_route(d))}" target="_blank" rel="noopener">'
                      f'{ICOON_ROUTE}<span>Route</span></a>')
    links = [f'<li><button class="link" id="deel" type="button" aria-expanded="false" '
             f'aria-controls="deelpaneel" data-tekst="{e(deeltekst)}">{ICOON_DEEL}Delen</button></li>',
             f'<li><a class="link" href="{e(maps_zoek(d))}" target="_blank" rel="noopener">'
             f'{SPELD}Google Maps</a></li>']
    for sl, naam in (('ig', 'Instagram'), ('fb', 'Facebook')):
        if d.get(sl):
            links.append(f'<li><a class="link" href="{e(d[sl])}" target="_blank" rel="noopener">'
                         f'{MERK[sl]}{naam}</a></li>')
    deelpaneel = (
        '<div class="deelpaneel" id="deelpaneel" hidden>'
        f'<a href="https://wa.me/?text={q(deeltekst + " " + url)}" target="_blank" rel="noopener">WhatsApp</a>'
        f'<a href="https://www.facebook.com/sharer/sharer.php?u={q(url)}" target="_blank" rel="noopener">Facebook</a>'
        f'<a href="mailto:?subject={q(d["n"])}&amp;body={q(deeltekst + chr(10) + url)}">E-mail</a>'
        '<button type="button" id="kopieer">Link kopiëren</button>'
        '<span class="gekopieerd" id="gekopieerd" role="status"></span>'
        '</div>')
    adresblok = (f'<p class="adres"><span class="etiket">Adres</span>{e(adres)}</p>' if d.get('a')
                 else '<p class="adres"><span class="etiket">Adres</span>'
                      '<span class="onbekend">Nog aan te vullen</span></p>')
    archief = ('<p class="controle">Deze zaak is dicht en blijft als archief in de gids staan.</p>'
               if dicht else '')
    sinds = f' In de gids sinds {e(datum(d["d"]))}.' if d.get('d') else ''
    controle = status_blok(d) + archief
    if sinds:
        controle = (controle.replace('</p>', sinds + '</p>', 1) if controle
                    else f'<p class="controle">{sinds.strip()}</p>')
    praktisch = (f'<div class="praktisch">{adresblok}{"".join(acties)}'
                 f'<ul class="links">{"".join(links)}</ul>{deelpaneel}{controle}</div>')

    # ---- de romp: links de rest van een lange tekst en de ligging, rechts de buurt
    tekst = ''.join(f'<p>{e(a)}</p>' for a in rest)

    buurt = ''
    if buren:
        items = ''.join(
            f'<li><a href="/{x["u"]}/"><span class="bregel"><span class="bnm">{e(x["n"])}</span>'
            f'<span class="stip" aria-hidden="true"></span>'
            f'<span class="bafst">{afstand_tekst(a)}</span></span>'
            f'<span class="bsub">{e(" · ".join(v for v in (x.get("t"), plaats(x.get("g"))) if v))}</span></a></li>'
            for a, x in buren)
        kop = 'Wat er nog open is in de buurt' if dicht else 'In de buurt'
        buurt = (f'<aside class="buurt" aria-labelledby="buurtkop"><h2 id="buurtkop">{kop}</h2>'
                 f'<ol>{items}</ol></aside>')

    # ---- ligging
    if 'lat' in d:
        ligging = {'lat': d['lat'], 'lon': d['lon'], 'n': d['n'], 'dicht': dicht,
                   'buren': [{'lat': x['lat'], 'lon': x['lon'], 'n': x['n'], 'u': x['u']} for _, x in buren]}
        kaart = ('<section class="ligging" aria-labelledby="liggingkop"><h2 id="liggingkop">Ligging</h2>'
                 '<div id="minikaart" role="region" aria-label="Kaart met de ligging"></div>'
                 '<p class="kaartlinks">'
                 + ('' if dicht else f'<a href="/kaart.html#{d["u"]}">Bekijk op de grote kaart</a>')
                 + f'<a href="{e(maps_zoek(d))}" target="_blank" rel="noopener">Open in Google Maps</a></p>'
                 '<script type="application/json" id="ligging">'
                 + json.dumps(ligging, ensure_ascii=False).replace('</', '<\\/') + '</script></section>')
        leaflet = '<link rel="stylesheet" href="/assets/vendor/leaflet.css">\n'
        leaflet_js = '<script src="/assets/vendor/leaflet.js"></script>\n'
    else:
        kaart = ('<section class="ligging" aria-labelledby="liggingkop"><h2 id="liggingkop">Ligging</h2>'
                 '<p class="geenkaart">De exacte ligging is nog niet vastgelegd. '
                 f'<a href="{e(maps_zoek(d))}" target="_blank" rel="noopener">Zoek op Google Maps</a></p></section>')
        leaflet = leaflet_js = ''

    tekstblok = f'<div class="tekst">{tekst}</div>' if tekst else ''
    romp = (f'<div class="romp wrap{" zonderbuurt" if not buurt else ""}">'
            f'<div class="hoofdkolom">{tekstblok}{kaart}</div>'
            f'{buurt}</div>')

    klassen = ' '.join(k for k in ('zaak', 'dicht' if dicht else '', 'metfoto' if foto else '',
                                   'metverhaal' if verhaal else '') if k)

    return f'''<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#132738">
<title>{e(titel)} | Kroeg &amp; Karaf</title>
<meta name="description" content="{e(omschrijving)}">
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="place">
<meta property="og:site_name" content="Kroeg &amp; Karaf">
<meta property="og:locale" content="nl_BE">
<meta property="og:title" content="{e(titel)}">
<meta property="og:description" content="{e(omschrijving)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{e(beeld)}">
<meta property="og:image:width" content="{W}">
<meta property="og:image:height" content="{H}">
<meta property="og:image:alt" content="{e(d["n"])}, {e(gem)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS_URL.replace('&', '&amp;')}">
{leaflet}<link rel="stylesheet" href="/assets/cafe.css?v={VERSIE}">
{json_ld(d, url, beeld)}</head>
<body class="cafepagina">
<a class="naarinhoud" href="#inhoud">Naar de inhoud</a>
<header class="balk">
 <div class="wrap">
  <a class="merk" href="/"><img src="/assets/logo.png" alt="Kroeg &amp; Karaf, naar de volledige lijst" width="760" height="575"></a>
  <nav class="hoofdnav" aria-label="Kroeg &amp; Karaf"><a href="/">Alle zaken</a><a href="/kaart.html">Kaart</a></nav>
 </div>
</header>

<main id="inhoud">
 <article class="{klassen}">
  <div class="kop">
   <div class="wrap">
    <nav class="kruimel" aria-label="Kruimelpad">{' <span aria-hidden="true">/</span> '.join(kruimel)}</nav>
    <div class="kopraster">
     <div class="kopnaam">
      {dichtlabel}{soort}
      <h1 class="naam{maat}" style="--blok:{langste_blok_em(d['n'])}">{naam_html(d["n"])}</h1>
      {plaatsregel}
     </div>
     {foto}
    </div>
    <div class="kopvoet">
     {f'<div class="verhaal">{verhaal}</div>' if verhaal else ''}
     {praktisch}
    </div>
   </div>
  </div>
  {romp}
 </article>
</main>

<footer class="voet">
 <div class="wrap">
  <nav aria-label="Onderaan"><a href="/">Alle zaken</a><a href="/kaart.html">Kaart</a></nav>
  <p>Kroeg &amp; Karaf, de gids voor schoon volk en dorstige zielen</p>
 </div>
</footer>
{leaflet_js}<script src="/assets/cafe.js?v={VERSIE}"></script>
</body>
</html>
'''


# ---- alles samen -------------------------------------------------------------

def main():
    pad = SITE / 'data/zaken.json'
    if not pad.exists():
        sys.exit('STOP: site/data/zaken.json ontbreekt; draai eerst publiceer.py.')
    data = json.loads(pad.read_text(encoding='utf-8'))
    for f in ('Archivo.ttf', 'Petrona.ttf'):
        if not (FONTS / f).exists():
            sys.exit(f'STOP: lettertype {f} ontbreekt in scripts/fonts.')

    register = haal_register()
    if register is None:
        print('  LET OP: nog geen register met vaste urls gevonden; alle urls zijn nieuw.')
    elif register.get('schema') != 1:
        sys.exit('STOP: onbekend formaat van het register met vaste urls.')
    weg = ken_urls_toe(data, register)

    shutil.rmtree(SITE / 'cafe', ignore_errors=True)
    buren = zoek_buren(data)
    kaartjes = Kaartjes()
    for d in data:
        map_ = SITE / d['u']
        map_.mkdir(parents=True, exist_ok=True)
        (map_ / 'index.html').write_text(pagina(d, buren.get(d['u'], [])), encoding='utf-8')
        kaartjes.maak(d, map_ / 'deel.jpg')

    # zaken.json met de url erbij, register, sitemap, robots, doorverwijzingen
    with open(pad, 'w', encoding='utf-8') as fp:
        json.dump(data, fp, ensure_ascii=False, separators=(',', ':'))
    (SITE / REGISTER).write_text(json.dumps(nieuw_register(data, weg), ensure_ascii=False,
                                            separators=(',', ':')), encoding='utf-8')
    urls = [f'{ORIGIN}/', f'{ORIGIN}/kaart.html'] + [f'{ORIGIN}/{d["u"]}/' for d in data]
    (SITE / 'sitemap.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + ''.join(f'<url><loc>{e(u)}</loc></url>\n' for u in urls) + '</urlset>\n',
        encoding='utf-8')
    (SITE / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {ORIGIN}/sitemap.xml\n',
                                     encoding='utf-8')
    regels = doorverwijzingen(data, weg)
    if len(regels) > 1900:
        print(f'  LET OP: {len(regels)} doorverwijzingen, Cloudflare aanvaardt er 2000.')
    (SITE / '_redirects').write_text('\n'.join(regels) + ('\n' if regels else ''), encoding='utf-8')

    kb = sum(p.stat().st_size for p in (SITE / 'cafe').rglob('*') if p.is_file()) / 1024
    print(f"cafepagina's: {len(data)} pagina's en deelkaartjes, samen {kb/1024:.1f} MB, "
          f'{len(weg)} oude urls doorverwezen')


if __name__ == '__main__':
    main()
