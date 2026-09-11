"""Read-only Drive download; exact IDs, pagination and byte verification."""
import hashlib
import json
import os
from pathlib import Path
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession


def main():
    credentials = service_account.Credentials.from_service_account_info(
        json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON']),
        scopes=['https://www.googleapis.com/auth/drive.readonly'])
    session = AuthorizedSession(credentials)
    base = 'https://www.googleapis.com/drive/v3/files'
    fields = 'id,name,size,md5Checksum,mimeType,modifiedTime'

    def get(url, **kwargs):
        r = session.get(url, timeout=120, **kwargs)
        r.raise_for_status()
        return r

    def download(meta, path):
        if 'size' not in meta or meta['mimeType'].startswith('application/vnd.google-apps.'):
            raise RuntimeError(f"Geen gewoon bestand: {meta['name']}")
        path.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.md5()
        with get(f"{base}/{meta['id']}", params={'alt':'media'}, stream=True) as response:
            with path.open('wb') as out:
                for chunk in response.iter_content(1024 * 1024):
                    out.write(chunk)
                    digest.update(chunk)
        if path.stat().st_size != int(meta['size']):
            raise RuntimeError(f"Bytegrootte wijkt af: {meta['name']}")
        if meta.get('md5Checksum') and digest.hexdigest() != meta['md5Checksum']:
            raise RuntimeError(f"Checksum wijkt af: {meta['name']}")
        after = get(f"{base}/{meta['id']}", params={'fields':fields}).json()
        if any(after.get(k) != meta.get(k) for k in ('size','md5Checksum','modifiedTime')):
            raise RuntimeError(f"Bestand gewijzigd tijdens downloaden: {meta['name']}")

    csv = get(f"{base}/{os.environ['DRIVE_CSV_FILE_ID']}", params={'fields':fields}).json()
    if csv['name'] != 'cafes_100_jaar_v11.csv':
        raise RuntimeError('CSV-ID verwijst niet naar cafes_100_jaar_v11.csv')
    download(csv, Path('cafes_100_jaar_v11.csv'))
    folder = os.environ.get('DRIVE_PHOTOS_FOLDER_ID', '1Uh0EFidJfV8uBd4H_YXLJ3XhluKCKTEb')
    folder_meta = get(f'{base}/{folder}', params={'fields':'mimeType'}).json()
    if folder_meta['mimeType'] != 'application/vnd.google-apps.folder':
        raise RuntimeError('Foto-ID verwijst niet naar een map')
    photos = Path('fotos')
    photos.mkdir(exist_ok=False)
    page, seen = None, set()
    while True:
        params = {'q':f"'{folder}' in parents and trashed = false", 'pageSize':1000,
                  'fields':f'nextPageToken,files({fields})'}
        if page:
            params['pageToken'] = page
        result = get(base, params=params).json()
        for meta in result.get('files', []):
            name = meta['name']
            if name == 'lees-mij.txt':
                continue
            if Path(name).name != name or name in ('.','..') or name in seen:
                raise RuntimeError('Ongeldige of dubbele fotobestandsnaam')
            seen.add(name)
            if Path(name).suffix.lower() not in ('.jpg','.jpeg','.png','.webp','.avif'):
                raise RuntimeError(f'Niet ondersteund fotobestand: {name}')
            download(meta, photos/name)
        page = result.get('nextPageToken')
        if not page:
            break
    if not seen:
        raise RuntimeError('Fotomap is leeg; geen publicatie')
    print(f'Drive: CSV en {len(seen)} foto’s volledig gedownload en gecontroleerd.')

if __name__ == '__main__':
    main()
