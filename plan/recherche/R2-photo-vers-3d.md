# Recherche R2 · photo → arme : sortir le sticker du plan (recherche express, 15 min)

Contexte : l'arme scannée est aujourd'hui un sticker plat extrudé (`src/scene/sticker/index.ts`, lot LS, fait — chromaKey + despill, plus grande composante connexe, contour Moore, simplification RDP, `ExtrudeGeometry` à épaisseur **constante** ≈0,06 + léger biseau, matériau toon, ~50-90 ms/sticker mesuré). Objectif : que ce soit vraiment CET objet en volume, sans casser le budget latence du jeu ni le gel de 18h.

**Méthode** : lecture du code existant + de `tools/vedettes/hf3d.mjs` (déjà écrit pour les vedettes-personnages, pas les armes, mais le mécanisme est réutilisable) + `plan/SUIVI.md` (LP2b : les 3 Spaces déjà essayés — Hunyuan3D-2.1, Hunyuan3D-2, TRELLIS — refusent l'appel anonyme). Puis **vérifications réelles aujourd'hui, en HTTP, sans compte, sans jeton** : statut public de 8 Spaces Hugging Face, schéma exact de leur API Gradio, et 2 appels bout-en-bout réels (upload + génération + résultat).

## 1. Ce qui bloque déjà : diagnostic confirmé de « Gradio Error: null »

- Les payloads déjà écrits dans `hf3d.mjs` pour Hunyuan3D-2.1 (`/generation_all`, 12 paramètres) et TRELLIS (`/generate_and_extract_glb`, 10 paramètres) correspondent **exactement**, dans le bon ordre, au schéma actuel de ces Spaces (vérifié aujourd'hui via `/gradio_api/info`). **Le script n'est pas cassé.**
- J'ai testé en direct, anonymement, un **3ᵉ** Space jamais essayé par l'équipe (`stabilityai/stable-fast-3d`, SF3D) : upload OK (200, 646 ms), puis rejet en **492 ms** avec exactement le même symptôme, `Gradio Error: null` (SSE `event: error`, charge `null`). Un rejet à 492 ms est bien trop rapide pour être un vrai calcul GPU (SF3D annonce 0,5 s de calcul *après* démarrage) : c'est un **refus immédiat avant même de lancer le modèle**.
- Cause identifiée (recoupée avec les forums Hugging Face/Gradio) : les Spaces `zero-a10g` (ZeroGPU) appliquent un **quota GPU très restreint pour les appels anonymes**, resserré courant 2026, et Gradio masque volontairement le détail de l'exception aux appels API publics (d'où `null` au lieu d'un message). Un compte gratuit (aucune carte bancaire) fait sauter ce mur : de l'ordre de 180 s de quota en anonyme contre ~300 s connecté et jusqu'à ~1500 s en Pro (ordres de grandeur, à vérifier au jour J — [doc officielle ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu)).
- **Conclusion pratique : ce n'est pas un bug à corriger, c'est un mur d'accès.** Un jeton gratuit débloque Hunyuan3D-2.1/TRELLIS/SF3D tels quels.

## 2. Statuts vérifiés aujourd'hui (26/09, en direct — peut changer d'ici ce soir)

| Space | Modèle | Statut réel | Notes |
|---|---|---|---|
| `tencent/Hunyuan3D-2.1` | Hunyuan3D 2.1 | **RUNNING** (zero-a10g) | déjà dans `hf3d.mjs`, payload vérifié correct |
| `tencent/Hunyuan3D-2` | Hunyuan3D 2.0 | **RUNNING** (zero-a10g) | repli existant dans `hf3d.mjs` |
| `trellis-community/TRELLIS` | TRELLIS | **RUNNING** (zero-a10g) | payload vérifié correct |
| `stabilityai/stable-fast-3d` | SF3D | **RUNNING** (zero-a10g) | pas encore dans `hf3d.mjs` ; testé en direct ce jour → bloqué anonyme (§1) |
| `stabilityai/TripoSR` | TripoSR | **RUNTIME_ERROR** | cassé en ce moment, à écarter aujourd'hui |
| `stabilityai/stable-point-aware-3d` | SPAR3D (successeur de SF3D) | **BUILD_ERROR** | cassé en ce moment |
| `depth-anything/Depth-Anything-V2` | Depth Anything V2 | **RUNNING** (zero-a10g) | testé en direct ce jour → **marche anonymement**, voir §3 |
| `tencent/Hunyuan3D-2mini` | Hunyuan3D-2mini | pas de Space public | existe seulement comme poids sur le Hub (`pipeline_tag: image-to-3d`), pas d'API prête — à écarter aujourd'hui |

## 3. Le seul appel réseau qui a vraiment marché en anonyme aujourd'hui

Appel réel, sans compte, sans jeton, sur `depth-anything/Depth-Anything-V2` avec une des vraies images de test du repo (`public/test/stickers/mug-blaster.jpg`) :

```
[upload]     HTTP 200 en 629 ms
[call init]  HTTP 200 en 260 ms
[SSE complete @ 2483 ms]  → carte de profondeur (grayscale + 16-bit) reçue
TOTAL : 3171 ms
```

Une carte de profondeur monoculaire, anonyme, en ~3,2 s, **aujourd'hui, sans rien demander à personne**. C'est le seul des 3 essais réels (SF3D échoué, TRELLIS/Hunyuan3D non re-testés en direct mais même famille de blocage documentée) qui a produit un résultat.

## 4. Tableau comparatif

| Option | Latence réelle | Qualité | Poids fichier | Coût | Dispo gratuite | Clé / jeton | Intégration web |
|---|---|---|---|---|---|---|---|
| **1. Sticker extrudé amélioré** (code seul) | ~50-90 ms mesuré, **aucun réseau** | Correcte de loin ; plat de près, dos = image miroir (voir §5) | 0 fichier 3D (procédural, juste la texture déjà chargée) | 0 | Toujours | Non | Déjà en prod, à étendre |
| **2. Carte de profondeur** (Depth Anything V2, HF Space) | **3,17 s mesuré aujourd'hui**, anonyme | 2,5D correct (bosselage), pas une vraie ronde-bosse | + une image profondeur (qq centaines de Ko) | 0 | **Oui, vérifié aujourd'hui, sans compte** | Non aujourd'hui (recommandé pour fiabiliser ce soir) | Appel HTTP upload+SSE (pattern déjà écrit dans `hf3d.mjs`), à faire côté serveur (`api/*.ts`) pas client |
| **3. Vraie 3D (SF3D / Hunyuan3D-2.1 / TRELLIS)** | **Bloqué anonyme, vérifié** (rejet <1 s) ; avec jeton : 0,5 s de calcul SF3D annoncé + file d'attente/cold start ZeroGPU non maîtrisables (souvent 10-30 s+) | La meilleure en volume/texture réelle | GLB estimé 2-15 Mo (non vérifié aujourd'hui, échecs avant génération) | 0 en argent | Oui, mais **quota anonyme épuisé aujourd'hui** | **Oui**, jeton HF gratuit nécessaire en pratique | Déjà écrit (`hf3d.mjs`), mais jamais dans la boucle de jeu (voir §6) |
| **4. Autre piste : profondeur en local navigateur** (transformers.js + `onnx-community/depth-anything-v2-small`) | Temps réel annoncé par les auteurs (WebGPU), non testé ici | Similaire à l'option 2, mais **zéro dépendance réseau au moment du live** | Modèle ~50 Mo (fp16) à charger une fois, en cache | 0 | Oui, tout tourne dans le navigateur | Non, aucun compte | Nouvelle dépendance npm (impact règle « une seule personne installe les paquets ») + WebGPU à vérifier sur le PC de démo — **trop de risque nouveau pour aujourd'hui**, piste propre pour après |

## 5. Ce que le code actuel peut gagner SANS aucun appel réseau

En lisant `src/scene/sticker/index.ts` : `geometry.groups.forEach((g, idx) => { g.materialIndex = idx < 2 ? 0 : 1; })` applique le **même** matériau/texture à la face avant et à la face arrière, et `applyFrontUVs` calcule l'UV uniquement à partir de la position (x, y) du sommet — donc la face arrière affiche aujourd'hui l'image **mise en miroir** (pas un vrai dos, pas une face vierge). À noter aussi : Nano Banana ne génère qu'**une seule vue** de l'arme, donc un « vrai » dos texturé différent n'existe nulle part sans un 2ᵉ appel image — ce n'est pas rattrapable en pur post-traitement.

Deux améliorations pur-code, budget < 1 h, zéro réseau, zéro risque démo :
1. **Dos uni carton** au lieu du miroir : assigner à la face arrière une couleur plate (teinte carton/tranche déjà définie, `CARDBOARD_TRANCHE`) au lieu de `frontMaterial` — cohérent avec l'esthétique « découpe en carton » (un vrai sticker/standee a un dos vierge), corrige un défaut visible sans toucher au reste du pipeline.
2. **Volume par gonflage géométrique** (technique classique, façon *Teddy*/SIGGRAPH, aucune IA) : le masque alpha nettoyé existe déjà (`keepLargestComponentAndFillHoles`) ; une **transformée de distance** au bord de la silhouette (même famille d'algorithme que le BFS déjà écrit dans ce fichier) donne, par pixel, une épaisseur locale approximative — plus épais au centre/large de l'objet, fin sur les bords. On pousse front/back le long de leur normale proportionnellement à cette distance (clampée). Résultat : un objet qui a l'air « gonflé » (jouet en plastique moulé) au lieu d'une planche, dans le même budget de 50-90 ms, sans dépendance nouvelle.

**C'est cette option 1 améliorée qui doit passer avant le gel de 18h** : c'est le seul chemin qui reste garanti à 100 % en direct pendant les 2 minutes de démo.

## 6. Recommandation principale

**Ne jamais faire dépendre le tour de jeu (le lancer d'arme, en direct) d'un appel à un Space Hugging Face.** Même en cas de succès technique, la file d'attente partagée + le cold start ZeroGPU restent imprévisibles (et beaucoup de monde tape sur ces mêmes Spaces gratuits un jour de hackathon) — c'est exactement le genre de dépendance réseau que la table de latence du skill `ia-en-jeu` (2,5 s = abandon) interdit d'avoir dans le chemin critique.

1. **Maintenant → avant 18h** : les 2 correctifs de l'option 1 (§5), purement locaux. C'est le seul gain garanti pour la démo de ce soir.
2. **Si le temps le permet, en tâche de fond, jamais bloquant** : brancher Depth Anything V2 (option 2, marche déjà anonymement, ~3,2 s mesuré) pour remplacer le gonflage géométrique par un vrai relief, mais **précalculé pendant l'écran de chargement/scan** (habillage « dès 300 ms » de la table de latence) ou mis en cache pour les objets vedettes de `?demo=1` — jamais comme condition pour que l'arme apparaisse. Le sticker géométrique (§5) reste le filet de sécurité si l'appel traîne ou échoue.

## 7. Plan B (si Adem obtient un jeton avant le gel, pour 2-3 armes « hero » pré-cuites)

Reprendre `tools/vedettes/hf3d.mjs` tel quel (payloads déjà vérifiés corrects aujourd'hui), dans la même logique que les vedettes-personnages LP2 : **préparé à l'avance, jamais généré en direct**.

Étapes :
1. Adem crée un compte HF gratuit (aucune carte) et un jeton en lecture : [huggingface.co/join](https://huggingface.co/join) puis [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) (< 2 min).
2. Ajouter `HF_TOKEN=hf_...` dans `.env` (déjà lu automatiquement par `hf3d.mjs`, ligne `envToken`).
3. Ajouter SF3D à la liste `SPACES` de `hf3d.mjs` (host `https://stabilityai-stable-fast-3d.hf.space`, préfixe `/` car Gradio 4.x, endpoint `/run_button`, payload `[{path: uploaded}, 0.85, "None", -1, 1024]` — 5 paramètres seulement, une seule image, pas de vue de dos à fournir contrairement à Hunyuan3D) : c'est le plus simple des 3 à intégrer et le plus rapide côté calcul (0,5 s annoncés par Stability AI).
4. Lancer `node tools/vedettes/hf3d.mjs <nom>` sur 2-3 objets choisis à l'avance (les mêmes stickers de test `public/test/stickers/` sont un bon départ), bien avant 18h, avec marge pour re-essayer si la file d'attente est chargée.
5. Garder le résultat comme asset statique swappé (même principe que `loadVedette` du lot LP2/LFACE) : une table `nom d'objet → chemin GLB pré-cuit`, sticker en repli automatique pour tout objet hors de cette liste.
6. Ne jamais relancer cette génération pendant la démo elle-même.

## 8. Ce qu'il faut à Adem

**Un jeton Hugging Face gratuit** (compte gratuit, aucune carte bancaire, 2 minutes : [huggingface.co/join](https://huggingface.co/join) → [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens), jeton de type « Read » suffit) — uniquement utile pour le Plan B (§7, vraie 3D pré-cuite sur 2-3 armes). **Rien n'est nécessaire** pour la recommandation principale (§6) : ni l'amélioration géométrique du sticker, ni Depth Anything V2, qui marche déjà aujourd'hui sans compte.

## Sources

- [Spaces ZeroGPU: Dynamic GPU Allocation — doc officielle Hugging Face](https://huggingface.co/docs/hub/spaces-zerogpu)
- [Free Account ZeroGPU Quota Issue — Hugging Face Forums](https://discuss.huggingface.co/t/free-account-zerogpu-quota-issue/175180)
- [ZeroGPU quota error when I logged in — Hugging Face Forums (quotas 180s/300s/1500s)](https://discuss.huggingface.co/t/zerogpu-quota-error-when-i-logged-in/164314)
- [« GPU task aborted » — zero-gpu-explorers/README discussion (signature d'erreur générique)](https://huggingface.co/spaces/zero-gpu-explorers/README/discussions/119)
- [Introducing Stable Fast 3D — Stability AI (benchmark officiel 0,5 s)](https://stability.ai/news/introducing-stable-fast-3d)
- [Space tencent/Hunyuan3D-2.1](https://huggingface.co/spaces/tencent/Hunyuan3D-2.1)
- [Space trellis-community/TRELLIS](https://huggingface.co/spaces/trellis-community/TRELLIS)
- [Space stabilityai/stable-fast-3d](https://huggingface.co/spaces/stabilityai/stable-fast-3d)
- [Space stabilityai/TripoSR (RUNTIME_ERROR au moment du test)](https://huggingface.co/spaces/stabilityai/TripoSR)
- [Space stabilityai/stable-point-aware-3d, SPAR3D (BUILD_ERROR au moment du test)](https://huggingface.co/spaces/stabilityai/stable-point-aware-3d)
- [Space depth-anything/Depth-Anything-V2](https://huggingface.co/spaces/depth-anything/Depth-Anything-V2)
- [Modèle tencent/Hunyuan3D-2mini (poids seuls, pas de Space)](https://huggingface.co/tencent/Hunyuan3D-2mini)
- [onnx-community/depth-anything-v2-small — pour l'option 4, local navigateur](https://huggingface.co/onnx-community/depth-anything-v2-small)
- [Building Cinematic Depth in the Browser with Depth Anything V2 Small and WebGPU](https://dev.to/martindelophy/building-cinematic-depth-in-the-browser-with-depth-anything-v2-small-and-webgpu-1k07)
- [Depth-Anything-V2 — dépôt GitHub officiel](https://github.com/DepthAnything/Depth-Anything-V2)
- [Fal.ai — pas retenu aujourd'hui : crédits d'essai annoncés (~10-20$) mais carte/limites non confirmées officiellement, et l'équipe (LP2b) l'a déjà écarté comme « demande une clé payante »](https://fal.ai)

## Fichiers lus / vérifications faites pour cette recherche

`src/scene/sticker/index.ts`, `src/scene/sticker/preview.html`, `tools/vedettes/hf3d.mjs` (copie `.claude/worktrees/gem-LP2b/`), `plan/lots/LS-sticker-3d.md`, `plan/lots/LP2-vedettes-3d.md`, `plan/lots/LP2b-3d-gratuite.md`, `plan/SUIVI.md`, skill `ia-en-jeu`. Vérifications réseau réelles (26/09, sans compte, sans jeton) : statut public de 8 Spaces Hugging Face (`api/spaces/...`), schéma `/gradio_api/info` ou `/info` de 4 d'entre eux, et 2 appels bout-en-bout complets (upload + génération) sur `stabilityai/stable-fast-3d` (échec, 492 ms) et `depth-anything/Depth-Anything-V2` (succès, 3,17 s) avec les images de test du repo (`public/test/stickers/`). Aucun fichier du dépôt modifié à part celui-ci.
