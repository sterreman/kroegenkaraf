"""Zet de kaarten van Op pad al in de html van /oppad en van de startpagina.

Draait in .publication, na cafepaginas.py en voor check_build.py. Leest
site/assets/oppad.json en vult in site/oppad.html en site/index.html de stukken
tussen de markeringen in:

  oppad.html   <!--oppad:overzicht--> ... <!--/oppad:overzicht-->  alle artikels
  index.html   <!--oppad:uitgelicht--> ... <!--/oppad:uitgelicht-->  het recentste, groot (zie A.startselectie)
               <!--oppad:meer--> ... <!--/oppad:meer-->  een seizoensartikel en een verrassend thema, compact

Zo staan de links naar de artikels in de html zelf, ook voor wie geen
JavaScript uitvoert (zoekmachines die niet wachten, linkvoorbeelden). De markup
komt uit scripts/artikels.py, die dezelfde is als die van assets/oppad.js. De
JavaScript tekent alleen nog als de pagina zonder deze stap geopend wordt.
"""
import html
import json
import re
import sys
from pathlib import Path

import artikels as A

SITE = Path('site')
ORIGIN = 'https://kroegenkaraf.be'
UITGEVER = {'@type': 'Organization', '@id': f'{ORIGIN}/#organisatie', 'name': 'Kroeg & Karaf', 'url': f'{ORIGIN}/',
            'logo': {'@type': 'ImageObject', 'url': f'{ORIGIN}/assets/logo.png', 'width': 760, 'height': 575},
            'sameAs': ['https://www.facebook.com/kroegenkaraf', 'https://www.instagram.com/kroegenkaraf/']}


def meta(tekst, sleutel):
    """De inhoud van <meta property=...> of <meta name=...>, of ''."""
    m = re.search(rf'<meta (?:property|name)="{re.escape(sleutel)}" content="([^"]*)"', tekst)
    return html.unescape(m.group(1)) if m else ''


def zet_in_head(tekst, naam, inhoud, pagina):
    """Zet een blok vlak voor </head>, tussen markeringen, zodat een tweede keer
    draaien het blok vervangt in plaats van verdubbelt."""
    blok = f'<!--data:{naam}-->{inhoud}<!--/data:{naam}-->\n'
    tekst = re.sub(rf'<!--data:{naam}-->.*?<!--/data:{naam}-->\n?', '', tekst, flags=re.S)
    if tekst.count('</head>') != 1:
        sys.exit(f'STOP: {pagina} heeft geen of meer dan een </head>.')
    return tekst.replace('</head>', blok + '</head>')


def ld(x):
    blob = json.dumps({'@context': 'https://schema.org', **x}, ensure_ascii=False).replace('</', '<\\/')
    return f'<script type="application/ld+json">{blob}</script>'


def cafe_urls():
    """ID -> (naam, url) van elke zaak, voor de vermeldingen in een artikel."""
    pad = SITE / 'data/zaken.json'
    if not pad.exists():
        return {}
    return {d['id']: (d['n'], f'{ORIGIN}/{d["u"]}/') for d in json.loads(pad.read_text(encoding='utf-8'))
            if d.get('id') and d.get('u')}


def verrijk_artikels(rij):
    """Article-data in elk artikel, uit wat er al zichtbaar en in de head staat: titel,
    omschrijving, beeld, datum (oppad.json) en de besproken cafés (verhalen.json). Vult
    ook og:site_name, og:locale en twitter:card aan waar een artikel ze mist."""
    pad = SITE / 'assets/verhalen.json'
    verhalen = json.loads(pad.read_text(encoding='utf-8')).get('verhalen', []) if pad.exists() else []
    besproken = {v['url']: list(v.get('cafes', {})) for v in verhalen}
    zaken = cafe_urls()
    for a in rij:
        pad = SITE / A.bestand(a)
        t = re.sub(r'<!--data:artikel-->.*?<!--/data:artikel-->\n?', '', pad.read_text(encoding='utf-8'), flags=re.S)
        url = ORIGIN + a['url']
        x = {'@type': 'Article', 'headline': meta(t, 'og:title') or a['titel'],
             'description': meta(t, 'description') or a.get('omschrijving', ''),
             'url': url, 'mainEntityOfPage': url, 'inLanguage': 'nl-BE',
             'author': {'@id': UITGEVER['@id']}, 'publisher': UITGEVER}
        if meta(t, 'og:image'):
            x['image'] = meta(t, 'og:image')
        if a.get('datum'):
            x['datePublished'] = a['datum']
        noemt = [{'@type': 'Thing', 'name': zaken[i][0], 'url': zaken[i][1]}
                 for i in besproken.get(a['url'], []) if i in zaken]
        if noemt:
            x['mentions'] = noemt
        extra = ''.join(f'<meta {soort}="{k}" content="{v}">\n' for soort, k, v in (
            ('property', 'og:site_name', 'Kroeg &amp; Karaf'), ('property', 'og:locale', 'nl_BE'),
            ('name', 'twitter:card', 'summary_large_image')) if f'"{k}"' not in t)
        kruimels = ld({'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Op pad', 'item': f'{ORIGIN}/oppad'},
            {'@type': 'ListItem', 'position': 2, 'name': a['titel'], 'item': url}]})
        pad.write_text(zet_in_head(t, 'artikel', extra + ld(x) + '\n' + kruimels, A.bestand(a)), encoding='utf-8')


def vul(tekst, naam, inhoud, pagina):
    patroon = re.compile(rf'<!--oppad:{naam}-->.*?<!--/oppad:{naam}-->', re.S)
    nieuw, n = patroon.subn(lambda m: f'<!--oppad:{naam}-->{inhoud}<!--/oppad:{naam}-->', tekst)
    if n != 1:
        sys.exit(f'STOP: de markering oppad:{naam} staat {n} keer in {pagina}, verwacht: 1.')
    return nieuw


def main():
    rij = A.ordenen(A.laad(SITE))
    if not rij:
        sys.exit('STOP: assets/oppad.json bevat geen artikels.')

    pad = SITE / 'oppad.html'
    t = pad.read_text(encoding='utf-8')
    lijst = ''.join(f'<li>{A.kaart(a, "lijst", i == 0)}</li>' for i, a in enumerate(rij))
    t = vul(t, 'overzicht', f'<ul class="opoverzicht" id="opoverzicht">{lijst}</ul>', 'oppad.html')
    t = zet_in_head(t, 'oppad', ld({
        '@type': 'CollectionPage', 'name': 'Op pad langs Belgische cafés', 'url': f'{ORIGIN}/oppad',
        'mainEntity': {'@type': 'ItemList', 'itemListElement': [
            {'@type': 'ListItem', 'position': i + 1, 'url': ORIGIN + a['url'], 'name': a['titel']}
            for i, a in enumerate(rij)]}}), 'oppad.html')
    pad.write_text(t, encoding='utf-8')
    verrijk_artikels(rij)

    # drie invalshoeken: recentste, seizoen, verrassing (A.startselectie); de rest staat op /oppad
    kies = A.startselectie(rij)
    meer = kies[1:]
    pad = SITE / 'index.html'
    t = pad.read_text(encoding='utf-8')
    t = vul(t, 'uitgelicht',
            f'<div class="op-uitgelicht" id="op-uitgelicht">{A.kaart(kies[0], "groot", True)}</div>',
            'index.html')
    t = vul(t, 'meer',
            '<ul class="op-meer" id="op-meer" aria-label="Meer uitstappen en verhalen"'
            + ('' if meer else ' hidden') + '>'
            + ''.join(f'<li>{A.kaart(a, "klein")}</li>' for a in meer) + '</ul>',
            'index.html')
    t = zet_in_head(t, 'start', ld({'@graph': [
        {'@type': 'WebSite', '@id': f'{ORIGIN}/#website', 'url': f'{ORIGIN}/', 'name': 'Kroeg & Karaf',
         'description': 'De onafhankelijke gids voor Belgische cafés', 'inLanguage': 'nl-BE',
         'publisher': {'@id': UITGEVER['@id']}},
        UITGEVER]}), 'index.html')
    pad.write_text(t, encoding='utf-8')

    print(f'Op pad in de html: {len(rij)} artikels op /oppad, {1 + len(meer)} op de startpagina '
          f'(uitgelicht: {kies[0]["url"]}; daarnaast {", ".join(a["url"] for a in meer)}).')


if __name__ == '__main__':
    main()
