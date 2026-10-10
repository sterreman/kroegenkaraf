"""Additional gates before an artifact can be published."""
import json
import re
from pathlib import Path

def main():
    base = json.loads(Path('baseline.json').read_text())
    data = json.loads(Path('site/data/zaken.json').read_text(encoding='utf-8'))
    if len(data) < base['count'] * .9:
        raise SystemExit(f"STOP: {len(data)} zaken is meer dan 10% minder dan de GitHub-referentie ({base['count']}).")
    photos = sum(bool(r.get('foto')) for r in data)
    if base['photos'] and photos < base['photos'] * .9:
        raise SystemExit(f"STOP: {photos} gekoppelde foto's is meer dan 10% minder dan de GitHub-referentie ({base['photos']}).")
    for row in data:
        if row.get('foto'):
            for suffix in ('.avif', '-klein.avif'):
                if not Path('site/fotos', row['foto'] + suffix).is_file():
                    raise SystemExit(f"STOP: fotobestand ontbreekt voor {row['n']}.")
        for extra in row.get('fotos', []):
            if not Path('site/fotos', extra['f'] + '.avif').is_file():
                raise SystemExit(f"STOP: carrouselfoto ontbreekt voor {row['n']}.")
    # Elke zaak heeft een eigen pagina en een deelkaartje, en elke url is uniek.
    urls = [row.get('u') for row in data]
    if not all(urls):
        raise SystemExit('STOP: niet elke zaak heeft een url; draaide cafepaginas.py wel?')
    if len(set(urls)) != len(urls):
        raise SystemExit('STOP: twee zaken delen dezelfde url.')
    for row in data:
        for name in ('index.html', 'deel.jpg'):
            if not Path('site', row['u'], name).is_file():
                raise SystemExit(f"STOP: {name} ontbreekt voor {row['n']} ({row['u']}).")
    for name in ('privacy.html', 'over.html', 'herfstwandelingen.html', 'assets/verhaal.css', 'assets/gemeente.css', 'assets/verhalen.json', 'assets/gemeenten.json', 'afspreken.html', 'assets/afspreken.js', 'lijst.html', 'data/start.json', 'assets/fonts/fonts.css', 'sitemap.xml', 'robots.txt', 'data/slugs.json', 'assets/cafe.css', 'assets/cafe.js'):
        if not Path('site', name).is_file():
            raise SystemExit(f'STOP: {name} ontbreekt.')
    print(f'{len(urls)} cafepaginas aanwezig.')
    # Verhalen linken naar cafepaginas: die moeten echt bestaan.
    for verhaal in ('herfstwandelingen.html',):
        for link in sorted(set(re.findall(r'href="/(cafe/[^"#?]+?)/?"', Path('site', verhaal).read_text(encoding='utf-8')))):
            if not Path('site', link, 'index.html').is_file():
                raise SystemExit(f'STOP: {verhaal} linkt naar een cafepagina die niet bestaat: /{link}/')
        tekst = Path('site', verhaal).read_text(encoding='utf-8')
        for beeld in sorted(set(re.findall(r'(/assets/verhalen/[^\s"]+)', tekst))):
            if not Path('site', beeld.lstrip('/')).is_file():
                raise SystemExit(f'STOP: {verhaal} toont een beeld dat ontbreekt: {beeld}')
    # Gemeentepagina's: eigen titel, canonical, deelkaartje, en elke link naar een cafe klopt.
    namen = json.loads(Path('site/assets/gemeenten.json').read_text(encoding='utf-8')).get('gemeenten', [])
    titels, gemeenten = set(), 0
    for map_ in sorted(Path('site/gemeente').glob('*/')):
        pagina = (map_ / 'index.html').read_text(encoding='utf-8')
        titel = re.search(r'<title>(.*?)</title>', pagina).group(1)
        if titel in titels:
            raise SystemExit(f'STOP: twee gemeentepagina\'s met dezelfde titel: {titel}')
        titels.add(titel)
        if f'<link rel="canonical" href="https://kroegenkaraf.be/gemeente/{map_.name}/">' not in pagina:
            raise SystemExit(f'STOP: canonical klopt niet op {map_.name}')
        if not (map_ / 'deel.jpg').is_file():
            raise SystemExit(f'STOP: deelkaartje ontbreekt voor gemeente {map_.name}')
        for link in set(re.findall(r'href="/(cafe/[^"#?]+?)/"', pagina)):
            if not Path('site', link, 'index.html').is_file():
                raise SystemExit(f'STOP: gemeente {map_.name} linkt naar een cafepagina die niet bestaat: /{link}/')
        gemeenten += 1
    gebouwd = {m.name for m in Path('site/gemeente').glob('*/')}
    for naam in namen:
        if not any(m == naam.lower() or m.replace('-', ' ') == naam.lower() for m in gebouwd):
            print(f'  LET OP: gemeenten.json noemt {naam}, maar er is geen pagina voor gebouwd.')
    if gemeenten:
        overzicht = Path('site/gemeenten.html')
        if not overzicht.is_file():
            raise SystemExit('STOP: het overzicht /gemeenten ontbreekt.')
        gelinkt = set(re.findall(r'href="/gemeente/([^"/]+)/"', overzicht.read_text(encoding='utf-8')))
        if gelinkt != gebouwd:
            raise SystemExit(f'STOP: /gemeenten linkt niet naar precies de gebouwde gemeentepagina\'s '
                             f'({len(gelinkt)} links, {len(gebouwd)} pagina\'s).')
    print(f"{gemeenten} gemeentepagina's gecontroleerd.")
    # Het blok Ontdek deze cafés: verwijst alleen naar ID's uit de CSV.
    pool = json.loads(Path('site/assets/ontdek.json').read_text(encoding='utf-8')).get('ids', [])
    per_id = {row.get('id'): row for row in data if row.get('id')}
    bruikbaar = 0
    for i in pool:
        row = per_id.get(i)
        if row is None:
            print(f'  LET OP: ontdek.json noemt {i}, maar die zaak staat niet (meer) in de lijst.')
        elif row.get('s') != 'Geverifieerd' or not row.get('i'):
            print(f'  LET OP: ontdek.json noemt {i} ({row["n"]}), maar die is niet online gecontroleerd '
                  'of heeft geen beschrijving; de homepage slaat ze over.')
        else:
            bruikbaar += 1
    start = json.loads(Path('site/data/start.json').read_text(encoding='utf-8'))
    pool_start = [z for z in start.get('zaken', []) if z.get('s') == 'Geverifieerd' and z.get('i')]
    print(f'Ontdek deze cafés: {len(pool_start)} zaken in de pool ({bruikbaar} vaste uit ontdek.json, '
          'de rest met een beschrijving van 100 woorden of meer).')
    if len(pool_start) < 6:
        print(f'  LET OP: maar {len(pool_start)} bruikbare zaken voor Ontdek deze cafés; de startpagina toont er zes.')
    # De tegel Laatste ronde: alleen gesloten zaken met een verhaal.
    for i in json.loads(Path('site/assets/laatsteronde.json').read_text(encoding='utf-8')).get('ids', []):
        row = per_id.get(i)
        if row is None:
            print(f'  LET OP: laatsteronde.json noemt {i}, maar die zaak staat niet (meer) in de lijst.')
        elif row.get('s') != 'Gesloten' or not row.get('i'):
            print(f'  LET OP: laatsteronde.json noemt {i} ({row["n"]}), maar die is niet gesloten '
                  'of heeft geen beschrijving; de startpagina slaat ze over.')
    for name in ('index.html', 'lijst.html', 'kaart.html'):
        page = Path('site', name).read_text(encoding='utf-8')
        if '__DATUM__' in page or '__AANTAL__' in page:
            raise SystemExit(f'STOP: oningevulde placeholder in {name}.')
    print('Extra controles geslaagd.')
    from compare_publication import main as compare_publication
    compare_publication()

if __name__ == '__main__':
    main()
