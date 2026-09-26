// Chemins des assets utilisés par les maps. Tous présents dans public/assets/ (aucun téléchargement ici).
// Pour brancher le kit d'arène (lot LKIT, public/assets/arena-kit/) : remplacer la pièce voulue dans la
// fonction de construction de la map (plateau(), plateformes(), couverts(), fond()), rien d'autre.
export const HEX = {
  grass: '/assets/packs/hexagon/tiles/base/hex_grass.gltf',
  grassBottom: '/assets/packs/hexagon/tiles/base/hex_grass_bottom.gltf',
  catapultTower: '/assets/packs/hexagon/buildings/blue/building_tower_catapult_blue.gltf',
  catapultProjectile: '/assets/packs/hexagon/buildings/neutral/projectile_catapult.gltf',
  cloudBig: '/assets/packs/hexagon/decoration/nature/cloud_big.gltf',
  cloudSmall: '/assets/packs/hexagon/decoration/nature/cloud_small.gltf',
  mountainTrees: '/assets/packs/hexagon/decoration/nature/mountain_A_grass_trees.gltf',
  mountainB: '/assets/packs/hexagon/decoration/nature/mountain_B_grass_trees.gltf',
  hillsTrees: '/assets/packs/hexagon/decoration/nature/hills_A_trees.gltf',
  ruin: '/assets/packs/hexagon/buildings/neutral/building_destroyed.gltf',
};

export const PIRATE = {
  shipLarge: '/assets/packs/pirate/ship-pirate-large.glb',
  shipMedium: '/assets/packs/pirate/ship-pirate-medium.glb',
  shipGhost: '/assets/packs/pirate/ship-ghost.glb',
  mast: '/assets/packs/pirate/mast.glb',
  cannon: '/assets/packs/pirate/cannon.glb',
  barrel: '/assets/packs/pirate/barrel.glb',
  crate: '/assets/packs/pirate/crate.glb',
  platformPlanks: '/assets/packs/pirate/platform-planks.glb',
  rocks: '/assets/packs/pirate/rocks-a.glb',
};

export const RESTAURANT = {
  counter: '/assets/packs/restaurant/kitchencounter_straight_A.gltf',
  cuttingBoard: '/assets/packs/restaurant/cuttingboard.gltf',
  jar: '/assets/packs/restaurant/jar_A_large.gltf',
  fridge: '/assets/packs/restaurant/fridge_A.gltf',
  oven: '/assets/packs/restaurant/oven.gltf',
  cabinet: '/assets/packs/restaurant/kitchencabinet.gltf',
  floor: '/assets/packs/restaurant/floor_kitchen.gltf',
  wallWindow: '/assets/packs/restaurant/wall_window_open.gltf',
  pot: '/assets/packs/restaurant/pot_A.gltf',
};

export const FURNITURE = {
  shelf: '/assets/packs/furniture/shelf_A_big.gltf',
};

/** props.glb (KayKit tavern, meshopt) : tonneaux déjà à l'échelle des persos. */
export const PROPS = '/assets/props/props.glb';
