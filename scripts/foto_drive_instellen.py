"""Eenmalig: geeft het fotoformulier op de site toegang tot een eigen map op Drive.

    pip install google-auth-oauthlib
    python scripts/foto_drive_instellen.py client_secret.json

Wat je vooraf nodig hebt: een OAuth-client van het type Desktop in hetzelfde
Google Cloud-project als de service-account (APIs & Services > Credentials >
Create credentials > OAuth client ID > Desktop app), als json gedownload.
Zet het toestemmingsscherm (OAuth consent screen) op In production, anders
vervalt de toegang na zeven dagen. Google toont dan bij het inloggen dat de app
niet geverifieerd is; dat is normaal voor een app die alleen jij gebruikt
(Geavanceerd > Doorgaan).

Het script:
- opent je browser om in te loggen met het Google-account van de Volkscafés-map;
- vraagt alleen het recht drive.file: de site ziet uitsluitend de mappen en
  foto's die ze zelf aanmaakt, niets anders op je Drive;
- maakt de map Foto-inzendingen met de submappen Te beoordelen en Goedgekeurd;
- drukt de waarden af die in Cloudflare en GitHub moeten.

Daarna, met de hand:
1. Sleep de map Foto-inzendingen in Drive naar de map Volkscafés, zodat de
   service-account van de nachtelijke bouw ze kan lezen.
2. Cloudflare, Worker kroegenkaraf, Settings > Variables and Secrets, vier secrets:
   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, FOTO_TE_BEOORDELEN.
3. GitHub, Settings > Secrets and variables > Actions > Variables:
   DRIVE_FOTO_GOEDGEKEURD_ID.

Bewaar de refresh token nergens anders; wie hem heeft, kan foto's in die map zetten.
"""
import sys

from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import AuthorizedSession

SCOPES = ['https://www.googleapis.com/auth/drive.file']
MAP = 'application/vnd.google-apps.folder'


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    flow = InstalledAppFlow.from_client_secrets_file(sys.argv[1], SCOPES)
    cred = flow.run_local_server(port=0, access_type='offline', prompt='consent')
    if not cred.refresh_token:
        raise SystemExit('Geen refresh token gekregen. Trek de toegang in op '
                         'myaccount.google.com/permissions en probeer opnieuw.')
    s = AuthorizedSession(cred)

    def maak(naam, ouder=None):
        meta = {'name': naam, 'mimeType': MAP}
        if ouder:
            meta['parents'] = [ouder]
        r = s.post('https://www.googleapis.com/drive/v3/files', json=meta, params={'fields': 'id'})
        r.raise_for_status()
        return r.json()['id']

    hoofd = maak('Foto-inzendingen')
    te_beoordelen = maak('Te beoordelen', hoofd)
    goedgekeurd = maak('Goedgekeurd', hoofd)

    print('\nKlaar. De map Foto-inzendingen staat nu bovenaan in je Drive.')
    print('Sleep ze naar de map Volkscafés.\n')
    print('Cloudflare, secrets van de Worker kroegenkaraf:')
    print(f'  GOOGLE_CLIENT_ID       {cred.client_id}')
    print(f'  GOOGLE_CLIENT_SECRET   {cred.client_secret}')
    print(f'  GOOGLE_REFRESH_TOKEN   {cred.refresh_token}')
    print(f'  FOTO_TE_BEOORDELEN     {te_beoordelen}')
    print('\nGitHub, variabele (Actions > Variables):')
    print(f'  DRIVE_FOTO_GOEDGEKEURD_ID   {goedgekeurd}')


if __name__ == '__main__':
    main()
