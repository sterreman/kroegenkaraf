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
    for name in ('privacy.html', 'over.html', 'herfstwandelingen.html', 'assets/verhaal.css', 'afspreken.html', 'assets/afspreken.js', 'lijst.html', 'data/start.json', 'assets/fonts/fonts.css', 'sitemap.xml', 'robots.txt', 'data/slugs.json', 'assets/cafe.css', 'assets/cafe.js'):
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
    if bruikbaar < 6:
        print(f'  LET OP: maar {bruikbaar} bruikbare zaken voor Ontdek deze cafés; de startpagina toont er zes.')
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
