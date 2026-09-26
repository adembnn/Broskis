// Réglages du lot LATK1 (l'arme, c'est l'objet) : tailles, durées, budgets. Les couleurs viennent de
// `weapon.palette` et de src/art/tokens.js ; seules restent ici des valeurs que la DA ne fournit pas
// (même principe que ../localTokens.ts).
export const WEAPON_FX = {
  // Objet en main pendant la charge (sa taille est la taille réelle, voir `physique`).
  // cote / coteMin (lot LE2E) : décalage à droite de la main = taille × cote + coteMin (m), hors de la silhouette.
  main: { tremble: 0.035, lueur: 0.3, pop: 160, cote: 0.45, coteMin: 0.15 },
  // Physique réelle → rendu : taille lisible bornée (m), tours/s ≈ tours / √masse, bornés.
  // Taille en jeu (DA « vinyle gonflé » §4) : base + pente × log10(L / ref), bornée ; les petits objets sont exagérés,
  // l'ordre des tailles est gardé (roi 0,68 m, tasse 0,74 m, chaise 1,12 m).
  physique: { tailleBase: 0.7, taillePente: 0.45, tailleRef: 0.1, tailleMin: 0.65, tailleMax: 1.45, tours: 1.6, toursMin: 0.35, toursMax: 4.5, tailleMaxApproche: 1.9 },
  // Épaisseur du sticker (banc LBENCH, cible d'Adem à 16h55 : 8 à 15 % de la largeur) : ×3 au plus ; tranche
  // jamais plus sombre que clarteMin.
  epaisseur: { min: 0.08, max: 3, largeur: 0.15, clarteMin: 0.24 },
  // Objet en vol : grossissement à l'approche du défenseur, taille des copies (split), tache d'encre au sol.
  vol: { approche: 1.4, fragment: 0.62, ombre: 1.1 },
  meche: { freqMin: 3, freqMax: 16 },
  // Explosion (grenade, trait explosive) et impact (throwable).
  boom: { flash: 0.55, bouffees: 9, bouffeesExplosive: 14, eclats: 16, anneauTenue: 260, trace: 0.55 },
  wham: { fissure: 1.1 },
  // Secousse : explosion, et impact d'objet de 0 (≈ 50 g) à 1 (≈ 20 kg) selon le poids.
  trauma: { boom: 0.45, boomExplosive: 0.65, impactLeger: 0.08, impactLourd: 0.6, pose: 0.18 },
  // Blaster : traçante, éclair de bouche, recul, douilles.
  tir: { longueur: 0.9, epaisseur: 0.11, eclair: 0.55, recul: 0.12, reculAngle: 0.5, douilles: 18 },
  // Bouclier : montée avec rebond, vacillement.
  mur: { montee: 380, depassement: 1.14, vacille: 0.12 },
  // Traits (couleur du soin : la DA n'a pas de vert, voir plan/rendus/LATK1.md).
  soin: '#7BD66A',
  // Matières sans couleur d'objet évidente (éclat de verre, sciure, pierre) : teintes neutres.
  matiere: { verre: '#DDF3FF', sciure: '#B07A45', pierre: '#8C8579', eau: '#8FD3F0' },
  budget: { additif: 180, normal: 120, eclats: 72, bouffees: 32 },
} as const;
