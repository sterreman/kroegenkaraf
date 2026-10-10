"""Bouwt de site lokaal om te bekijken, zonder iets te publiceren.

    python scripts/bouw_lokaal.py <werkmap> [csv] [fotomap]

Doet wat de workflow doet (prepare_build, publiceer, cafepaginas, check_build),
maar in een eigen werkmap en met de csv en foto's van schijf in plaats van Drive.
Standaard: G:\\Mijn Drive\\Volkscafés. Daarna: python -m http.server in <werkmap>/site.
Het register met vaste urls komt van de live site, zoals in de workflow.
"""
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP = Path(r'G:\Mijn Drive\Volkscafés')


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    work = Path(sys.argv[1]).resolve()
    csv = Path(sys.argv[2]) if len(sys.argv) > 2 else MAP / 'cafes_100_jaar_v11.csv'
    fotos = Path(sys.argv[3]) if len(sys.argv) > 3 else MAP / 'fotos'
    if work.exists():
        def los(functie, pad, fout):    # OneDrive-kopieën zijn soms alleen-lezen
            os.chmod(pad, stat.S_IWRITE)
            functie(pad)
        shutil.rmtree(work, onexc=los)
    sys.path.insert(0, str(ROOT / 'scripts'))
    import prepare_build
    # prepare_build zet alles in ROOT/.publication; hier doen we hetzelfde in de werkmap
    prepare_build.WORK = work
    prepare_build.main()
    shutil.copy2(csv, work / 'cafes_100_jaar_v11.csv')
    shutil.copytree(fotos, work / 'fotos', ignore=shutil.ignore_patterns('*.txt'))
    for script in ('publiceer.py', 'cafepaginas.py', 'check_build.py'):
        print(f'--- {script}')
        subprocess.run([sys.executable, str(ROOT / 'scripts' / script)], cwd=work, check=True)
    print(f'\nKlaar: {work / "site"}')


if __name__ == '__main__':
    main()
