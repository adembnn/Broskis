# Lot LD · Démo, vidéo, bande-annonce
Responsable : **Titouan** (+ Adem pour le script) · Coût : faible · Dépend de : rien pour démarrer · Skill : `demo-2min`

## Tes chemins
`demo/**`, `art/references/**`

## Sortie attendue
1. **Tout de suite** : 3 à 5 images de référence dans `art/references/` pour le directeur artistique :
   - un stage de Smash Bros ;
   - le style KayKit ;
   - un animateur de ring ou de show TV ;
   - une carte à collectionner cartoon.
2. **Avant 13h, avec Adem** : `demo/SCRIPT.md`, seconde par seconde. Proposition de trame :
   - 0:00-0:10 : accroche (« Snap anything. Fight with it. ») ;
   - 0:10-0:40 : on scanne un objet sur scène, présentation par l'animateur ;
   - 0:40-1:20 : **le jury tend un objet** pendant la Caisse Snap, il devient une arme et touche ;
   - 1:20-1:45 : KO au ralenti par sortie de ring, en silence ;
   - 1:45-2:00 : écran de fin + pourquoi Voodoo et DeepMind.
3. **Objets de démo** : choisir 8 objets physiques drôles et fiables à scanner (tasse, banane, téléphone, peluche…). Avec Adem, pré-générer leur cache (lot LI).
4. **`demo/parcours.json`** : réécrit avec les vrais hooks (`startMatch`, `scan`, `move`, `fire`, `parry`, `grabCrate`, `forcerVictoire`) une fois L0 poussé.
5. **À partir de 18h** :
   - vidéo de présélection : `npm run video` + une capture propre avec OBS (Win+Alt+R en secours) ;
   - bande-annonce de 30 s, avec **Higgsfield** si les captures ne suffisent pas ;
   - répétition chronométrée 3 fois.

## Commit
Tes fichiers seulement, puis pull, push, et mise à jour de `plan/SUIVI.md`.

## Rendu (points 1 à 4)

- **`demo/SCRIPT.md`** réécrit seconde par seconde, en suivant exactement la trame proposée
  ci-dessus (accroche → scan+présentation → Caisse Snap avec objet du jury → KO au ralenti en
  silence → écran de fin). Chaque ligne reste valable même si le gameplay réel n'est pas encore
  câblé (note dédiée dans le fichier).
- **`demo/OBJETS.md`** (nouveau fichier) : les 8 objets physiques de démo, un par catégorie d'arme
  quand c'est cohérent (blaster/grenade/throwable/shield), avec pourquoi et un avis de fiabilité de
  scan pour chacun.
- **`demo/parcours.json`** réécrit avec les vrais hooks de `src/core/types.ts` → `GameHooks`
  (`setSeed`, `startMatch`, `scan`, `pickWeapon`, `move`, `jump`, `grabCrate`, `fire`, `parry`,
  `forcerVictoire`) ; validé avec `node -e "JSON.parse(...)"` (OK) et compatible avec
  `tools/capture.mjs` (un seul argument par hook, comme le lit ce script).
- **Images de référence** (`art/references/`) : 3 récupérées et téléchargées avec licence
  vérifiée (stage low-poly type Smash, cover officielle KayKit Adventurers en CC0, photo d'un
  animateur de ring de boxe en CC BY-SA 3.0). La 4e (carte à collectionner cartoon) n'a pas pu
  être téléchargée automatiquement dans le temps imparti (sites bloquant le scraping direct) ;
  termes de recherche précis documentés dans `art/references/LISEZMOI.txt` pour qu'un autre agent
  ou une personne la dépose rapidement.
- `npx tsc --noEmit` passe toujours (aucun fichier `src/**` touché).
