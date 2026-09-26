# Lot LSCAN · « Je prends un objet en photo, il devient mon arme », vérifié de bout en bout
Exécution : **agent Claude (Opus)** · Feature ESSENTIELLE (la phrase du jeu : « Snap any real object: it becomes your weapon »).

## Existant (à vérifier de bout en bout avec la vraie clé)
- `api/scan-object.ts` (Gemini 3.8 Flash, JSON contraint : catégorie, stats, trait, palette, répliques ; ≈ 2 s) ;
- `api/sticker.ts` (Nano Banana Pro, sticker sur fond magenta ; ≈ 15 s) ;
- `src/ia/**` (`scanObject`, cache) ;
- `src/ui/screenArsenal.ts` et `src/ui/capture.ts` (webcam, dépôt de photo, forge ; lot LUX en cours de refonte) ;
- `src/scene/sticker/` (détourage + extrusion carton).
Le lot LATK1, en parallèle, affiche l'objet en main, en vol et à l'impact.

## Objectif
1. **Le parcours complet marche à chaque fois** : ARSENAL → « Scan an object » → webcam (ou dépôt de photo) → bouton **SNAP**. On voit tout de suite la photo, puis la carte d'arme se remplit :
   - la catégorie, les stats et le nom arrivent en 2 s ;
   - le sticker apparaît vers 15 s, avec la forge animée en attendant.
   Le joueur peut garder l'arme, en refaire une, ou changer la catégorie proposée.
2. **Vitesse perçue** : les stats partent en même temps que le sticker, et on peut valider l'arme **avant** que le sticker soit prêt : il se met à jour tout seul, même en match.
3. **Qualité** :
   - sticker détouré proprement : pas de liseré magenta, contour propre ;
   - extrusion carton lisible ;
   - taille correcte en main (vérifie avec LATK1) ;
   - stats bornées : budget de 10 points, trait pris dans la liste fermée. Le code arbitre, et le texte écrit sur l'objet est ignoré (voir `plan/rendus` du red-team).
4. **Robustesse** : pas de caméra, refus de sécurité, réseau lent. Message clair + arme de secours drôle ; délai maximum de 25 s pour le sticker. Cache par objet.
5. **Bonus démo** : les objets de `demo/OBJETS.md` (lot LD de Titouan) doivent passer à coup sûr. Pré-remplis le cache de démo (`public/demo-cache/`) pour ces objets, afin que la démo marche même sans réseau (`?demo=1`).

## Tes chemins
`api/scan-object.ts`, `api/sticker.ts`, `src/ia/**` (sauf `src/ia/fighter/**` : lot LFACE en parallèle), `src/scene/sticker/**`, `public/demo-cache/**`, et des modifications ciblées de `src/ui/screenArsenal.ts` et `capture.ts` (LUX refait l'interface : garde sa structure).

## Contrôles
- `npm run build` passe.
- Test réel avec la clé : 5 photos d'objets différents (génère des photos d'objets avec l'API d'images, ou utilise des photos CC0). Temps mesurés par étape, captures de chaque carte d'arme dans `captures/lscan/`.
- Test Playwright du parcours avec un faux flux de caméra (`--use-fake-device-for-media-stream`) et avec un dépôt de fichier.
