---
name: demo-2min
description: Écrire, sécuriser et répéter la démo live de 2 minutes (script seconde par seconde, mode démo, vidéo de secours, QR code). À utiliser à midi pour écrire le script, puis à partir de 18h.
---

# Démo 2 minutes

## Script (`demo/SCRIPT.md`, écrit avant midi)
| Temps | Ce qu'on voit | Ce qu'on dit | Wow |
|---|---|---|---|
| 0:00–0:10 | ouverture cinématique | une phrase d'accroche, pas de présentation d'équipe | transition bougie |
| 0:10–0:40 | on joue, action lisible | ce que fait l'IA, en une phrase | première action |
| 0:40–1:20 | le jury participe | on tend le micro / on demande une idée au jury | le jury crée |
| 1:20–1:45 | climax | silence | ralenti décisif |
| 1:45–2:00 | écran de fin + QR code | pourquoi Voodoo / DeepMind, une vision | — |

## Sécurité
- `?demo=1` : graine aléatoire fixe, réponses IA pré-générées pour les phrases prévues, bascule sur la banque à 2,5 s (table de `ia-en-jeu`).
- **Régie au clavier** en `?demo=1` : F1 ouverture · F2 première action · F3 moment du jury · F4 climax · F5 écran de fin · **F9 panique** (tout en cache + saut au climax). Le présentateur ne dépend plus du hasard.
- **Vidéo de secours** : `npm run video` (enregistre le parcours de démo dans `captures/video/`). En plus, OBS ou Win+Alt+R si la Game Bar est active.
- **QR code** : il mène à une version en ligne SANS clé API (cache seul, ou la galerie souvenir). `npx vercel --prod` puis `npx qrcode "<url>"`. Voir la section « Clé » de `ia-en-jeu`.
- Portable branché, notifications coupées, onglets fermés, zoom navigateur à 100 %, son testé sur la sono.

## Répétition
Chronométrer 3 fois. Au-delà de 2:00, couper du texte, pas du jeu. L'agent `jury-simule` regarde les captures du parcours et dit où il décroche.
