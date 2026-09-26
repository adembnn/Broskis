# Lot LSKY : finit un panorama brut de Gemini (21:9) pour src/scene/maps/sky.ts (cylindre, image répétée).
#  1. raccorde la couture gauche/droite (fondu enchaîné sur BANDE % de la largeur : l'image boucle) ;
#  2. ferme le haut et le bas (fondu vers la couleur moyenne de la rangée extrême = couleur des bouchons) ;
#  3. redimensionne à LARGEUR px et écrit public/assets/sky/<map>.webp ;
#  4. affiche les couleurs `haut` / `bas` à reporter dans tokens.js maps.<map>.panorama, et la couleur de
#     l'horizon (fraction donnée) pour maps.<map>.brouillard.couleur.
# Usage : python tools/sky/finish-pano.py captures/sky-raw/galion-1.png galion 0.556 [qualité] [flou px]
#  flou : profondeur de champ légère (le décor peint se lit « derrière » la 3D nette), raccord de couture conservé.
import os
import sys
import numpy as np
from PIL import Image

src, carte, horizon = sys.argv[1], sys.argv[2], float(sys.argv[3])
QUALITE = int(sys.argv[4]) if len(sys.argv) > 4 else 88
FLOU = float(sys.argv[5]) if len(sys.argv) > 5 else 0
BANDE = 0.05   # largeur du fondu de couture (fraction de la largeur)
POLE = 0.06    # hauteur des bords haut/bas fondus (fraction de la hauteur)
LARGEUR = 4096

im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
b = int(im.shape[1] * BANDE)
t = np.linspace(0, 1, b, dtype=np.float32)[None, :, None]
debut = im[:, :b] * t + im[:, -b:] * (1 - t)
im = np.concatenate([debut, im[:, b:-b]], axis=1)
H = round(LARGEUR * im.shape[0] / im.shape[1])
im = np.asarray(Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).resize((LARGEUR, H), Image.LANCZOS)).astype(np.float32)
if FLOU > 0:  # flou gaussien sur une image prolongée des deux côtés (elle boucle) : pas de couture
    from PIL import ImageFilter
    m = int(FLOU * 4) + 1
    ext = np.concatenate([im[:, -m:], im, im[:, :m]], axis=1)
    ext = np.asarray(Image.fromarray(np.clip(ext, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(FLOU))).astype(np.float32)
    im = ext[:, m:-m]

p = int(H * POLE)
couleurs = {}
for nom, bord, rangs in (('haut', 0, range(p)), ('bas', H - 1, range(H - p, H))):
    moy = im[bord].mean(axis=0)
    couleurs[nom] = '#%02X%02X%02X' % tuple(int(c) for c in moy)
    for y in rangs:
        k = 1 - abs(y - bord) / p
        k = k * k * (3 - 2 * k)
        im[y] = im[y] * (1 - k) + moy * k

out = Image.fromarray(np.clip(im, 0, 255).astype(np.uint8))
os.makedirs('public/assets/sky', exist_ok=True)
chemin = f'public/assets/sky/{carte}.webp'
out.save(chemin, 'WEBP', quality=QUALITE, method=6)
y = int(H * horizon)
hz = im[max(0, y - 20): y + 20].reshape(-1, 3).mean(axis=0)
print(chemin, out.size, os.path.getsize(chemin) // 1024, 'Ko ; haut', couleurs['haut'], 'bas', couleurs['bas'],
      'horizon #%02X%02X%02X' % tuple(int(c) for c in hz))
os.makedirs('captures/sky-raw', exist_ok=True)
out.resize((1400, round(1400 * H / LARGEUR))).save(f'captures/sky-raw/{carte}-final_p.jpg', quality=80)
