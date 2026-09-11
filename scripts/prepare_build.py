"""Copy website sources from the repository root into an isolated build folder."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.publication'
FILES = ('index.html', 'kaart.html', '_headers', 'favicon.ico', 'apple-touch-icon.png')

def main():
    for name in (*FILES, 'assets', 'data/zaken.json'):
        if not (ROOT / name).exists():
            raise SystemExit(f'STOP: websitebron ontbreekt: {name}')
    if WORK.exists():
        raise SystemExit('STOP: .publication bestaat al; gebruik een schone checkout.')
    site = WORK / 'site'
    site.mkdir(parents=True)
    for name in FILES:
        shutil.copy2(ROOT / name, site / name)
    shutil.copytree(ROOT / 'assets', site / 'assets')
    previous = json.loads((ROOT / 'data/zaken.json').read_text(encoding='utf-8'))
    if not isinstance(previous, list) or len(previous) < 100:
        raise SystemExit('STOP: de referentiedataset in GitHub is niet bruikbaar.')
    (WORK / 'baseline.json').write_text(json.dumps({
        'count': len(previous), 'photos': sum(bool(r.get('foto')) for r in previous)
    }), encoding='utf-8')
    print(f'Bronbestanden klaargezet; referentie: {len(previous)} zaken in GitHub.')

if __name__ == '__main__':
    main()
