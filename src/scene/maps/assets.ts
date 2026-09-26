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
  pebbleA: '/assets/packs/hexagon/decoration/nature/rock_single_A.gltf',
  pebbleC: '/assets/packs/hexagon/decoration/nature/rock_single_C.gltf',
  pebbleE: '/assets/packs/hexagon/decoration/nature/rock_single_E.gltf',
  rubble: '/assets/packs/hexagon/decoration/props/resource_stone.gltf',
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
  // LMAP4 : habillage du pont (sans collider) et herbes des dalles de l'Archipel.
  cannonBall: '/assets/packs/pirate/cannon-ball.glb',
  bottle: '/assets/packs/pirate/bottle.glb',
  chest: '/assets/packs/pirate/chest.glb',
  grassPlant: '/assets/packs/pirate/grass-plant.glb',
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
  stewPot: '/assets/packs/restaurant/pot_A_stew.gltf',
  ketchup: '/assets/packs/restaurant/ketchup.gltf',
  mustard: '/assets/packs/restaurant/mustard.gltf',
  // LMAP4 : miettes et vaisselle posées à plat sur le plan de travail (sans collider).
  plate: '/assets/packs/restaurant/plate.gltf',
  tomatoSlice: '/assets/packs/restaurant/food_ingredient_tomato_slice.gltf',
  carrotPieces: '/assets/packs/restaurant/food_ingredient_carrot_pieces.gltf',
  cheeseChopped: '/assets/packs/restaurant/food_ingredient_cheese_chopped.gltf',
};

export const FURNITURE = {
  shelf: '/assets/packs/furniture/shelf_A_big.gltf',
};

/** Kit d'arène (lot LKIT, public/assets/arena-kit/kit.json) : pièces modélisées dans Blender, couleurs et
 *  occlusion cuites dans les sommets. Ancre = centre du dessus marchable (plateformes) ou base au sol (couverts). */
const KIT_DIR = '/assets/arena-kit/';
export const KIT = {
  socleHex4: `${KIT_DIR}socle_hex_4.glb`,
  plateauCuisine: `${KIT_DIR}plateau_cuisine.glb`,
  plateformePierreL: `${KIT_DIR}plateforme_pierre_L.glb`,
  radeauL: `${KIT_DIR}radeau_L.glb`,
  plancheL: `${KIT_DIR}planche_L.glb`,
  caisse: `${KIT_DIR}caisse.glb`,
  tonneau: `${KIT_DIR}tonneau.glb`,
  muret: `${KIT_DIR}muret_ruine.glb`,
  // LMAP4 : plateformes M/S (routes aériennes), couverts à hauteur de poitrine (1,2-1,5 m).
  plateformePierreM: `${KIT_DIR}plateforme_pierre_M.glb`,
  plateformePierreS: `${KIT_DIR}plateforme_pierre_S.glb`,
  radeauM: `${KIT_DIR}radeau_M.glb`,
  radeauS: `${KIT_DIR}radeau_S.glb`,
  plancheM: `${KIT_DIR}planche_M.glb`,
  plancheS: `${KIT_DIR}planche_S.glb`,
  muretBas: `${KIT_DIR}muret_bas.glb`,
  rocherCouvert: `${KIT_DIR}rocher_couvert.glb`,
  caissesPile: `${KIT_DIR}caisses_pile.glb`,
  tasse: `${KIT_DIR}tasse.glb`,
  sucre: `${KIT_DIR}sucre.glb`,
};

/** props.glb (KayKit tavern, meshopt) : tonneaux déjà à l'échelle des persos. */
export const PROPS = '/assets/props/props.glb';
