# Lot LP2 · Vedettes 3D préparées (Adem et Titouan en vraie 3D) · SANS Tripo
Responsable : **PC d'Adem** (piloté par Gemini, supervisé par Claude) · Coût Claude : faible · Bonus : abandon sans regret si ce n'est pas beau à 16h30

## Contexte
En direct, un perso photo = un corps KayKit recoloré + visage cartoon (lot LP). Pour la démo et la vidéo, on veut **Adem et Titouan en vraie 3D cartoon**, préparés à l'avance, avec le même squelette que KayKit pour réutiliser toutes les animations.

**Pas de Tripo** (payant, pas de clé). On passe par le **MCP Blender** du kit `C:\Users\Adem\repos\ai-gaming-hack`, qui intègre deux générateurs image vers 3D :
- **Hyper3D Rodin**, avec une clé d'essai gratuite déjà dans l'addon ;
- **Hunyuan3D** (Tencent).

Il n'est installé que sur le PC d'Adem, d'où le lot fait sur ce PC.

## Tes chemins
`tools/vedettes/**`, `public/assets/vedettes/**`

## Étapes (environ 5 min par perso)
1. **Installer le MCP Blender une fois** : `C:\Users\Adem\repos\ai-gaming-hack\INSTALLER.bat`, avec Blender fermé ; journal dans `install.log`.
2. **Planche du perso** : Nano Banana Pro (`gemini-3-pro-image`, clé Gemini du `.env`). Le perso cartoon en pied, en **T-pose**, vu de face, dans le style KayKit (tête un peu grosse, couleurs à plat, fond uni).
3. **Image vers 3D dans Blender** via le MCP : génération Rodin (clé d'essai gratuite, nombre limité par jour), ou Hunyuan3D si Rodin est saturé.
4. **Blender**, piloté par le MCP ou par un script Python `tools/vedettes/prepare.py` en ligne de commande (`blender.exe -b -P`) :
   - décimation vers environ 5 000 triangles ;
   - matériau simple ;
   - **squelette automatique** (Rigify ou poids automatiques) ;
   - **os renommés vers le squelette KayKit « Rig_Medium »** (`hips`, `spine`, `chest`, `head`, `upperarm.l`, `lowerarm.l`, `hand.l`, `handslot.r`…) ;
   - export GLB.
5. **Test** : charger le GLB avec une animation KayKit (`idle`, `throw`) et vérifier qu'il n'y a pas de déchirure. Sinon, on garde le corps KayKit.

## Contrôles
Chaque GLB fait moins de 3 Mo et s'anime proprement.

## Commit
Tes fichiers seulement, puis pull, push, et mise à jour de `plan/SUIVI.md`.
