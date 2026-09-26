// Réglages de l'écran scindé et des caméras troisième personne verrouillées (lot RTVIEW, plan/PIVOT-TEMPS-REEL.md).
// Géométrie, durées et budgets techniques seulement : les couleurs viennent de src/art/tokens.js (séparateur = encre).
export const RTVIEW = {
  separateurPx: 4,        // trait d'encre entre les 2 vues (px CSS)
  calques: [1, 2],        // calque three.js vu seulement par la caméra de P1 / de P2 (api.onlyInView)
  ratioPixelsScinde: 1,   // budget du pivot : 2 vues à 60 i/s
  fovScinde: 55,          // FOV vertical d'une demi-vue (deg)
  fovSolo: 45,            // plein écran 16:9 : 55° y ferait un fish-eye (85° en largeur)
  distance: 6.5,          // m derrière son joueur, sur l'axe joueur -> adversaire
  hauteur: 3.2,           // m au-dessus de ses pieds
  lateral: 0.9,           // m à droite : vue par-dessus l'épaule, l'adversaire n'est pas caché
  visee: 0.62,            // point visé entre les 2 : 0 = son joueur, 1 = l'adversaire
  viseeHauteur: 0.4,      // m au-dessus du sol pour le point visé : bas, pour que les pieds restent au-dessus du HUD
  chute: { debut: -0.5, plein: -3, focus: 0.7 }, // m, m, 0..1 : sous le plateau, la caméra regarde SON joueur tomber
  axeMin: 0.8,            // m : plus près, on garde l'angle précédent (pas de toupie quand ils se superposent)
  lissage: 0.12,          // s : suivi de la position et de l'angle
  lissageY: 0.2,          // s : la hauteur suit plus mollement (sauts lisibles)
  sol: { cameraMin: -5, viseeMin: -9, cameraMax: 30 }, // m : ne plonge pas au fond du vide
  collision: { marge: 0.4, distanceMin: 2.2, rentre: 0.08, ressort: 0.35 }, // m, m, s, s
  cibleHauteur: 1.2,      // m : hauteur du torse visé par l'occlusion
  raycastHz: 15,          // occlusion + collision : rayons 15 fois par seconde, pas à chaque image
  occlusion: { opacite: 0.15, fonduMs: 200 },
  // Effets par vue (Smash) : jamais un plan partagé, la caméra reste sur SON joueur (règle d'Adem).
  koZoom: { fov: -12, focus: 0.75, retour: 0.35 },          // deg (négatif = zoom), 0..1, s
  ejection: { duree: 1.4, recul: 2.2, hauteur: 1.2, focus: 0.55, vitesseMin: 6 }, // s, m, m, 0..1, m/s
  impact: { fov: 4, retour: 0.22 },                         // deg (critique : juice.critique.fov), s
  attaquant: 0.25,        // part du trauma d'un coup ressentie dans la vue de l'attaquant
} as const;
