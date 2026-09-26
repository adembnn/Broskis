# Rendu LBENCH · banc d'évaluation automatique du scan d'objets (26/09, 16h05 → 17h45)

## En bref
- `npm run scan-bench` passe les 10 photos réelles d'Adem dans le vrai pipeline du jeu et écrit une page de rapport notée.
  Pipeline testé : réduction à 768 px, `/api/scan-object`, `/api/sticker`, puis détourage et objet 3D par `WeaponModel`, à côté d'un chevalier KayKit et en vol.
- Les photos restent hors dépôt et hors page. La page n'affiche que ce que le jeu produit.
- **Dernier rapport** : `reports/scan-bench/2026-09-26_17h34/index.html`, 15e passage. Résultat : **6,26/10, 0 objet injouable**.
  - Fidélité à la photo : 6,1.
  - Esthétique : 5,1.
  - Physique : 10/10 sur 9 objets.
  - Catégorie acceptable : 10 objets sur 10.
  - Liseré rose : 0 %.
- **Objectif non atteint** (≥ 8/10 avec la grille d'Adem). Le juge plafonne vers 6,3 sur deux points, détaillés plus bas :
  - le volume : l'objet reste un sticker extrudé ;
  - les espaces entre les pieds, qui restent pleins.

## Comment le banc note
- Note d'un objet = moyenne pondérée de 7 critères.
  - 6 viennent du juge Gemini 3.1 Pro en vision, qui compare les rendus à la photo d'origine : fidélité (comptée double), reconnaissable, style KayKit, volume 3D, détourage, jouable.
  - Le 7e, la physique, vient du code : 7 vérifications contre `tools/scan-bench/attendus.json`, catégorie comprise.
- Le code plafonne la note s'il constate un défaut :
  - le détourage est plafonné à 5 s'il reste plus de 3 % de pixels roses au bord ;
  - un objet sans sticker, ou avec un sticker que le client du jeu rejetterait, est plafonné à 3 et compté injouable.
- Options utiles :
  - `--reprendre=dernier` réutilise les réponses API : on ne teste que le rendu, en environ 70 s ;
  - `--seulement=a,b` ne passe que certains objets ;
  - `--sans-juge` saute le juge ;
  - `--note="…"` écrit la ligne du journal.
- Journal complet : `tools/scan-bench/journal.json`.

## Tableau objet × itération
Les passages 1 à 3 sont notés avec la grille v1 (sans fidélité ni volume). Le passage 4 est la même chose que le 3, notée avec la grille d'Adem : c'est la base de comparaison pour la suite.

| Objet | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tasse-verre | 5,4 | 6,8 | 6,8 | 5,4 | 6,5 | 6,5 | 6,3 | 6,4 | 6,5 | 6,8 | 6,6 | 5,1 | 6,5 | 5,1 | 5,9 |
| chaise-bureau | 4,7 | 7,6 | 7,6 | 6,3 | 6,0 | 5,6 | 6,5 | 6,4 | 6,1 | 6,6 | 6,4 | 6,1 | 6,0 | 6,5 | 6,5 |
| feutre-velleda | 5,5 | 6,7 | 7,4 | 5,9 | 6,3 | 6,1 | 6,3 | 6,6 | 6,3 | 6,4 | 5,7 | 4,8 | 5,8 | 6,5 | 6,4 |
| telephone | 3,7 | 7,0 | 7,4 | 6,3 | 6,1 | 6,8 | 6,5 | 6,5 | 6,9 | 6,1 | 5,1 | 4,5 | 5,6 | 4,9 | 6,5 |
| mocassin | 5,9 | 6,6 | 7,2 | 6,6 | 6,4 | 6,8 | 6,5 | 6,0 | 6,8 | 6,5 | 6,6 | 5,9 | 6,8 | 6,5 | 6,6 |
| tabouret-rotin | 3,0 | 5,8 | 6,0 | 6,1 | 6,5 | 5,6 | 5,8 | 6,6 | 6,4 | 5,8 | 5,5 | 6,1 | 6,3 | 5,4 | 6,4 |
| pendule-newton | 4,6 | 5,8 | 4,9 | 4,3 | 5,3 | 4,8 | 5,6 | 5,7 | 5,8 | 4,8 | 6,5 | 4,8 | 4,8 | 6,4 | 5,0 |
| lampe-champignon | 5,7 | 7,0 | 7,2 | 6,5 | 6,8 | 7,1 | 7,0 | 7,1 | 6,3 | 6,9 | 6,3 | 5,4 | 7,0 | 6,9 | 6,3 |
| roi-echecs | 5,1 | 7,2 | 7,4 | 5,8 | 5,9 | 6,1 | 6,5 | 6,8 | 6,1 | 6,6 | 6,0 | 5,6 | 5,5 | 5,9 | 6,6 |
| montre | 5,7 | 8,0 | 7,6 | 6,8 | 6,1 | 6,9 | 6,6 | 6,5 | 6,1 | 6,8 | 6,4 | 5,6 | 6,3 | 6,8 | 6,5 |
| **Moyenne** | **4,9** | **6,8** | **7,0** | **6,0** | **6,2** | **6,2** | **6,3** | **6,5** | **6,3** | **6,3** | **6,1** | **5,4** | **6,0** | **6,1** | **6,3** |
| Fidélité | — | — | — | 5,4 | 5,7 | 5,8 | 6,3 | 6,3 | 5,7 | 6,1 | 6,0 | 4,8 | 5,5 | 5,6 | 6,1 |
| Esthétique | — | — | — | 5,4 | 5,5 | 5,4 | 5,5 | 5,8 | 5,7 | 5,5 | 5,0 | 4,4 | 5,3 | 5,0 | 5,1 |
| Injouables | 4 | 5 | 3 | 6 | 3 | 3 | 3 | 6 | 1 | 4 | 1 | 5 | 1 | 1 | 0 |

## Ce qui a changé, et ce que ça a donné
1. **Référence** (main à 16h, sans physique) : 4,9/10, 4 injouables.
   - Nano Banana dessinait la main et le câble du téléphone.
   - Le sticker du tabouret dépassait les 25 s.
   - La chaise faisait 0,5 m faute de physique.
2. **main avec LSCAN** (physique, Nano Banana 2) : 6,8/10. La physique passe à 10/10 et le sticker ne prend plus que 9 à 13 s.
3. **Consignes et détourage** (LBENCH) : 7,0/10, grille v1.
   - Scan : catégorie choisie selon la forme réelle, après la physique. Sans `propertyOrdering`, Gemini écrivait la catégorie par ordre alphabétique, avant même l'objet. Résultat : 10 catégories acceptables sur 10.
   - Sticker : un 2e essai part avec Nano Banana 2 Lite après 14 s.
   - Détourage : trous gardés, despill complet du bord (liseré violet à 0 %), tranche colorée.
4. **Grille v2** (retour d'Adem : esthétique et fidélité) : 6,0/10. C'est la nouvelle base.
5. à 10. **Volume** :
   - épaisseur plafonnée, puis indépendante de la physique (DA n° 1) : 6,5 ;
   - « vinyle gonflé » (DA n° 2 et 3) : bombé selon la forme avec plafond anti-ailerons, faces opaques, rugosité selon la matière, tranche et marge vinyle, marge plate et seul l'art bombé.
   - Résultat : 6,3/10, et le nombre d'injouables varie de 6 à 1 selon le passage.
11. à 15. **Consigne Nano Banana de la DA et loi de taille** (0,62 à 1,45 m) : 6,3/10, 0 injouable.
   - A/B de la tranche : vinyle 6,11 contre 5,40 à la couleur de l'objet. Le vinyle est gardé.
   - Deux pièges de consigne corrigés : le téléphone dessiné de profil (« un bâton »), puis deux téléphones côte à côte. La règle est maintenant « un seul exemplaire, un seul angle ».

## Ce qui reste faible
- **Volume (3 à 4/10)** : de profil, le juge voit toujours « un sticker extrudé » (« effet brique », « tranche blanche »). C'est la limite d'un objet fait d'une seule image. La vraie parade serait une carte de profondeur (Depth Anything, piste R2), hors délai avant le gel.
- **Espaces entre les pieds** (tabouret, chaise, anse de la tasse, cadre du pendule) : la marge vinyle de 3,5 % les remplit, et Nano Banana peint parfois l'intérieur du cadre en gris. Passer la marge à 2 % n'a rien changé au banc.
- **Pendule de Newton (5,0)** : le juge y voit un radiateur. Fils épaissis et cadre plein : c'est l'objet le plus dur.
- **Délai du sticker** : 2 objets à 20-22 s au dernier passage (consigne plus longue). Le client coupe à 25 s ; le 2e essai part à 14 s.
- **Non fait** : directive 6 de la DA (roulis en vol, 2 tours/s au plus). Le banc ne voit qu'une image fixe ; il faut une capture en jeu. Le bonus « verso photo » n'est pas fait non plus.
- Le juge est bruité (± 0,3 par objet d'un passage à l'autre, seuil « jouable » à 5) : ne comparer que des moyennes sur 10 objets.

## Fichiers
- `tools/scan-bench/` : `run.mjs` (orchestrateur), `banc.html` et `banc.ts` (rendu headless avec le code du jeu), `rapport.mjs` (page), `journal.json`.
- `reports/scan-bench/<horodatage>/` : `index.html` (page autonome publiable) et `resume.json`.
- Code du jeu modifié :
  - `api/sticker.ts`, `api/scan-object.ts` ;
  - `src/scene/sticker/index.ts`, `src/scene/sticker/gonflage.ts` ;
  - `src/scene/weapons/visual.ts`, `shield.ts`, `physics.ts`, `tokens.ts`.
