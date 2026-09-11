"""Compare with a reference published atomically alongside the last successful site."""
import datetime
import hashlib
import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ORIGIN = 'https://kroegenkaraf.be'
MANIFEST = 'data/publicatie.json'

def fetch_json(path):
    # A unique query bypasses the site's five-minute cache for this comparison.
    nonce = datetime.datetime.now(datetime.timezone.utc).timestamp()
    req = urllib.request.Request(f'{ORIGIN}/{path}?publicatiecontrole={nonce}',
                                 headers={'Cache-Control': 'no-cache',
                                          'User-Agent': 'KroegEnKaraf-publicatie/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read(8_000_001)
            if len(raw) > 8_000_000:
                raise ValueError('referentiebestand te groot')
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise

def fingerprint(site):
    files = {}
    for path in sorted(site.rglob('*')):
        if not path.is_file():
            continue
        name = path.relative_to(site).as_posix()
        if name == MANIFEST:
            continue
        raw = path.read_bytes()
        if name in ('index.html', 'kaart.html'):
            # Keep every other byte meaningful, including counts and metadata.
            raw = re.sub(r'(const BIJGEWERKT = ")[^"]*(")',
                         r'\g<1>__DATUM__\g<2>', raw.decode('utf-8')).encode('utf-8')
        files[name] = hashlib.sha256(raw).hexdigest()
    return files

def main():
    site = Path('site')
    data = json.loads((site / 'data/zaken.json').read_text(encoding='utf-8'))
    counts = {'zaken': len(data), 'fotos': sum(bool(r.get('foto')) for r in data)}
    current = fingerprint(site)
    try:
        previous = fetch_json(MANIFEST)
        if previous is None:
            live = fetch_json('data/zaken.json')
            if not isinstance(live, list) or len(live) < 100:
                raise ValueError('bestaande live dataset ontbreekt of is onbruikbaar')
            old_counts = {'zaken': len(live), 'fotos': sum(bool(r.get('foto')) for r in live)}
        else:
            if not isinstance(previous, dict) or previous.get('schema') != 1:
                raise ValueError('onbekend referentieformaat')
            old_counts = previous['counts']
            old_files = previous['files']
            if not isinstance(old_files, dict) or 'data/zaken.json' not in old_files:
                raise ValueError('referentie mist websitebestanden')
            if not all(isinstance(v, str) and re.fullmatch('[a-f0-9]{64}', v) for v in old_files.values()):
                raise ValueError('referentie bevat ongeldige hashes')
        for key in ('zaken', 'fotos'):
            n = old_counts[key]
            if type(n) is not int or n < 0 or (key == 'zaken' and n < 100):
                raise ValueError('ongeldige referentieaantallen')
            if counts[key] < n * .9:
                raise ValueError(f'{counts[key]} {key}: meer dan 10% minder dan de live publicatie ({n})')
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise SystemExit(f'STOP: vergelijking met vorige publicatie niet mogelijk: {exc}') from exc

    if previous is None:
        print('Eerste referentie: nog geen volledige vergelijking met de vorige publicatie; '
              'de live aantallen zijn gecontroleerd. Deze referentie wordt actief na publicatie.')
    else:
        added = sorted(set(current) - set(old_files))
        removed = sorted(set(old_files) - set(current))
        changed = sorted(k for k in current.keys() & old_files.keys() if current[k] != old_files[k])
        print('Gewijzigd sinds de vorige succesvolle publicatie (' + str(previous.get('date', 'datum onbekend'))
              + '): ' + ('ja' if added or removed or changed else 'nee') + '. Datumwijziging telt niet mee.')
        for label, paths in (('Toegevoegd', added), ('Verwijderd', removed), ('Gewijzigd', changed)):
            if paths:
                print(label + ': ' + ', '.join(paths))
    report = {'schema': 1, 'date': datetime.datetime.now(ZoneInfo('Europe/Brussels')).date().isoformat(),
              'counts': counts, 'files': current}
    (site / MANIFEST).write_text(json.dumps(report, ensure_ascii=False, sort_keys=True), encoding='utf-8')

if __name__ == '__main__':
    main()
