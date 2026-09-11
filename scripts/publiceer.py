"""Ververst de site met de nieuwste csv en foto's en zet ze klaar voor wrangler.

Uitgangspunt is de map site/, een kopie van de repo sterreman/kroegenkaraf. Die
bevat de pagina's, de css, de javascript en leaflet. Dit script raakt daar niets
van aan; het vervangt alleen data/zaken.json, bouwt de map fotos/ opnieuw op en
zet de datum in de voettekst goed.

Zo blijft het werk verdeeld: het uitzicht van de site verandert via GitHub, de
inhoud verandert elke nacht vanzelf.

Nodig in de werkmap:  site/ (de kloon), cafes_100_jaar_v11.csv, fotos/
Daarna:               npx wrangler deploy
"""
import csv, datetime, json, os, re, shutil, sys, unicodedata
from PIL import Image, ImageOps
from zoneinfo import ZoneInfo
import math

CSV   = 'cafes_100_jaar_v11.csv'
FOTOS = 'fotos'
SITE  = 'site'

KLEIN_PX, KLEIN_Q = 92, 62      # miniatuur in de lijst, 46 css-pixels op 2x
GROOT_PX, GROOT_Q = 1100, 58    # het beeld in het opengeklapte kaartje
GROOT_MAX_H = 900

MAANDEN = ('januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
           'augustus', 'september', 'oktober', 'november', 'december')


def vandaag():
    d = datetime.datetime.now(ZoneInfo('Europe/Brussels')).date()
    return f'{d.day} {MAANDEN[d.month - 1]} {d.year}'


def slug(t):
    t = unicodedata.normalize('NFD', t.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '', t)


def sociaal(v, host):
    v = (v or '').strip()
    if not v:
        return ''
    if v.startswith(('http://', 'https://')):
        return v
    if '/' in v or '.' in v:
        return 'https://' + v.lstrip('/')
    return 'https://' + host + '/' + v.lstrip('@')


VOOR = ('cafe', 'cafee', 'eetcafe', 'eetkafee', 'kafee', 'taverne', 'herberg',
        'bistro', 'brasserie', 'de', 'den', 'het', 't', 'in', 'bij', 'oud', 'oude')


def kern(naam):
    w = [x for x in re.split(r"[^A-Za-z0-9À-ſ]+", naam) if x]
    while w and slug(w[0]) in VOOR:
        w.pop(0)
    return slug(''.join(w)) or slug(naam)


def zoek_rij(fslug, rijen):
    """Welke zaak hoort bij dit fotobestand. Een bestandsnaam mag maar een
    plaatsnaam bevatten, anders blijft de foto liggen."""
    kand = [r for r in rijen
            if slug(r['Naam']) in fslug
            or (len(kern(r['Naam'])) >= 4 and kern(r['Naam']) in fslug)]
    if len(kand) <= 1:
        return (kand[0] if kand else None), kand
    exact = [r for r in kand if slug(r['Naam']) == fslug]
    if len(exact) == 1:
        return exact[0], kand
    op_plaats = []
    for r in kand:
        delen = [slug(x) for x in re.split(r'[()]', r['Gemeente']) if slug(x)]
        if any(len(d) >= 4 and d in fslug for d in delen):
            op_plaats.append(r)
    return (op_plaats[0] if len(op_plaats) == 1 else None), kand


# ---- controle vooraf ---------------------------------------------------------
for pad, wat in ((SITE, 'de kloon van de repo'), (CSV, 'de csv')):
    if not os.path.exists(pad):
        sys.exit(f'STOP: {pad} ontbreekt ({wat}). Niets gepubliceerd.')
for pagina in ('index.html', 'kaart.html'):
    if not os.path.exists(f'{SITE}/{pagina}'):
        sys.exit(f'STOP: {SITE}/{pagina} ontbreekt. Is de kloon wel gelukt? '
                 'Niets gepubliceerd.')
shutil.rmtree(f'{SITE}/.git', ignore_errors=True)   # nooit meepubliceren

with open(CSV, encoding='utf-8-sig', newline='') as fp:
    reader = csv.DictReader(fp, strict=True)
    required = {'Naam', 'Gemeente', 'Provincie', 'Status', 'Soort'}
    missing = required - set(reader.fieldnames or [])
    if missing:
        sys.exit('STOP: csv mist verplichte kolommen: ' + ', '.join(sorted(missing)))
    rows = list(reader)
for number, row in enumerate(rows, 2):
    if None in row or any(v is None for v in row.values()):
        sys.exit(f'STOP: csv-rij {number} heeft een verkeerd aantal velden.')
    if not all((row.get(k) or '').strip() for k in ('Naam', 'Provincie')):
        sys.exit(f'STOP: csv-rij {number} mist Naam of Provincie.')
    if not (row.get('Gemeente') or '').strip() and row['Status'].strip() != 'Te checken':
        sys.exit(f'STOP: csv-rij {number} mist Gemeente en staat niet op Te checken.')
    la, lo = (row.get('Latitude') or '').strip(), (row.get('Longitude') or '').strip()
    if bool(la) != bool(lo):
        sys.exit(f'STOP: csv-rij {number} heeft een onvolledig coordinatenpaar.')
    if la:
        try:
            lat, lon = float(la), float(lo)
            assert math.isfinite(lat) and math.isfinite(lon)
            assert -90 <= lat <= 90 and -180 <= lon <= 180
        except (ValueError, AssertionError):
            sys.exit(f'STOP: csv-rij {number} heeft ongeldige coordinaten.')
if not os.path.isdir(FOTOS):
    sys.exit('STOP: fotomap ontbreekt.')
if len(rows) < 100:
    sys.exit(f'STOP: de csv bevat maar {len(rows)} rijen, dat klopt niet. '
             'Niets gepubliceerd.')

# Er werken ook andere handen in dit bestand, dus vertrouw de vorm niet blind.
KERN = ('Naam', 'Gemeente', 'Provincie')
VERWACHT = KERN + ('Adres', 'Facebook', 'Instagram', 'Soort', 'Info', 'Status',
                   'Gesloten op', 'Datum toegevoegd', 'Geverifieerd op',
                   'Latitude', 'Longitude')
kolommen = list(rows[0].keys())
ontbreekt = [k for k in KERN if k not in kolommen]
if ontbreekt:
    sys.exit(f'STOP: de csv mist de kolom(men) {", ".join(ontbreekt)}. Is het wel '
             f'een komma-gescheiden bestand? Gevonden kolommen: {kolommen[:6]}. '
             'Niets gepubliceerd.')
for k in VERWACHT:
    if k not in kolommen:
        print(f'  LET OP: de kolom {k} ontbreekt in de csv, dat veld blijft leeg')
for k in kolommen:
    if k and k not in VERWACHT and k != 'Notitie':
        print(f'  LET OP: onbekende kolom {k} in de csv, die gaat niet mee')

# Soorten komen uit de CSV; lijst en kaart tonen elke aanwezige categorie.
# Interne filterwaarden en onbruikbare labels blijven geblokkeerd.
soorten = {(r.get('Soort') or '').strip() for r in rows}
ongeldig = sorted(s for s in soorten if s.startswith('_') or len(s) > 120
                  or any(ord(c) < 32 or ord(c) == 127 for c in s))
if ongeldig:
    sys.exit(f'STOP: ongeldige categorielabels: {ongeldig}.')
STATUSSEN = {'Geverifieerd', 'Te checken', 'Gesloten'}
vreemd_status = sorted({(r.get('Status') or '').strip() for r in rows} - STATUSSEN)
if vreemd_status:
    sys.exit(f'STOP: ongeldige Status {vreemd_status}.')
zonder_gemeente = sum(not (r.get('Gemeente') or '').strip() for r in rows)
if zonder_gemeente:
    print(f'  LET OP: {zonder_gemeente} zaken met status Te checken hebben nog geen gemeente.')
print(f'{len(soorten - {""})} categorieën uit de CSV beschikbaar in lijst en kaart.')

# ---- controle op de coordinaten ----------------------------------------------
# Coordinaten worden ook door andere hulpmiddelen ingevuld. Een verkeerd getal
# valt in een tabel niet op maar op een kaart wel, dus we kijken naar de drie
# soorten fouten die zich in de praktijk voordoen.
VLAAMS = {'Antwerpen', 'Oost-Vlaanderen', 'West-Vlaanderen', 'Vlaams-Brabant',
          'Limburg', 'Brussel'}
VL_BOX = (2.50, 5.95, 50.65, 51.55)      # lengte min/max, breedte min/max

punten = {}
buiten, grof = [], []
for r in rows:
    la, lo = (r.get('Latitude') or '').strip(), (r.get('Longitude') or '').strip()
    if not la or not lo:
        continue
    try:
        laf, lof = float(la), float(lo)
    except ValueError:
        buiten.append((r, la, lo, 'geen getal'))
        continue
    prov = (r.get('Provincie') or '').strip()
    if prov in VLAAMS and not (VL_BOX[0] <= lof <= VL_BOX[1]
                               and VL_BOX[2] <= laf <= VL_BOX[3]):
        buiten.append((r, la, lo, f'ligt buiten Vlaanderen maar staat als {prov}'))
    # Weinig cijfers na de komma betekent een ruwe schatting, geen echt adres.
    if min(len(la.partition('.')[2]), len(lo.partition('.')[2])) < 4:
        grof.append((r, la, lo))
    punten.setdefault((round(laf, 5), round(lof, 5)), []).append(r)

for r, la, lo, waarom in buiten:
    print(f'  LET OP: {r["Naam"]}, {r["Gemeente"]} ({la}, {lo}) {waarom}')
for r, la, lo in grof:
    print(f'  LET OP: {r["Naam"]}, {r["Gemeente"]} heeft een grove coordinaat '
          f'({la}, {lo}), dat is eerder het dorp dan het adres')
stapels = {k: v for k, v in punten.items() if len(v) > 1}
for (la, lo), rs in sorted(stapels.items(), key=lambda x: -len(x[1])):
    print(f'  LET OP: {len(rs)} zaken staan op exact ({la}, {lo}): '
          + ', '.join(f'{r["Naam"]} ({r["Gemeente"]})' for r in rs)
          + '')
# ---- foto's ------------------------------------------------------------------
shutil.rmtree(f'{SITE}/{FOTOS}', ignore_errors=True)
os.makedirs(f'{SITE}/{FOTOS}', exist_ok=True)
koppeling, twijfel, stuk, fotobytes = {}, [], [], 0
for naam in sorted(os.listdir(FOTOS)) if os.path.isdir(FOTOS) else []:
    stam, ext = os.path.splitext(naam)
    if naam.startswith('.') or ext.lower() not in ('.jpg', '.jpeg', '.png', '.webp', '.avif'):
        continue
    try:
        im = ImageOps.exif_transpose(Image.open(os.path.join(FOTOS, naam)))
        im.load()
    except Exception as e:
        stuk.append(f'{naam} (niet te openen: {e})')
        continue
    r, kand = zoek_rij(slug(stam), rows)
    if r is None:
        twijfel.append((naam, kand))
        continue
    if id(r) in koppeling:
        sys.exit(f'STOP: meerdere foto’s voor dezelfde zaak: {naam}.')
    naar = slug(r['Naam']) + '-' + slug(r['Gemeente'].split(' (')[0])
    if os.path.exists(f'{SITE}/{FOTOS}/{naar}.avif'):
        sys.exit(f'STOP: dubbele fotobestemming: {naar}.')
    ImageOps.fit(im, (KLEIN_PX, KLEIN_PX), Image.LANCZOS).convert('RGB').save(
        f'{SITE}/{FOTOS}/{naar}-klein.avif', 'AVIF', quality=KLEIN_Q)
    groot = im.copy()
    groot.thumbnail((GROOT_PX, GROOT_MAX_H), Image.LANCZOS)
    groot.convert('RGB').save(f'{SITE}/{FOTOS}/{naar}.avif', 'AVIF', quality=GROOT_Q)
    fotobytes += (os.path.getsize(f'{SITE}/{FOTOS}/{naar}-klein.avif')
                  + os.path.getsize(f'{SITE}/{FOTOS}/{naar}.avif'))
    koppeling[id(r)] = (naam, naar)

if stuk:
    sys.exit('STOP: onleesbare foto’s: ' + '; '.join(stuk))

# ---- zaken.json --------------------------------------------------------------
data = []
for r in rows:
    v_ = lambda k: (r.get(k) or '').strip()
    d = {'n': v_('Naam'), 'g': v_('Gemeente'), 'p': v_('Provincie'),
         'a': v_('Adres'), 't': v_('Soort'), 'i': v_('Info'),
         's': v_('Status'), 'z': v_('Gesloten op'),
         'd': v_('Datum toegevoegd'), 'v': v_('Geverifieerd op'),
         'fb': sociaal(r.get('Facebook'), 'www.facebook.com'),
         'ig': sociaal(r.get('Instagram'), 'www.instagram.com')}
    for kol, sleutel in (('Latitude', 'lat'), ('Longitude', 'lon')):
        v = (r.get(kol) or '').strip()
        if v:
            try:
                d[sleutel] = round(float(v), 6)
            except ValueError:
                pass
    if id(r) in koppeling:
        d['foto'] = koppeling[id(r)][1]
    data.append({k: v for k, v in d.items() if v not in ('', None)})

os.makedirs(f'{SITE}/data', exist_ok=True)
with open(f'{SITE}/data/zaken.json', 'w', encoding='utf-8') as fp:
    json.dump(data, fp, ensure_ascii=False, separators=(',', ':'))

# ---- datum en aantal in de pagina's ------------------------------------------
for pagina in ('index.html', 'kaart.html'):
    p = f'{SITE}/{pagina}'
    t = open(p, encoding='utf-8').read()
    t = t.replace('__DATUM__', vandaag()).replace('__AANTAL__', str(len(data)))
    t, n = re.subn(r'(const BIJGEWERKT = ")[^"]*(")', rf'\g<1>{vandaag()}\g<2>', t)
    if n != 1:
        print(f'  LET OP: de datum in {pagina} niet gevonden ({n} treffers), '
              'de voettekst blijft op de oude datum staan')
    t = re.sub(r'(<meta name="description" content="[^"]*?)\b\d+ zaken',
               rf'\g<1>{len(data)} zaken', t)
    open(p, 'w', encoding='utf-8').write(t)

# ---- verslag -----------------------------------------------------------------
met_coord = sum(1 for d in data if 'lat' in d)
print(f'{len(data)} zaken, '
      f'{sum(1 for d in data if d["s"] == "Geverifieerd")} geverifieerd, '
      f'{sum(1 for d in data if d["s"] == "Te checken")} te checken, '
      f'{sum(1 for d in data if d["s"] == "Gesloten")} gesloten, '
      f'{sum(1 for d in data if not d.get("t"))} zonder soort')
print(f'{met_coord} met coordinaat, {len(data) - met_coord} zonder')
print(f'soorten: ' + ', '.join(f'{s or "leeg"} {sum(1 for d in data if d.get("t", "") == s)}'
      for s in sorted({d.get('t', '') for d in data})))
print(f"foto's: {len(koppeling)} gekoppeld, samen {fotobytes/1024:.0f} KB")
for naam, kand in twijfel:
    print(f'  LET OP: {naam} ' + ('past op meerdere zaken: '
          + '; '.join(f'{r["Naam"]} ({r["Gemeente"]})' for r in kand)
          if kand else 'hoort bij geen enkele zaak'))
for m in stuk:
    print('  LET OP:', m)
print(f'klaar om te publiceren: {sum(len(f) for _, _, f in os.walk(SITE))} bestanden')
