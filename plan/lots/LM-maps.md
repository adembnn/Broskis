# Lot LM · Maps et décor dynamique
Responsable : Adem (sous-agent Sonnet) · Coût : élevé · Dépend de : L0, packs téléchargés (`plan/ASSETS.md`)

## Tes chemins
`src/scene/maps/**`, `src/gameplay/map-events/**`, `public/assets/packs/**`

## Principes (recherche game design)
- **Moteur commun** : chaque map est un JSON (tuiles, props, points d'apparition, emplacements de caisse, événement).
  - Rapier : les tuiles sont fixes, les props dynamiques. KO sous y = −5.
- Une map se lit en 3 s. Le vide est bien visible. Le décor est désaturé.
- **Rien sans préavis** : `map:warn` un tour avant, marquage au sol + compteur, puis `map:event`.
- **Le décor se déclenche au tir** (`prop:triggered`) et rapporte plus qu'un tir direct.
- Au plus 3 objets physiques réveillés par tir, une résolution de 3 s maximum, une graine fixe en `?demo=1`.

## Sortie attendue, dans l'ordre
1. **Archipel qui s'effrite** (Medieval Hexagon), environ 1 h :
   - des îles hexagonales ;
   - des dalles fêlées qui tombent au 2e coup de grenade (le corps passe de fixe à dynamique) ;
   - des tonneaux de poudre ;
   - une catapulte (monter dessus = bond vers l'île voisine ; tirer dessus = éjection) ;
   - l'anneau extérieur rougit, puis tombe tous les 2 tours.
2. **Galion dans la tempête** (Kenney Pirate Kit), environ 2 h :
   - un canon qui tire sur un axe peint au sol quand on tire dessus ;
   - des barils ;
   - une vergue qui balaie le pont quand on touche son cordage ;
   - tous les 3 tours, une vague annoncée, puis gîte de 12° (caméra et mer inclinées + poussée latérale, le collider reste fixe) ;
   - l'océan tout autour.
3. **Cuisine géante** (Restaurant + Furniture Bits ×10), environ 2 h :
   - un grille-pain tremplin ;
   - un rouleau à pâtisserie qui roule ;
   - l'évier et le bord du plan comme sortie ;
   - une éponge géante qui balaie une bande annoncée par son ombre.
4. **Mort subite** (tour 7) : l'arène rétrécit à chaque tour, et une version géante d'un objet scanné (sticker ×8) tombe, annoncée par son ombre.

## Contrôles
`npm run build`. Captures `--out captures/LM` de chaque map. Moins de 150 appels de dessin. Un événement déclenché via `gameHooks`.

## Commit
Tes fichiers seulement (les packs lourds peuvent être compressés), puis pull, push, et mise à jour de `plan/SUIVI.md`.
