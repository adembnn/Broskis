# Lot LVOL · Le vrai relief des objets scannés (carte de profondeur)
Exécution : **agent Claude (Opus)** · Le banc LBENCH (15 passages, `plan/rendus/LBENCH.md`) plafonne à 6,3/10. Le critère le plus faible est le **volume, noté 3-4/10** : de profil, le juge voit « un sticker extrudé ». La recherche R2 (`plan/recherche/R2-photo-vers-3d.md`) a vérifié que **Depth Anything V2** répond en anonyme en ≈ 3 s sur un Space Hugging Face.

## À faire
1. `api/depth.ts` : reçoit l'image du sticker (fond transparent ou magenta), appelle Depth Anything V2 (API Gradio du Space, voir R2 et `tools/vedettes/hf3d.mjs` pour le protocole), renvoie la carte de profondeur en niveaux de gris. Délai maximum 8 s, sinon erreur propre.
2. `src/scene/sticker/` : si la profondeur arrive, la face avant du sticker (maillage déjà gonflé par LBENCH) est **déplacée selon la profondeur** : relief réel, par exemple l'assise de la chaise en avant du dossier et le pied en retrait, borné pour rester propre au bord. Sinon, on garde le vinyle gonflé actuel.
   - Jamais bloquant : appliqué à l'arrivée, même en jeu.
   - La face arrière reste propre (miroir adouci ou dos uni).
3. Mesure au banc : `npm run scan-bench -- --reprendre` réutilise les réponses API (voir `plan/rendus/LBENCH.md`). Note « volume » et moyenne avant/après sur les 10 objets d'Adem. Ne garde le relief que s'il fait monter la note.

## Tes chemins
`api/depth.ts` (nouveau), `src/scene/sticker/**`. **Pas** `src/scene/weapons/hand.ts` (LGRIP), **pas** `src/ui/**` (LWAIT, LWAIT-OBJ).

## Contrôles
`npm run build`, captures avant/après (face, 3/4, profil) de la chaise, du tabouret et de la lampe, dans `captures/lvol/`, et note du banc.
