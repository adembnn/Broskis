// TOKENS — la seule source de vérité visuelle du jeu. À remplir par l'agent directeur-artistique
// une fois la direction choisie. Aucune couleur, taille, durée ou intensité ne doit être écrite ailleurs.
export const palette = {
  fond: '#000000',      // TODO rôle : fond, ambiance
  matiere: '#000000',   // TODO rôle : matière principale du décor
  lumiere: '#000000',   // TODO rôle : source de lumière
  joueur: '#000000',    // TODO rôle : ce que fait le joueur
  danger: '#000000',    // TODO rôle : menace, adversaire
};
export const rendu = { exposition: 1.0, toneMapping: 'AgX', environnement: 0.4, bloom: { force: 0.45, rayon: 0.3, seuil: 0.85 } };
export const polices = { titre: 'TODO', texte: 'TODO' }; // Google Fonts, 2 max, avec du caractère
export const durees = { snap: 120, glisse: 280, dramatique: 900 }; // ms
export const juice = {
  // valeurs de départ : table du skill game-feel
  toucher: { hitstop: 70, trauma: 0.4 },
  critique: { hitstop: 90, trauma: 0.7, fov: 8 },
  parade: { hitstop: 50, trauma: 0.2 },
};
