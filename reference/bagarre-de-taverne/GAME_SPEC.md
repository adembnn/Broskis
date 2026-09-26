# BAGARRE DE TAVERNE — Spécification v2 (contrat commun à tous les agents)

Jeu web 3D cartoon (Three.js 0.180 + Rapier compat + Vite, JS vanilla). Démo de hackathon (jury Voodoo + Google DeepMind) : doit impressionner en 2 minutes, jouable à la souris + clavier, 60 fps sur GPU intégré.
Principe cardinal : **l'IA propose, le code décide.** Les LLM ne renvoient que du JSON choisi dans des listes fermées ; un moteur déterministe applique les conséquences. Chaque appel IA est asynchrone, avec délai max et repli local ; la boucle de rendu n'attend JAMAIS le réseau.

## 1. Modes
- **Tournoi (solo, temps réel)** : 3 adversaires IA puis boss final.
  1. *Boulon le Rouge* — brute : sorts simples et gros objets.
  2. *Dame Givre* — tacticienne : contre ton élément (tu lances du feu → elle mouille le sol), pare souvent.
  3. *Le Copieur* — réutilise et améliore TES sorts précédents (miroir).
  4. Boss : *Ton Reflet* — ta couleur, tes sorts préférés, tes habitudes (profil appris sur tout le tournoi).
- **Duel 2 joueurs (même écran)** : tour par tour 15 s (clavier partagé), la souris reste active pour parer pendant le tour adverse.

## 2. Rythme temps réel (tournoi)
- Jauge de **mana** 0–100, régénération ~10/s. Coût d'un sort = 15 + 5×puissance (plafonné) ; objet du décor = 20.
- Écrire (champ texte focalisé et non vide) ralentit le temps à ×0.35 pour tout le monde (« bullet time » de l'incantation) ; interprétation IA en cours = ×0.2 avec anneau runique.
- Les réflexes souris restent disponibles à tout moment (voir §4).

## 3. Décor chimique (moteur de règles `src/chem.js`, données dans `src/rules.js`)
- Chaque **entité** (prop, surface/flaque, combattant) a : `material` (wood, cloth, metal, stone, liquid, glass, flesh), `states` (Map état→ticks restants), `heat`, `fuel`, `neighbors`.
- Éléments que peut produire un sort : `fire, water, frost, lightning, wind, oil` (+ arcane/lumière/ombre neutres ou mappés : ombre→smoking, nature→sticky).
- États : burning, wet, frozen, electrified, oily, sticky, smoking, charred.
- Tick 250 ms. Règles élément×matériau, état×état (burning+wet→smoking ; burning+oily→flambée ; wet+electrified→shockFlood BFS 6 sauts via metal/wet/liquid ; wet+frost→frozen ; frozen + choc fort → éclatement ×1.5 ; burning+frozen→wet).
- Propagation du feu par voisinage (graphe recalculé 0.5 s), carburant, `charred` = casse (ex. corde du lustre brûlée → lustre tombe).
- Flaques = surfaces (décalque + capteur Rapier), fusionnent, transmettent leur état. Tonneau de bière cassé → flaque de bière ; tonneau d'huile (marqué) → flaque d'huile ; marmite → soupe (liquid chaude) ; bouteilles d'alcool (glass) → flaque inflammable.
- Effets combattants : burning 4 PV/s 3 s ; electrified 12 dégâts + étourdi 0.8 s (×2 si wet) ; lanceur mouillé qui lance la foudre prend 50 % ; frozen immobile 1.5 s ; oily → dégâts feu ×2 + glisse ; sticky → vitesse ×0.5 ; smoking → caché (non ciblable auto).
- Chaque réaction est visible (VFX + son + libellé flottant « ÉLECTROCUTÉ ! ») et journalisée sur le bus (`chem:reaction`) pour le commentateur et la détection de combos.

## 4. Réflexes souris (`src/input/*.js`)
- **Parade** : clic sur un projectile ennemi. Fenêtres (ms avant impact) : parfaite 0–90 (renvoi ×1.5 auto-visé + interrompt l'incantation adverse), correcte 90–220 (renvoi vers le curseur), trop tôt 220–400 (blocage 50 %), raté → verrou 350 ms. Tolérance +40 ms souris / +80 tactile. Ralenti ×0.3 dans les 250 ms avant impact (max 1 fois / 3 s). Hitstop 70/110 ms. Télégraphe ≥ 450 ms. Les gros sorts (météore, nova) ne se parent pas : on esquive ou on bloque.
- **Attraper-lancer** : chopes, tabourets, caisses, bouteilles. Kinematic pendant la prise, vitesse moyenne des 80 dernières ms au lâcher (×1.3, max 25 m/s), CCD. Un objet lancé peut intercepter un projectile.
- **Table-bouclier** : clic sur la table → bascule (charnière) et arrête 2 projectiles, recharge 6 s.
- **Esquive** : clic sur le sol à ≤ 3 m → dash 150 ms, invulnérable 120 ms, recharge 2.5 s.
- **Glyphes** (clic droit maintenu ou Maj+glisser) reconnus par $1 Unistroke : cercle = bulle 1.5 s ; zigzag = éclair d'interruption ; ligne rapide = tranche-sort (coupe un projectile en deux, 50 %) ; triangle = mini-boule de feu. Tracé visible, glyphe « propre » si reconnu, pschitt sinon.
- Survol : contour doré sur l'objet interactif + icône d'action. Curseur contextuel.
- L'IA adverse utilise aussi ces réflexes (parade probabiliste selon personnalité, lancer d'objets).

## 5. IA partout (`src/ai/*.js`), fournisseurs : Claude (`window.claude.use('sample')` en artifact), Gemini (`VITE_GEMINI_API_KEY`), local
- **Oracle** (existant, à étendre) : texte → {kind: spell|prop|law|mirror|weather|possess|summon, …} validé par enums dynamiques (ids d'entités vivantes). Garder le parseur local de secours très riche.
- **Adversaire** : cerveau temps réel local (choix d'action toutes les 1.5–3 s selon mana, distance, états, personnalité) + **profil d'habitudes** (télémétrie : objets utilisés, éléments, esquives, direction) → au-delà de 3 répétitions débloque un contre visible (« Habitude détectée : lustre ×4 » puis il coupe la corde avant toi) ; résumé LLM facultatif entre les manches.
- **Metteur en scène** (director) : jauge d'intensité façon Left 4 Dead ; toutes les ~8–12 s un événement annoncé (télégraphe ≥ 1.5 s) : le lustre grince, lumières coupées 3 s, le patron lance un tonneau, courant d'air, rats, pluie de chopes, bagarre générale de clients.
- **Foule** : 8–12 clients chibis (primitives toon) autour de l'arène, groupes (ivrognes, commères, marchands…) : acclament, huent, fuient, lancent des tomates (dégâts 1-2, physique). Jauge **Ambiance** : coups créatifs/combos la remplissent → bonus de dégâts ×1.2 quand pleine.
- **Commentateur** : barde qui commente en français (ligne locale immédiate < 16 ms, remplacée par ligne IA si arrivée < 600 ms ; péremption 2 s ; anti-répétition 15 dernières). Voix : `speechSynthesis` du navigateur (Gradium au hackathon). Score de **créativité** calculé par le code (nouveauté, décor, variété, combos) ; **écho** = pénalité si un sort ressemble aux précédents.
- **Première mondiale** : combo/sort jamais vu (registre localStorage protégé par try/catch) → bannière dorée « PREMIÈRE MONDIALE : Soupe électrique ».

## 6. Moments « wow » (`src/wow/*.js`)
- **Loi de la Taverne** : « la gravité est au plafond / tout rebondit / sol en glace / ralenti / géants » → règle active 20 s, panneau en bois suspendu « LOI : … » qu'on peut casser (clic ×3 ou projectile) pour l'annuler.
- **Sort Miroir** : renvoie la dernière incantation adverse contre lui.
- **Possession** : « je deviens le lustre » → contrôle de l'objet 5 s à la souris, clic = lâcher/charger.
- **Météo d'intérieur** : pluie (tout le monde mouillé → la foudre devient terrible), neige (sol glissant), brouillard, orage.
- **Onomatopées 3D** : « BOUM », « SPLASH », « BZZT » en lettres 3D physiques qui tombent et rebondissent.
- **Coup critique** : arrêt sur image + zoom + bulle BD du texte de l'incantation.
- **Écran de fin** : grimoire des sorts, meilleur combo, profil d'habitudes détecté, « L'Addition » (coût des dégâts de la taverne).

## 7. Direction artistique (voir /home/claude/design-system-cartoon.md et /home/claude/toon-kit.js)
- Toon 3 paliers, contours brun encre #2B1D14, palette taverne chaude, accent sarcelle. UI parchemin, bordure 3 px, ombre dure sans flou, pas de lueurs/dégradés, pas de bordure latérale épaisse, pas d'eyebrow en capitales. Polices : Lilita One (titres) + Nunito/Alegreya Sans (texte). Vérifier avec `npx --prefix /home/claude/imp impeccable detect index.html src/style.css`.
- Personnages : KayKit Adventurers/Skeletons optimisés (voir `src/assets/kaykit/manifest.json` quand présent) ; RobotExpressive en secours.
- Budget : ≤ 150 draw calls, ≤ 250 k triangles, ≤ 2 000 particules, pixelRatio ≤ 1.5.

## 8. Contraintes techniques
- Artifact claude.ai : un seul fichier HTML (vite-plugin-singlefile, `node build-artifact.mjs`), ≤ 16 Mo, aucun fetch externe (assets en data URI), pas de micro/caméra, localStorage peut échouer (try/catch).
- Bus d'événements `ctx.events` (on/emit/off). Toutes les features se branchent par des modules `install(ctx)` pour limiter les conflits dans `main.js`.
- Hooks de test : `window.arena` (state, entities, cast(text), parry(), grab(), forceEvent(type)), `window.__fast`, `render_game_to_text()`.
- Tests Playwright (chromium swiftshader : `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`), captures dans `shots/`, zéro erreur console.
