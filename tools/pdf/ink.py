import subprocess, sys, os, glob
from PIL import Image
import numpy as np

def mesure(pdf, tag):
    tmp = '/tmp/ink-' + tag
    os.makedirs(tmp, exist_ok=True)
    for f in glob.glob(tmp + '/*.png'):
        os.remove(f)
    subprocess.run(['pdftoppm', '-r', '60', '-png', pdf, tmp + '/p'], check=True)
    files = sorted(glob.glob(tmp + '/p-*.png'))
    rows = []
    tot_dark = tot_px = 0
    ink_sum = 0
    for f in files:
        a = np.asarray(Image.open(f).convert('L')).astype(float)
        dark = (a < 128).mean()
        ink = (255 - a).mean() / 255
        rows.append((os.path.basename(f), dark * 100, ink * 100))
        tot_dark += (a < 128).sum(); tot_px += a.size; ink_sum += ink
    n = len(files)
    print(f'== {tag}: {n} pages')
    print(f'   pages sombres (>=50%) : {sum(1 for r in rows if r[1] >= 50)}')
    print(f'   page 1 : {rows[0][1]:.1f} % de pixels sombres')
    print(f'   pire page : {max(r[1] for r in rows):.1f} %  ({max(rows, key=lambda r: r[1])[0]})')
    print(f'   pixels sombres, document : {100*tot_dark/tot_px:.2f} %')
    print(f'   encre moyenne : {100*ink_sum/n:.2f} %')

for pdf, tag in [(sys.argv[1], 'cible')] if len(sys.argv) > 1 else []:
    mesure(pdf, tag)
