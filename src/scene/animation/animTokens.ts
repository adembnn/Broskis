// Durées et amplitudes du corps des combattants (lot LATK2). Une seule source : l'animateur et
// l'orchestration des persos lisent ici, jamais de valeur en dur ailleurs. Secondes et radians sauf mention.
const DEG = Math.PI / 180;

export const ANIM = {
  /** Garde : 40 ms (< 50 ms exigés par le lot LATK, exception assumée au plancher de 80 ms du lot LAN). */
  fondu: { base: 0.12, action: 0.08, reaction: 0.05, garde: 0.04, retour: 0.2 },
  lancer: {
    /** Élan minimal avant le lâcher (s), même sur un tir sans charge. */
    elanMin: 0.14,
    /** Vitesse du geste après la charge (le bras part comme un ressort). */
    vitesseDetente: 1.35,
    /** Tremblement de la pose de charge à pleine puissance (rad). */
    tremblement: 2.2 * DEG,
    /** Torse qui s'enroule en arrière pendant la charge, puis se déroule (rad). */
    torsion: 32 * DEG,
    /** Buste rejeté en arrière à pleine charge (poids sur le pied arrière). */
    cambre: 10 * DEG,
    /** Fente vers l'avant au lâcher : le haut du corps suit l'objet (rad, ressort). */
    fente: 30 * DEG,
  },
  tir: { recul: 20 * DEG, reculBras: 38 * DEG, tenueApres: 0.35 },
  bouclier: {
    /** Coup planté : le buste plonge vers le sol à l'impact. */
    plongee: 26 * DEG,
    /** Objet brandi au-dessus de la tête pendant la charge. */
    leve: 55 * DEG,
  },
  parade: {
    /** Garde levée : fondu très court (< 50 ms exigés) ; buste voûté derrière la garde. */
    voute: 14 * DEG,
    recul: 14 * DEG,
    /** Contre de la parade parfaite : fente vers l'attaquant. */
    contre: 16 * DEG,
  },
  coup: {
    /** Fouet du torse dans le sens du recul, par point de % encaissé (rad), plafonné. */
    fouetMin: 16 * DEG, fouetParPct: 1.1 * DEG, fouetMax: 40 * DEG,
    /** Torsion du buste sur un coup (rad) : le corps tourne sur l'épaule touchée. */
    torsion: 24 * DEG,
    /** Vitesse d'éjection (m/s) au-delà de laquelle le perso part en vrille. */
    vrilleDes: 6,
    /** Tours par seconde de la vrille à 10 m/s. */
    vrilleTours: 1.6,
  },
  bord: { moulinetHz: 1.7, moulinet: 1, penche: 16 * DEG },
  accroche: { balancement: 7 * DEG },
  course: { /** Cadence maximale du cycle de course (×). */ cadenceMax: 2 },
  regard: { colonne: 0.3, poitrine: 0.4, tete: 0.3, max: 55 * DEG },
  respiration: { hz: 0.45, amplitude: 2.6 * DEG, /** transfert de poids à l'arrêt */ hanche: { hz: 0.33, amplitude: 5 * DEG } },
  /** Victoire : bras en V (rad depuis le bas), pompage, tête levée ; bonds du corps (m, Hz). */
  victoire: { pompe: 22 * DEG, hz: 2.2, tete: 18 * DEG, bond: 0.28, bondHz: 1.6 },
  ressort: { raideur: 220, amortissement: 16 },
} as const;
