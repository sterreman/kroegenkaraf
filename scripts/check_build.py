"""Additional gates before an artifact can be published."""
import json
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
    for name in ('sitemap.xml', 'robots.txt', 'data/slugs.json', 'assets/cafe.css', 'assets/cafe.js'):
        if not Path('site', name).is_file():
            raise SystemExit(f'STOP: {name} ontbreekt.')
    print(f'{len(urls)} cafepaginas aanwezig.')
    for name in ('index.html', 'kaart.html'):
        page = Path('site', name).read_text(encoding='utf-8')
        if '__DATUM__' in page or '__AANTAL__' in page:
            raise SystemExit(f'STOP: oningevulde placeholder in {name}.')
    print('Extra controles geslaagd.')
    from compare_publication import main as compare_publication
    compare_publication()

if __name__ == '__main__':
    main()
