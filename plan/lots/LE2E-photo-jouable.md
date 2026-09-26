# Lot LE2E · De la photo à l'objet jouable, dans le VRAI jeu, de bout en bout
Exécution : **agent Claude (Opus)**, meilleur niveau · PRIORITÉ ABSOLUE d'Adem (16h10) : « l'agent itère jusqu'à ce que la MÉCANIQUE EN JEU soit jouable : on upload nos armes et nos personnages directement en jeu, la mécanique s'adapte à l'arme (une chaise lancée ne fait pas les mêmes dégâts qu'une canette lancée). L'upload d'une image vers une version 3D jouable, c'est ça qu'il faut. »

## Le parcours à faire marcher, et à prouver par un test automatique
Dans le jeu lui-même (`http://localhost:<port>/`, pas une page de test à part) :
1. **Arsenal** : P1 dépose la photo de la chaise (champ fichier ou glisser-déposer), P2 celle de la canette ou d'un autre objet. La carte d'arme se remplit (nom, catégorie, stats, physique), le sticker arrive. On peut valider sans attendre le sticker.
2. **Persos** : chaque joueur peut aussi déposer une photo de personne pour son perso (lot LFACE). Pour les tests, uniquement des visages fictifs générés.
3. **Match** : écran scindé (ou vs IA). Chaque joueur a en main **son objet**, à sa taille réelle, et le lance.
4. **La mécanique s'adapte à l'objet**, mesurée par les événements du bus (`projectile:spawn`, `hit`, `weapon:ready` : masse, matière, taille, dégâts, recul, recharge, vitesse) :
   - la chaise fait plus de dégâts et de recul, part plus lentement, moins loin, et recharge plus longtemps que la canette ;
   - un objet fragile se brise, un liquide gicle, un objet rebondissant rebondit.
5. Captures à chaque étape (objet en main, en vol, à l'impact) : rapport visuel.

## À livrer
- **`tools/e2e/photo-jouable.mjs`** (`npm run e2e:photo`), un test Playwright qui joue CE parcours avec de VRAIS clics, dépôts de fichier et touches :
  - photos réelles d'Adem (`C:\Users\Adem\Documents\Hackathon Voodoo\Voodoo-Hack\tools\scan-bench\photos\objets\`, lues à ce chemin absolu, jamais copiées dans le dépôt) ;
  - VRAIES API (serveur Vite lancé par le script, port 5300-5399, garde son PID) ;
  - le script **compare chaise, canette, feutre et tabouret** et écrit `reports/e2e/<horodatage>/index.html` : captures, tableau des mesures en jeu, verdict VERT / ROUGE par critère.
- **La boucle** : lance le test, trouve chaque maillon cassé dans la chaîne UI → scan → état du jeu → règles → visuels, **répare-le**, relance. Stop quand tout est vert sur les 10 objets d'Adem, plus 2 persos fictifs.
- Tu as le droit de corriger n'importe quel fichier sur le chemin de la chaîne, par **petits commits ciblés** (message « LE2E : … »). En parallèle, ces agents travaillent sur leur propre partie : ne réécris pas leur travail, branche-le et répare les jointures, et note chaque jointure réparée dans ton rendu.

  | Agent | Chemins |
  |---|---|
  | LSCAN | physique du scan : `api/scan-object.ts`, `src/ia/physics.ts`, page `/scan-lab.html` |
  | LBENCH | qualité du sticker et banc des 10 objets : `api/sticker.ts`, `src/scene/sticker/` |
  | RTCORE | règles temps réel : `src/gameplay/**`, dont `physics-feel.ts` (physique → comportement) |
  | LATK1 | visuels de l'objet : `src/scene/weapons/**` |
  | LFACE | perso photo : `api/scan-fighter.ts`, `src/ia/fighter/**`, `src/scene/fighter-custom/**` |
  | LUX | interface (fusionné) |
  | RTVIEW | écran scindé |

  Fais `git merge main` souvent : ces agents y fusionnent au fil de l'eau.

## Contrôles
- `npm run build` passe.
- 1er rapport, même tout rouge (c'est la référence), commité dans les 30 minutes. Puis un rapport par itération. Envoie un message à la session principale avec le verdict à chaque rapport.
- Rendu `plan/rendus/LE2E.md` : jointures réparées, tableau des mesures chaise / canette.
