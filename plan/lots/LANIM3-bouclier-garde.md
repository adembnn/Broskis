# Lot LANIM3 · Animations bouclier, garde et lancer au niveau Smash
Exécution : **Gemini** · Retour d'Adem (17h15) : « les animations du type bouclier ne sont pas très bien faites ».

## À faire
Le système d'animation est dans `src/scene/animation/animator.ts` et `src/scene/fighters/index.ts` (lot LATK2, lis `plan/rendus/LATK2.md` : clips par action, couche du haut du corps, `anim:release`).
1. **Pose du bouclier** (arme SHIELD) : aujourd'hui peu lisible. Cible, avec le poids du geste :
   - le perso lève l'objet au-dessus de sa tête ;
   - il le plante au sol devant lui d'un coup sec, avec une flexion des jambes et un petit rebond ;
   - `anim:release` est émis à l'impact au sol.
   Clips du pack (`public/assets/packs/animations/clips.json`) : cherche un « slam », un « interact », un « punch » vers le bas, et combine avec la couche procédurale.
2. **Garde (blocage maintenu)** : bras croisés devant le visage ou objet tenu en bouclier devant soi, genoux fléchis, léger tremblement quand un coup est encaissé, retour propre à la course.
3. **Parade parfaite** : un contre bref et net, qui se lit en 0,3 s.
4. **Lancer** (grenade et throwable) : élan plus marqué (bras armé loin derrière), torsion du buste, fouet vers l'avant, accompagnement.
5. Aucune pose qui cache la tête ou l'objet. Pas de bras qui traverse le corps (bras courts des persos chibi : voir les limites notées par LATK2).

## Tes chemins
`src/scene/animation/**` et la partie animation de `src/scene/fighters/index.ts`. Aucun autre fichier.

## Contrôles
- Banc de LATK2 : `node tools/anim/latk2-lab.mjs` (vidéo en temps de jeu), et juge Gemini (`tools/anim/juge-gemini.mjs --env`). Note avant/après pour le bouclier, la garde, la parade et le lancer, 7/10 visé.
- Un seul navigateur à la fois (machine chargée), Chromium avec GPU (`--use-angle=d3d11 --ignore-gpu-blocklist --force_high_performance_gpu`), port libre 5350-5359.
- `npm run build` passe.
