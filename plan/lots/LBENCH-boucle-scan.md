# Lot LBENCH · Boucle d'évaluation automatique du scan sur les objets réels d'Adem
Exécution : **agent Claude (Opus)** · Demande d'Adem (16h00) : « avec ces objets-là, itère au maximum, crée des boucles automatiques et des évaluations : ce sera la base de nos tests, et pour la démo un objet photographié doit être jouable en jeu » ; « montre-moi les objets 3D générés, pour voir s'ils collent à l'univers cartoon ».

## Données (locales, jamais dans le dépôt)
- `tools/scan-bench/photos/objets/*.jpg` : 10 photos réelles prises au téléphone par Adem. Souvent une main ou du décor dans le cadre, parfois un autre objet : c'est le vrai cas de la démo.
- `tools/scan-bench/attendus.json` : vérité terrain (fourchettes de masse, taille, matières, formes, catégories acceptables).

## À livrer
1. **`tools/scan-bench/run.mjs`** (`npm run scan-bench`) : pour chaque photo, et en parallèle (au plus 3 à la fois) :
   - redimensionner à 768 px (canvas dans Playwright, ou n'importe quel moyen sans nouveau paquet) ;
   - appeler les **vraies API** : `POST /api/scan-object` (JSON, physique comprise) puis `/api/sticker`, sur un serveur Vite lancé par le script (port 5300-5399), qui trouve le `.env` tout seul ;
   - **rendre l'objet en 3D dans le vrai moteur du jeu**, dans une page de test headless qui utilise le code du jeu (`src/scene/sticker`, et `src/scene/weapons` de LATK1 s'il est là) : sticker extrudé à sa taille réelle, sous 3 angles, **à côté d'un perso KayKit** pour juger l'échelle et le style, plus une image de l'objet en vol ;
   - **noter** chaque objet :
     - règles : physique dans les fourchettes d'`attendus.json`, catégorie acceptable, pas de fond magenta résiduel (pixels roses sur le contour), sticker présent ;
     - juge **Gemini 3.1 Pro** en vision sur les rendus : « l'objet est-il reconnaissable ? le style colle-t-il aux persos KayKit (cartoon chunky, contours nets) ? le détourage est-il propre ? est-il jouable (taille, lisibilité en vol) ? », noté sur 10 avec justification ;
     - temps de chaque étape ;
   - produire **`reports/scan-bench/<horodatage>/index.html`**, une page visuelle en français pour Adem : pour chaque objet, le sticker, les 3 vues 3D, l'objet à côté du perso, la physique trouvée comparée à l'attendu (vert / rouge), les stats dérivées, la note du juge et les temps. Plus `resume.json`. **Ne mets PAS les photos originales dans la page** : elles contiennent la main d'Adem, et la page sera publiée. Une vignette floutée ou recadrée sur l'objet suffit, sinon rien.
2. **La boucle** : lancer le banc, lire les échecs, corriger, relancer, jusqu'à **note moyenne ≥ 8/10 et 0 objet injouable**. Les corrections portent sur :
   - les consignes de `api/scan-object.ts` et de `api/sticker.ts` (Nano Banana : style cartoon cohérent avec KayKit, objet seul, entier, sans la main, fond #FF00FF) ;
   - le détourage et l'extrusion dans `src/scene/sticker/`.
   Garde un **journal des itérations** dans le rendu : note de chaque tour, ce qui a changé.
3. **Coordination** : l'agent LSCAN (en cours) écrit la physique dans `api/scan-object.ts` et crée `src/ia/physics.ts`, ainsi que la page `/scan-lab.html`. **Attends son commit sur main** (`git merge main` toutes les 10 minutes) avant de modifier `api/scan-object.ts`, puis travaille par petits commits ciblés, en précisant « LBENCH » dans le message. Tu peux modifier `api/sticker.ts` et `src/scene/sticker/` dès maintenant.

## Contrôles
- `npm run build` passe.
- 1re page de rapport commitée **dans les 30 minutes** (même avec de mauvaises notes : c'est la référence), puis une par itération.
- Rendu `plan/rendus/LBENCH.md` : tableau objet × itération, moyenne, ce qui reste faible.
