// Réglages du lot LATK1 (l'arme, c'est l'objet) : tailles, durées, budgets. Les couleurs viennent de
// `weapon.palette` et de src/art/tokens.js ; seules restent ici des valeurs que la DA ne fournit pas
// (même principe que ../localTokens.ts).
export const WEAPON_FX = {
  // Objet en main (≈ 0,5 m, lot LATK) et pendant la charge.
  main: { taille: 0.5, tremble: 0.035, lueur: 0.75, pop: 160, relache: 350 },
  // Objet en vol : taille, rotation (tours/s), grossissement à l'approche du défenseur (vue caméra).
  vol: {
    grenade: { taille: 0.55, tours: 1.4 },
    throwable: { taille: 0.6, tours: 3.2 },
    fragment: 0.62, // trait split : chaque morceau
    approche: 1.45, // échelle max quand l'objet arrive sur la caméra du défenseur
    fleche: 0.07, // bombé du lancer droit (fraction de la distance, max 0,9 m)
    ombre: 0.55, // diamètre de la tache d'encre sous l'objet (rendu.ombres.tache = opacité)
  },
  // Grenade : rebonds avant l'explosion (part du vol) et mèche qui clignote.
  rebonds: { normal: [0.3], bouncy: [0.95, 0.5, 0.22], distance: 0.45, distanceBouncy: 1.3, partNormal: 0.9, partBouncy: 0.74 },
  meche: { freqMin: 3, freqMax: 16 },
  // Explosion (grenade, trait explosive) et impact (throwable).
  boom: { flash: 0.55, bouffees: 9, bouffeesExplosive: 14, eclats: 16, anneauTenue: 260, trace: 0.55 },
  wham: { poussiere: 1.7, poussiereHeavy: 2.6, fissure: 1.1 },
  trauma: { boom: 0.45, boomExplosive: 0.65, wham: 0.32, whamHeavy: 0.55, pose: 0.18 },
  // Blaster : traçante, éclair de bouche, recul, douilles.
  tir: { longueur: 0.9, epaisseur: 0.11, eclair: 0.55, recul: 0.12, reculAngle: 0.5, douilles: 18 },
  // Bouclier : montée avec rebond, vacillement.
  mur: { montee: 380, depassement: 1.14, vacille: 0.12 },
  // Traits (couleur du soin : la DA n'a pas de vert, voir plan/rendus/LATK1.md).
  soin: '#7BD66A',
  budget: { additif: 180, normal: 120, eclats: 64, bouffees: 32 },
} as const;
