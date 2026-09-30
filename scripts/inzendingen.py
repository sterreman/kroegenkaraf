"""Haalt de goedgekeurde foto's op die bezoekers via Tally instuurden.

Draait in .publication, na download_drive.py. Leest de Google Sheet waar Tally
de inzendingen in zet (alleen lezen, met dezelfde service-account als de csv)
en downloadt de foto's van elke rij met Status Goedgekeurd naar inzendingen/.
Welke zaak het is, staat in de verborgen kolom slug: de vaste url van de
cafepagina, bv. cafe/haacht/de-gouden-leeuw. cafepaginas.py koppelt ze.

Schrijft:  inzendingen/<nr>.<ext>  en  inzendingen.json

Niets hier stopt de publicatie. Is de sheet niet ingesteld of onbereikbaar, of
lukt een download niet, dan wordt dat gemeld en gaat de bouw verder zonder die
foto's. Een foto die op Tally verdwijnt, verdwijnt dus ook van de site.

Nodig: GOOGLE_SERVICE_ACCOUNT_JSON en FOTO_INZENDINGEN_SHEET_ID. De sheet moet
gedeeld zijn met het e-mailadres van de service-account (lezer volstaat).
"""
import csv
import io
import json
import os
import re
import urllib.request
from pathlib import Path

from PIL import Image

MAP = Path('inzendingen')
MAX_BYTES = 15 * 1024 * 1024
OK = {'goedgekeurd', 'ok', 'ja', 'akkoord'}


def kolom(koppen, *zoek, niet=()):
    for i, k in enumerate(koppen):
        kl = k.strip().lower()
        if any(z in kl for z in zoek) and not any(n in kl for n in niet):
            return i
    return None


def haal_sheet(sheet_id):
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    cred = service_account.Credentials.from_service_account_info(
        json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON']),
        scopes=['https://www.googleapis.com/auth/drive.readonly'])
    s = AuthorizedSession(cred)
    r = s.get(f'https://www.googleapis.com/drive/v3/files/{sheet_id}/export',
              params={'mimeType': 'text/csv'}, timeout=120)
    r.raise_for_status()
    return list(csv.reader(io.StringIO(r.content.decode('utf-8-sig'))))


def download(url, doel):
    req = urllib.request.Request(url, headers={'User-Agent': 'kroegenkaraf-build'})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise RuntimeError('groter dan 15 MB')
    doel.write_bytes(data)
    with Image.open(doel) as im:
        im.load()
        return im.format


def main():
    MAP.mkdir(exist_ok=True)
    uit = []
    sheet_id = os.environ.get('FOTO_INZENDINGEN_SHEET_ID', '').strip()
    if not sheet_id:
        print('Inzendingen: FOTO_INZENDINGEN_SHEET_ID niet ingesteld, geen bezoekersfoto\'s.')
    else:
        try:
            rijen = haal_sheet(sheet_id)
        except Exception as exc:
            print(f'  LET OP: de sheet met foto-inzendingen is niet te lezen ({exc}). '
                  'Is ze gedeeld met de service-account?')
            rijen = []
        if rijen:
            koppen = rijen[0]
            k_slug = kolom(koppen, 'slug')
            k_status = kolom(koppen, 'status')
            k_naam = kolom(koppen, 'vermelding')
            k_foto = kolom(koppen, 'upload', 'foto', niet=('vermelding', 'e-mail', 'email'))
            k_tijd = kolom(koppen, 'submitted at', 'ingediend')
            k_cafe = kolom(koppen, 'cafe', 'café', niet=('slug',))
            ontbreekt = [n for n, k in (('slug', k_slug), ('Status', k_status),
                                        ('foto', k_foto)) if k is None]
            if ontbreekt:
                print(f'  LET OP: de sheet mist de kolom(men) {", ".join(ontbreekt)}; '
                      f'gevonden: {koppen}')
            else:
                wachten = 0
                for nr, rij in enumerate(rijen[1:], start=2):
                    rij = rij + [''] * (len(koppen) - len(rij))
                    status = rij[k_status].strip().lower()
                    if not status:
                        wachten += 1
                    if status not in OK:
                        continue
                    slug = rij[k_slug].strip().strip('/')
                    wie = f'rij {nr}' + (f' ({rij[k_cafe].strip()})' if k_cafe is not None else '')
                    if not slug:
                        print(f'  LET OP: inzending {wie} heeft geen slug, niet gekoppeld')
                        continue
                    urls = re.findall(r'https?://[^\s,;"]+', rij[k_foto])
                    if not urls:
                        print(f'  LET OP: inzending {wie} bevat geen fotolink')
                    for j, url in enumerate(urls, start=1):
                        doel = MAP / f'{nr:05d}-{j}'
                        try:
                            download(url, doel)
                        except Exception as exc:
                            print(f'  LET OP: foto {j} van inzending {wie} niet binnengehaald: {exc}')
                            doel.unlink(missing_ok=True)
                            continue
                        uit.append({'slug': slug, 'bestand': str(doel),
                                    'naam': (rij[k_naam].strip() if k_naam is not None else ''),
                                    'datum': (rij[k_tijd].strip() if k_tijd is not None else '')})
                print(f'Inzendingen: {len(uit)} goedgekeurde foto\'s binnengehaald, '
                      f'{wachten} inzending(en) wachten nog op een beoordeling.')
    Path('inzendingen.json').write_text(json.dumps(uit, ensure_ascii=False, indent=1),
                                        encoding='utf-8')


if __name__ == '__main__':
    main()
