# Lot LAN · Animation vivante, façon Smash
Exécution : **Gemini** (Gemini CLI, meilleur modèle) · Évaluation : Claude (agent `animateur-exigeant`, `npm run anim`, juge vidéo Gemini) · Dépend de : LA fusionné. Le pack KayKit Character Animations est un plus.

## Exigence d'Adem
« Des mouvements les plus naturels possibles. Quand on lance, c'est vraiment le bras qui bouge. Un corps le plus expressif possible, qui s'adapte à son environnement. Rien de statique. »

## Règle de base
Chaque action suit 4 temps : **anticipation → action → continuité du mouvement → retour**. Tout le corps participe, jamais un seul membre. Référence : Smash Bros (lisible, exagéré, réactif).

## Tes chemins
- `src/scene/animation/**` ;
- les points d'accroche minimaux dans le module perso du lot LA, à signaler dans le rendu.

## À livrer
1. **Couches et fondus** :
   - couche de base (déplacement), couche haut du corps (actions, masque d'os à partir de `spine`), couche additive (réactions, recul, respiration) ;
   - fondus d'au moins 80 ms (50 ms pour un coup reçu), jamais de saut de pose ni de T-pose.
2. **Déplacement** :
   - vitesse de l'anim calée sur la vitesse au sol (écart ≤ 20 %, sinon les pieds patinent) ;
   - départ penché vers l'avant, arrêt avec un léger dépassement ;
   - penchement dans l'accélération (jusqu'à 12°) ;
   - petits pas quand le perso tourne sur place de plus de 45°.
3. **Saut** : accroupi 100 à 150 ms → étirement à l'impulsion → pose en l'air → écrasement de 80 à 120 ms à la réception + poussière.
4. **Lancer** (GRENADE, THROWABLE) :
   - armé de 150 à 250 ms : bras en arrière, torse qui pivote, poids sur le pied arrière ;
   - **le projectile naît dans la main, à l'image exacte du lâcher** : émettre `anim:release`, le gameplay crée le projectile à la position de l'os `handslot.r` ;
   - continuité de 200 ms : le torse continue de tourner, le bras croise ;
   - retour.
5. **BLASTER** : pose de visée (haut du corps et bras orientés vers la cible), recul additif de 60 ms à chaque tir, rafale en rythme.
6. **SHIELD** : pieds ancrés, corps arc-bouté, objet levé ; à l'impact, sursaut + glissade en arrière.
7. **Regard et visée** :
   - la colonne se tourne vers la cible, en répartissant la rotation (spine 0,2 · chest 0,3 · neck 0,2 · head 0,3) ;
   - le défenseur **suit des yeux** le projectile qui arrive.
8. **Réactions** :
   - coups directionnels (avant, arrière, gauche, droite) selon le vecteur de recul, d'intensité proportionnelle aux dégâts ;
   - recul physique avec roulade, puis relevé ;
   - KO : éjection en vrille + ralenti ;
   - parade : déviation sèche, et petite fioriture sur un PERFECT.
9. **Idle vivant, jamais figé** :
   - respiration, transfert de poids toutes les 2 à 4 s, regard vers l'adversaire, gestes nerveux tirés au hasard (graine) ;
   - essoufflé et voûté à PV bas, provocateur quand il mène.
10. **Adaptation à l'environnement** :
    - IK des pieds sur le terrain irrégulier : IK à 2 os par jambe, raycast, bassin ajusté, aucun pied dans le sol ;
    - **au bord du vide, bras en moulinet** (déséquilibre façon Smash) ;
    - glissade et titubation quand le pont gîte ;
    - sursaut et tête protégée quand ça explose à côté ;
    - regard vers les dalles qui tombent.
11. **Écrasement-étirement et mouvements secondaires** : écrasement ou étirement à volume constant à la réception et à l'impact ; ressort sur le chapeau, le chignon et les accessoires.

## Clips disponibles
- **Déjà présents** : `idle`, `run`, `jump`, `throw`, `cast`, `castLong`, `raise`, `block`, `dodge`, `hit`, `hitB`, `death`, `cheer` (+ `taunt`).
- **Pack KayKit Character Animations disponible** (`public/assets/packs/animations/`, même squelette, 139 clips, correspondances dans `plan/ASSETS.md`) : marche, visée, tir, blocage, esquives, saut en 3 temps, relevé, entrée en scène.
- **Encore manquants, à faire en procédural** (décalages d’os additifs) : déséquilibre au bord du vide, rotation sur place, recul de tir, respiration, humeur.

## Contrat de mesure (obligatoire, lu par `npm run anim`)
```ts
window.animMetrics = {
  samples: AnimSample[],   // tampon circulaire des 600 dernières images
  events: AnimEvent[],     // transitions, lâchers, apparitions, réactions, réceptions, pas
  reset(): void,
};
interface AnimSample { t: number; player: 0|1; clip: string; weight: number;
  groundSpeed: number; animRate: number;            // pieds qui patinent
  footSlideCm: [number, number];                    // glissement des pieds posés, par image
  footGapCm: [number, number];                      // écart pied-sol (+ = en l'air, − = dans le sol)
  facingErrDeg: number; lookErrDeg: number;         // vers la cible ou l'adversaire
  handPos: [number, number, number];               // mètres, repère monde (comme spawnPos)
  spineRotVar: number;                              // variation, pour détecter un idle figé
  layers: { footIK: boolean; lookAt: boolean; lean: number; squash: number } }
interface AnimEvent { t: number; player: 0|1;
  kind: 'transition'|'release'|'spawn'|'hit-react'|'land'|'footstep'|'teeter';
  from?: string; to?: string; durationMs?: number;
  handPos?: [number,number,number]; spawnPos?: [number,number,number] }
```
- Hooks de test à ajouter :
  - `gameHooks.animCamera(player, 'side'|'front'|'threeQuarter')` : caméra neutre sur l'acteur ;
  - `gameHooks.animPlay(player, action)`, avec `action` parmi `idle|walk|run|jump|throw|blaster|shield|hitFront|hitBack|ko|teeter|parry`.

## Seuils (vérifiés automatiquement, score sur 100)
| Critère | Seuil |
|---|---|
| Fondus | ≥ 80 ms (≥ 50 ms pour un coup reçu) |
| Glissement des pieds posés | < 1,5 cm par image |
| Vitesse d'anim / vitesse au sol | entre 0,8 et 1,2 |
| Écart projectile-main au lâcher | < 8 cm, à ±50 ms du marqueur de lâcher |
| Armé avant le lâcher | ≥ 120 ms ; continuité ≥ 150 ms |
| Orientation en visée | < 10° pour le torse, < 15° pour la tête |
| Pied-sol sur terrain irrégulier | \|écart\| < 4 cm |
| Réaction à un coup | lancée en moins de 100 ms |
| Idle | variation de colonne non nulle, au moins 2 couches actives |
| Réception | écrasement visible (échelle Y < 0,95) pendant au moins 60 ms |
| T-pose | aucune image |

## Validation
- `npm run anim` : au moins 85/100.
- Juge vidéo Gemini : au moins 8/10.
- Agent `animateur-exigeant` : au moins 8/10.
- Deux refus sur le même point : Adem tranche.
