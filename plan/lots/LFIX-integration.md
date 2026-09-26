# Lot LFIX · Passe d'intégration : un vrai match jouable et beau à l'écran
Exécution : **Gemini** · Évaluation : Claude + agents du harnais · **PRIORITÉ ABSOLUE** (tout le reste en dépend)

## Constat (diagnostic de Claude, 13h35, match lancé par `gameHooks.startMatch({map:'archipel'})`)
1. **Aucun personnage** dans la scène : `[fighters] match:start RangeError: Maximum call stack size exceeded at Object3D.updateWorldMatrix at SkinnedMesh.update`. Il y a 0 SkinnedMesh dans la scène. Probablement une boucle dans le graphe de scène :
   - un objet ajouté comme enfant d'un de ses descendants ;
   - un sticker ou un accessoire attaché à un os, dans une hiérarchie qui contient déjà cet objet ;
   - un `SkeletonUtils.clone` mal utilisé.
   Chercher dans `src/scene/fighters/*` (loader, rig, animator) et `src/scene/fighter-custom/*`.
2. **Le sol provisoire du lot LA** (`la-ground`, un disque de rayon 12) reste affiché et **cache les dalles** de la map (LM, InstancedMesh). Il ne doit exister que si aucune map n'est chargée.
3. Après `startMatch` lancé par les hooks, l'**écran titre du lot LU** reste affiché. Les hooks de test doivent pouvoir cacher les menus (le mode normal passe par les écrans).
4. Caméra en vue épaule mal réglée : elle est au ras du sol (y ≈ 1,75) et on ne voit ni le perso actif ni l'adversaire. Il faut : perso actif au premier tiers de l'écran, adversaire visible, le vide et le décor lisibles.
5. Vérifier aussi : `THREE.Material: parameter 'map' has value of undefined` ; `PCFSoftShadowMap has been removed` (passer à `PCFShadowMap` dans `src/core/ctx.ts`).

## Outil de diagnostic
`node "C:\Users\Adem\AppData\Local\Temp\claude\C--Users-Adem-Documents-Hackathon-Voodoo\637070cc-f9cc-4418-8504-22f0f58d4de0\scratchpad\vitrine\diag.mjs" archipel` (copie-le dans `tools/diag.mjs` du dépôt en corrigeant son import Playwright vers `node_modules/playwright`) :
- il lance Vite ;
- il démarre un match ;
- il affiche l'état (persos, caméra, nombre de meshes et SkinnedMesh, UI) ainsi que les erreurs console et réseau.
Objectif : **zéro erreur** et **2 SkinnedMesh** visibles.

## Tes chemins
Tout le code du jeu (`src/**`), `tools/diag.mjs`. Corrige **à la racine**, sans contournement. Chaque correction doit être minimale et commentée si elle n'est pas évidente.

## Sortie attendue
Sur les 3 maps, via `startMatch({map})` :
- 2 persos KayKit animés (idle) sur leurs points d'apparition de map ;
- dalles et décor visibles ;
- caméra épaule correcte ;
- HUD visible, menus cachés ;
- aucune erreur console.

Puis un tir via les hooks (`pickWeapon(1)`, `aim`, `fire(0.7)`) doit montrer la bascule vers le défenseur, le projectile, l'impact et les PV qui baissent. Captures : `node tools/capture.mjs --out captures/lfix` ET une capture par map (`captures/lfix/<map>.png`).

## Contrôles
- `npm run build` ;
- `node tools/diag.mjs archipel|galion|cuisine` : 0 erreur ;
- `window.__selftest()` (lot LG) passe dans le navigateur.
