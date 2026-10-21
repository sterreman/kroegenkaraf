"""De kaarten van Op pad uit de bouw (scripts/artikels.py) moeten dezelfde zijn
als die van de browser (assets/oppad.js), byte voor byte, anders verandert het
uitzicht. Draait met node, vanuit de root van de repo:

    python scripts/test_oppad.py
"""
import json
import subprocess
import sys
from pathlib import Path

import artikels as A

ROOT = Path(__file__).resolve().parents[1]

# Een extra proefartikel met tekens die escaping op de proef stellen en zonder beeld of datum.
PROEF = {'url': '/proef', 'titel': "Café 't \"Hoekske\" & <co>", 'omschrijving': "A&B 'c'",
         'feiten': ['1 < 2', 3], 'rubriek': 'Proef'}

NODE = r'''
const fs = require('fs');
global.window = {};
eval(fs.readFileSync(process.argv[1], 'utf8'));
const OpPad = window.OpPad;
const artikels = JSON.parse(fs.readFileSync(0, 'utf8'));
const uit = {volgorde: OpPad.ordenen(artikels).map(a => a.url), kaarten: []};
for (const a of artikels)
  for (const v of ['groot', 'klein', 'lijst'])
    for (const eerste of [true, false]) uit.kaarten.push(OpPad.kaart(a, v, eerste));
process.stdout.write(JSON.stringify(uit));
'''


def main():
    artikels = A.laad(ROOT) + [PROEF]
    r = subprocess.run(['node', '-e', NODE, str(ROOT / 'assets/oppad.js')],
                       input=json.dumps(artikels), capture_output=True, text=True, encoding='utf-8')
    if r.returncode:
        sys.exit('FOUT: node kon assets/oppad.js niet draaien:\n' + r.stderr)
    js = json.loads(r.stdout)
    py = [A.kaart(a, v, eerste) for a in artikels for v in ('groot', 'klein', 'lijst')
          for eerste in (True, False)]
    fout = 0
    for i, (x, y) in enumerate(zip(js['kaarten'], py)):
        if x != y:
            fout += 1
            print(f'VERSCHIL bij kaart {i}:\n  js: {x}\n  py: {y}')
    if len(js['kaarten']) != len(py):
        fout += 1
    if js['volgorde'] != [a['url'] for a in A.ordenen(artikels)]:
        fout += 1
        print('VERSCHIL in de volgorde:', js['volgorde'], [a['url'] for a in A.ordenen(artikels)])
    if fout:
        sys.exit(f'FOUT: {fout} verschil(len) tussen artikels.py en oppad.js.')
    print(f'Op pad: {len(py)} kaarten en de volgorde zijn gelijk in Python en JavaScript.')


if __name__ == '__main__':
    main()
