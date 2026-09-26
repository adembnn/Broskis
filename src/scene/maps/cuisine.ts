// Cuisine géante : combattants minuscules sur un plan de travail (KayKit Restaurant Bits, échelle x10).
// Données pures (aucun THREE/Rapier ici) : engine.ts interprète ce MapDef.
// Décision : plutôt que d'aligner deux modèles différents (comptoir + comptoir-évier, hauteurs mesurées
// différentes -> marche visible), on réutilise DEUX FOIS le même comptoir plat (hauteur fiable, mesurée) et
// on laisse un vrai vide entre les deux : c'est "l'évier" (aucun collider dans cet interstice), aussi lisible
// que le bord du plan et sans hypothèse de géométrie supplémentaire.
import type { Vec3 } from '../../core/types';
import { FURNITURE, RESTAURANT } from './assets';
import { LOCAL_TOKENS } from './tokens';
import type { MapDef, PropSpec } from './types';

export function buildCuisineDef(): MapDef {
  const scale = LOCAL_TOKENS.cuisine.counterScale;
  // Comptoir (bounding brute mesurée kitchencounter_straight_A_backsplash : x:±1 y:[0,1] z:[-1,1.042], base au sol).
  // Convention commune aux 3 maps : la surface où l'on marche est à y=0 -> on décale le modèle (base-pivoté)
  // vers le bas de sa hauteur totale mise à l'échelle.
  const counterTopRaw = 1.0;
  const half: Vec3 = [1 * scale, 0.5 * scale, 1 * scale];
  const gap = 2.2; // largeur du "vide de l'évier" entre les deux modules
  const cxA = -(half[0] + gap / 2);
  const cxB = half[0] + gap / 2;

  const props: PropSpec[] = [
    // Grille-pain tremplin (procédural : aucun toaster dans les packs) : marcher dessus bondit à la verticale.
    {
      id: 'toaster',
      kind: 'launcher',
      pos: [cxA - half[0] * 0.4, 0, half[2] * 0.5],
      build: { kind: 'procedural', shape: 'toaster' },
      collider: { type: 'box', hx: 1.4, hy: 1.1, hz: 1.0, offset: [0, 1.1, 0] },
      triggerRadius: 2.4,
      launchTargets: [[cxA - half[0] * 0.4, 0.05, half[2] * 0.5]],
      launchDuration: 0.55,
      launchArcHeight: 6,
    },
    // Rouleau à pâtisserie (procédural, couché, x10 comme le reste du décor) : un coup le fait rouler
    // (glisse + tourne sur son axe long, cf. `lieOnSide`).
    {
      id: 'rolling_pin',
      kind: 'knockable',
      pos: [cxA + half[0] * 0.3, 0, -half[2] * 0.3],
      yaw: Math.PI / 5,
      build: { kind: 'procedural', shape: 'rollingPin' },
      collider: { type: 'cylinder', radius: 0.45, halfHeight: 2.0, offset: [0, 0.45, 0], rollAxisZ: true },
      triggerRadius: 2.2,
      impulse: 9,
      lieOnSide: true,
    },
    // Petite touche de vie sur le comptoir B (purement décorative, silhouette de cuisine).
    {
      id: 'crate_lettuce',
      kind: 'decor',
      pos: [cxB - half[0] * 0.5, 0, half[2] * 0.4],
      scale: scale * 0.5,
      build: { kind: 'model', url: RESTAURANT.crateLettuce },
      collider: { type: 'box', hx: 0.4, hy: 0.35, hz: 0.4, offset: [0, 0.35, 0] },
    },
    {
      id: 'chair_deco',
      kind: 'decor',
      pos: [cxB + half[0] * 0.55, 0, -half[2] * 0.5],
      scale: scale * 0.5,
      build: { kind: 'model', url: FURNITURE.chairA },
      collider: { type: 'box', hx: 0.3, hy: 0.5, hz: 0.3, offset: [0, 0.5, 0] },
    },
  ];

  return {
    id: 'cuisine',
    voidY: -5,
    spawns: [
      { pos: [cxA - half[0] * 0.6, 0.05, 0], yawDeg: 90 },
      { pos: [cxB + half[0] * 0.6, 0.05, 0], yawDeg: -90 },
    ],
    // Aucun emplacement au centre (x=0) : c'est le vide de l'évier, pas une surface -> la caisse y flotterait.
    crateSpots: [
      [cxA, 0.4, half[2] * 0.6],
      [cxB, 0.4, -half[2] * 0.6],
      [cxB, 0.4, half[2] * 0.6],
    ],
    tiles: [],
    ground: [
      { id: 'counterA', build: { kind: 'model', url: RESTAURANT.counterStraight }, pos: [cxA, -counterTopRaw * scale, 0], scale, collider: null },
      { id: 'counterB', build: { kind: 'model', url: RESTAURANT.counterStraight }, pos: [cxB, -counterTopRaw * scale, 0], scale, collider: null },
    ],
    extraColliders: [
      { id: 'counterA_col', pos: [cxA, -half[1], 0], collider: { type: 'box', hx: half[0], hy: half[1], hz: half[2] } },
      { id: 'counterB_col', pos: [cxB, -half[1], 0], collider: { type: 'box', hx: half[0], hy: half[1], hz: half[2] } },
    ],
    props,
    periodicEvent: { kind: 'sponge', everyTurns: 3 },
  };
}
