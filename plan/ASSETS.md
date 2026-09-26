# Inventaire des assets (à lire AVANT toute génération 3D)

## Déjà disponibles (licence CC0, KayKit de Kay Lousberg)
Source : `C:\Users\Adem\repos\bagarre-de-taverne\src\assets\kaykit\`. Le lot L0 les copie dans `public/assets/characters/`.
- **Persos** : `barbarian.glb`, `knight.glb`, `mage.glb`, `rogue_hooded.glb`, `skeleton_mage.glb`, `skeleton_warrior.glb`.
  - Tous partagent le squelette « Rig_Medium » : 41 os, noms au format `hand.r`, `handslot.r`, `head`…
  - Clips : `idle`, `run`, `jump`, `throw`, `cast`, `castLong`, `raise`, `block`, `dodge`, `hit`, `hitB`, `death`, `cheer` (+ `taunt` pour les squelettes).
  - Les accessoires (armes, chapeaux) sont des meshes fixés aux os et **tous visibles par défaut**. On masque ceux qu'on ne veut pas avec `getObjectByName(...).visible = false`.
- **`props.glb`** : tonneaux, tables, chaises, caisses, étagères, bouteilles, torches, bannières, murs.
- **Chargement** : les GLB utilisent `EXT_meshopt_compression`. Appeler `loader.setMeshoptDecoder(MeshoptDecoder)` avec `three/addons/libs/meshopt_decoder.module.js`. Voir `manifest.json` et `src/kaykit.js` dans le dépôt Bagarre.
- **Échelle** : un perso mesure environ 2,5 unités, une dalle ou un mur 4 × 4.

## Code à reprendre (JavaScript, accepté grâce à `allowJs`)
Tout vient de `C:\Users\Adem\repos\bagarre-de-taverne\`.
- `toon-kit.js` : `makeGradientMap`, `createToonMaterial`, `addOutline`, `ParticleBurstSystem`.
- `src/kaykit.js` : `loadKayKit`, `applyLook` (recoloration), `texturedToon`, `propNode`, `mergeSkinned`. Remplacer le décodage base64 par `loadAsync`.
- `src/core/events.js` (bus) et `src/core/loop.js` (`setSlow`, pour les ralentis).
- `src/input/parry.js`, `src/fx.js`, `src/audio.js`.
- `src/wow/onomato.js` + `onomato-font.json` (onomatopées 3D) et `src/wow/endscreen.js`.
- `src/props.js` (décor physique Rapier) et `src/ai/commentator.js`.
- `design-system-cartoon.md` : règles visuelles et interface.

## Packs à télécharger (accord d'Adem donné ; nom et taille montrés avant chaque téléchargement)
Destination : `public/assets/packs/<pack>/`.

| Pack | Pour | Source |
|---|---|---|
| KayKit Medieval Hexagon | Archipel | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 |
| Kenney Pirate Kit | Galion | https://kenney.nl/assets/pirate-kit |
| KayKit Restaurant Bits + Furniture Bits | Cuisine géante | https://kaylousberg.itch.io/restaurant-bits · https://kaylousberg.itch.io/furniture-bits |
| KayKit Character Animations | gestes tir / visée | https://kaylousberg.itch.io/kaykit-character-animations |
| KayKit Platformer | tremplins, bombes, plateformes | https://kaylousberg.itch.io/kaykit-platformer |

**À éviter** : les versions EXTRA payantes de KayKit, et les `.glb` de `Downloads\` (origine inconnue).
