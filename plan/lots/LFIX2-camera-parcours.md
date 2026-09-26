# Lot LFIX2 · Caméra large façon Smash + parcours complet sans accroc
Exécution : **Gemini** · **Priorité 1** · Retour d'Adem et Titouan (14h, en jouant) : « la caméra est trop proche du personnage ».

## Déjà corrigé sur main (ne refais pas)
- Persos invisibles (récursion des coques vinyle, `src/scene/fighters/loader.ts`).
- Sol provisoire caché dès qu'une map est chargée (`src/scene/render/environment.ts`).
- Menus effacés au `match:start` (`src/ui/index.ts`).
- Recul caméra passé de 3,4 m à 6,5 m (`src/scene/localTokens.ts`). **Insuffisant** : il faut changer de logique de cadrage.

## 1. Caméra (`src/scene/camera/**`, partie `camera` de `src/scene/localTokens.ts`)
Références : **Super Smash Bros. Ultimate** et **Brawlhalla** : les 2 combattants **toujours à l'écran**, avec le bord de l'arène et le vide visibles. C'est ce qui rend lisibles le recul et les éjections.
- **Phase déplacement et visée** : caméra 3/4 large, légèrement derrière l'attaquant et **au-dessus** (≈ 30° de plongée). Elle cadre la boîte englobante des 2 persos avec 25 % de marge (zoom automatique, lissé à 0,15 s, bornes de distance 9 à 22 m). L'attaquant est au premier tiers de l'écran, l'adversaire bien visible, le bord de l'arène dans le cadre.
- **Bascule vers le défenseur** (validée, ne la supprime pas) : garde l'arc de 0,7 s et le ralenti ×0,25, mais termine **derrière l'épaule du défenseur à 5 m**, et non collée à lui, en voyant le projectile arriver **et** l'attaquant au loin.
- **Impact et éjection** : la caméra recule pour suivre le perso éjecté jusqu'à la sortie de l'arène.
- **Occlusion** : tout décor entre la caméra et un des 2 persos devient transparent (opacité 0,15, fondu de 0,2 s) : mâts et voiles du Galion, meubles de la Cuisine. Aujourd'hui, sur ces 2 maps, on ne voit pas les persos (captures de Claude). Cherche si le moteur de maps (`src/scene/maps/`) a déjà ce mécanisme et branche-le, sinon crée-le dans `src/scene/camera/occlusion.ts`.
- Ne jamais placer la caméra **dans** une géométrie : test de collision caméra ↔ décor, puis rapprochement si besoin.

## 2. Le parcours complet depuis l'écran-titre (`src/ui/**` sauf `hud.ts`)
Joue-le par script Playwright (port libre 5300-5399, garde le PID du serveur, arrête-le à la fin) : **PLAY → choix des persos → arsenal (3 préréglages chacun) → présentation des armes → choix de la map → match → au moins 2 tours → écran de fin → REMATCH**. Fais-le sur les 3 maps, puis une fois avec **vs AI**. Corrige tout ce qui bloque, casse ou laisse un écran vide. Le bouton « vs AI » ne doit plus chevaucher le texte « coming soon » (ce texte doit disparaître : le mode existe).

## 3. Le banc d'animation (`tools/anim/anim-eval.mjs`)
Ses planches ne montrent que l'écran-titre : le banc doit démarrer le match sans menus (`startMatch` efface maintenant les menus : vérifie-le). Passe aussi son port 5173 dans la plage 5300-5399, pour ne pas couper le serveur de jeu d'Adem.

## Contrôles
- `npm run build` passe.
- `captures/lfix2/<map>-deplacement.png`, `<map>-bascule.png` et `<map>-impact.png` pour les 3 maps : les 2 persos visibles sur chaque image, aucun décor devant eux.
- Le parcours complet ne lève aucune erreur console : colle le journal dans ton rendu.
