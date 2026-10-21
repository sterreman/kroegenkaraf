"""Zet de kaarten van Op pad al in de html van /oppad en van de startpagina.

Draait in .publication, na cafepaginas.py en voor check_build.py. Leest
site/assets/oppad.json en vult in site/oppad.html en site/index.html de stukken
tussen de markeringen in:

  oppad.html   <!--oppad:overzicht--> ... <!--/oppad:overzicht-->  alle artikels
  index.html   <!--oppad:uitgelicht--> ... <!--/oppad:uitgelicht-->  het recentste, groot
               <!--oppad:meer--> ... <!--/oppad:meer-->  de volgende twee, compact

Zo staan de links naar de artikels in de html zelf, ook voor wie geen
JavaScript uitvoert (zoekmachines die niet wachten, linkvoorbeelden). De markup
komt uit scripts/artikels.py, die dezelfde is als die van assets/oppad.js. De
JavaScript tekent alleen nog als de pagina zonder deze stap geopend wordt.
"""
import re
import sys
from pathlib import Path

import artikels as A

SITE = Path('site')


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
    pad.write_text(t, encoding='utf-8')

    pad = SITE / 'index.html'
    t = pad.read_text(encoding='utf-8')
    t = vul(t, 'uitgelicht',
            f'<div class="op-uitgelicht" id="op-uitgelicht">{A.kaart(rij[0], "groot", True)}</div>',
            'index.html')
    meer = rij[1:3]
    t = vul(t, 'meer',
            '<ul class="op-meer" id="op-meer" aria-label="Meer uitstappen en verhalen"'
            + ('' if meer else ' hidden') + '>'
            + ''.join(f'<li>{A.kaart(a, "klein")}</li>' for a in meer) + '</ul>',
            'index.html')
    pad.write_text(t, encoding='utf-8')

    print(f'Op pad in de html: {len(rij)} artikels op /oppad, {1 + len(meer)} op de startpagina '
          f'(uitgelicht: {rij[0]["url"]}).')


if __name__ == '__main__':
    main()
