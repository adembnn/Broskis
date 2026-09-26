// TOKENS : seule source de vérité visuelle de Broskis. Direction « Vinyle », figée le 26/09.
// Hiérarchie du trait : rien = décor · encre = objet interactif · encre + vinyle = en jeu
// (combattants, armes, projectiles, messages). Aucune valeur visuelle ne s'écrit ailleurs.

const ENCRE = '#2B1D14';  // remplace le noir partout : contours, texte, ombres dures
const VINYLE = '#F0E9DC'; // marge blanche des stickers ; luminance linéaire 0,82, sous le seuil de bloom
const PAPIER = '#F3E3C3'; // face imprimée des panneaux et des cartes
const CARTON = '#C49A6C'; // kraft : fond des menus, tranche des stickers
const ALERTE = '#F7C325'; // danger uniquement, toujours rayé d'encre
const P1 = '#E0452B';     // coin rouge
const P2 = '#2F7DE1';     // coin bleu

export const palette = {
  fond: CARTON,       // menus : la planche de kraft où l'on colle les stickers
  matiere: PAPIER,    // panneaux, cartes
  lumiere: '#FFF6DA', // éclat : cœur des flashs et étincelles, seul à franchir le bloom (en émissif)
  joueur: VINYLE,     // tout ce qui est en jeu porte la marge vinyle
  danger: ALERTE,
};

export const rendu = {
  exposition: 1.1,     // slightly higher for brightness
  toneMapping: 'ACES', // AgX mesuré : -35 à -41 % de chroma sur J1/J2, vinyle grisé (L* 93 -> 79)
  environnement: 0.3,  // RoomEnvironment : n'agit que sur Standard/Lambert/Phong, jamais sur le toon
  bloom: { force: 0.4, rayon: 0.3, seuil: 0.85 }, // seuls émissifs et VFX additifs le franchissent
  pixelRatioMax: 1.5,
  paliers: { heros: 3, decor: 2, plancher: 0.35 }, // rampe toon ; le palier sombre garde la teinte
  contour: {
    encre: ENCRE,
    vinyle: VINYLE,
    // unités monde (perso KayKit ≈ 2,5) : trait d'encre, marge vinyle, liseré d'encre extérieur
    epaisseur: { encre: 0.015, vinyle: 0.015, lisere: 0.015, prop: 0.035, sticker: 0.03 },
    // par combattant, du plus loin au plus proche (+rang) : liseré, vinyle (depthWrite false), corps + encre
    ordre: { lisere: 1, vinyle: 2, perso: 3, rang: 3 },
  },
  sticker: { profondeur: 0.06, bord: 0.025, tranche: CARTON }, // bord = 2,5 % de la taille du sticker
  ruban: { largeur: 0.25, bord: 0.05 },       // anneau de déplacement = ruban adhésif couleur joueur, bord vinyle
  traces: { max: 16, taille: 2.0, alea: 20 }, // onomatopées collées au décor (m, rotation aléatoire en deg)
  rayures: { largeur: 0.3, angle: 45 },       // zones d'alerte : bandes ALERTE / ENCRE (m, deg)
  ombres: { taille: 2048, biais: -0.0005, biaisNormal: 0.01, tache: 0.35 }, // ombre plus nette
};

export const polices = {
  titre: '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif', // 400 seulement
  texte: '"Nunito", "Segoe UI", system-ui, sans-serif',                      // 700 et 800
  imports: ['@fontsource/lilita-one/latin-400.css', '@fontsource/nunito/latin-700.css', '@fontsource/nunito/latin-800.css'],
};

export const durees = { // ms
  snap: 120,          // claque d'un sticker, chiffre qui saute, anticipation
  glisse: 280,        // carte qui se retourne, panneau qui entre
  dramatique: 900,    // lumière de victoire, révélation de map
  decolle: 180,       // un sticker qui sort se décolle, jamais un simple fondu
  bandeau: 1000,      // « P2 — YOUR TURN! » tenu à l'écran
  camera: 700,        // bascule vers la vue du défenseur au lâcher (validée par Adem)
  fantome: 300,       // la barre fantôme attend...
  vidange: 400,       // ...puis rattrape la vraie valeur
  segment: 200,       // un segment de PV perdu s'arrache
  pastille: 60,       // remplissage des pastilles de stats, une par une
  mot: 90,            // sous-titre mot à mot quand il n'y a pas d'audio
  lectureParMot: 280, // tenue d'une réplique = max(tenueMin, mots × lectureParMot)
  tenueMin: 1800,
  alerte: 600,        // période du clignotement d'alerte
  ko: 1600,           // ralenti du KO
};

export const juice = { // table du skill game-feel (hitstop en ms, trauma 0 à 1) + action, parfaite, victoire
  action: { hitstop: 0, trauma: 0.1, anticipation: 120, squash: 0.8, etirement: 1.25 },    // tir, lancer, saut
  toucher: { hitstop: 70, trauma: 0.4, flash: 1, squash: 0.7, particules: 20, chiffre: 1.4 }, // flash : images en émissif palette.lumiere
  critique: { hitstop: 90, trauma: 0.7, fov: 8, ralenti: 0.3, ralentiMs: 300, particules: 50 },
  parade: { hitstop: 50, trauma: 0.2, onde: 3 },                                  // bonne parade (≤ 220 ms)
  parfaite: { hitstop: 120, trauma: 0.3, onde: 4.5, ralenti: 0.25, ralentiMs: 300 }, // ≤ 90 ms : renvoi au ralenti (lot LK)
  bascule: { ralenti: 0.25, ms: 700 }, // ralenti UNIQUEMENT pendant la bascule vers le défenseur ; jamais juste avant l'impact (lot LK)
  victoire: { hitstop: 250, trauma: 0.5, ralenti: 0.25, ralentiMs: 1600, orbite: 0.5, lumiere: 900 }, // fond -> clair du gagnant
  secousse: { decroissance: 1.4, decalageMax: 0.35, roulisMax: 3 }, // trauma², jamais permanente (m, deg)
  son: { variation: 0.05 },                                         // hauteur ±5 % à chaque lecture
};

export const joueurs = {
  // principal : tenue (≥ 30 % de la silhouette), ruban, bandeau, PV · fonce : texte sur papier ou vinyle
  // clair : fond des cartes, fond de victoire
  p1: { principal: P1, fonce: '#A32A17', clair: '#F5B4A4' }, // coin rouge, chaud
  p2: { principal: P2, fonce: '#1C4F99', clair: '#B2CCF4' }, // coin bleu, froid
};

export const ui = {
  encre: ENCRE, vinyle: VINYLE, papier: PAPIER, carton: CARTON, alerte: ALERTE,
  voile: 'rgba(43, 29, 20, 0.55)', // derrière les écrans modaux
  // anatomie d'un sticker (px) : bordure d'encre, marge vinyle, liseré, ombre dure sans flou, coins
  trait: 3, marge: 7, lisere: 2, epaisseur: 6, rayon: 14,
  inclinaison: 3, // rotation max d'un sticker posé (deg), signe alterné
  recharge: 0.55, // opacité du secteur d'encre de recharge
  taille: { min: 28, sousTitre: 34, pv: 44, degats: 64, bandeau: 76, titre: 120 }, // px, projecteur
  contourTexte: { petit: 5, grand: 8 }, // -webkit-text-stroke en encre (px), avec paint-order: stroke fill
  courbes: {
    claque: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // dépasse puis se pose
    sortie: 'cubic-bezier(0.2, 0.7, 0.2, 1)',    // décélère
    decolle: 'cubic-bezier(0.5, 0, 0.75, 0)',    // accélère en partant
  },
};

// Joueurs face à face sur l'axe Z, lumière principale de côté (X) : les deux vues épaule se valent.
// Distances en m (arène ≈ 24 m). palette = 5 rôles du décor ; joueurs, alerte, encre, vinyle sont communs.
export const maps = {
  archipel: { // clé claire : fond L*75, sol L*52
    palette: {
      fond: '#E2AE88',    // brume d'abricot : horizon, vide, brouillard
      sol: '#7F8A5E',     // dessus des dalles (sauge)
      matiere: '#6A5A50', // roche : flancs et dessous des îles
      accent: '#B39561',  // paille et bois : catapulte, tonneaux, toits
      lumiere: '#FF9A4A', // braseros : seule source chaude, a droit au bloom
    },
    ciel: { haut: '#C98B6E', horizon: '#E2AE88', bas: '#B8806A' }, // le vide fonce vers le bas
    brouillard: { couleur: '#E2AE88', debut: 60, fin: 150 }, // très repoussé
    hemi: { ciel: '#8AA5D6', sol: '#281F1A', intensite: 0.5 }, // ombre très froide et sombre
    principale: { type: 'directionnelle', couleur: '#FFF5E0', intensite: 3.5, position: [-14, 12, 5] }, // soleil puissant
    pratique: { couleur: '#FF9A4A', intensite: 6, portee: 9, decroissance: 1.6, vacillement: 0.08 },
    decor: { saturation: 0.6, teinte: '#FFFFFF' }, // plus saturé
    corbeaux: { nombre: 5, couleur: ENCRE, envol: 1400 },
  },
  galion: { // clé sombre : fond L*30, pont L*56
    palette: {
      fond: '#3C4A45',    // ciel d'orage vert-de-gris : fond et brouillard
      sol: '#A58C6C',     // pont délavé
      matiere: '#5A4535', // coque, bastingage, mâts
      accent: '#3A5752',  // mer de théâtre : couronnes de vagues découpées
      lumiere: '#FFB45A', // lanternes : seule source chaude, a droit au bloom
    },
    ciel: { haut: '#2B3532', horizon: '#3C4A45', bas: '#2E4642' },
    brouillard: { couleur: '#2B3532', debut: 50, fin: 120 }, // très repoussé
    hemi: { ciel: '#50758A', sol: '#1A1510', intensite: 0.6 }, // froid fort
    principale: { type: 'directionnelle', couleur: '#FFDCA8', intensite: 4.0, position: [-5, 14, 4] }, // très chaud et fort
    pratique: { couleur: '#FFB45A', intensite: 5, portee: 10, decroissance: 1.6, vacillement: 0.08 },
    decor: { saturation: 0.6, teinte: '#FFFFFF' },
    mer: { ecume: '#A7B9B1', couronnes: [16, 24, 36], vitesses: [0.05, -0.035, 0.02], houle: 0.35 },
    vague: { hauteur: 8 },
    eclair: { fond: '#8FA39B', facteur: 2.5, duree: 80, flashs: 2, intervalle: [9000, 16000] },
  },
  cuisine: { // demi-teinte : fond L*36, billot au soleil L*61, à l'ombre L*29
    palette: {
      fond: '#5A524D',    // la cuisine dans l'ombre (taupe) : fond et brouillard
      sol: '#B39570',     // billot de hêtre
      matiere: '#8A918F', // inox et faïence : grille-pain, évier, bocaux
      accent: '#A39B66',  // éponge et étiquettes (olive)
      lumiere: '#FF8A3D', // résistances du grille-pain armé : seule source chaude, a droit au bloom
    },
    ciel: { haut: '#4A4440', horizon: '#5A524D', bas: '#3F3A37' }, 
    brouillard: { couleur: '#3F3A37', debut: 40, fin: 100 },
    hemi: { ciel: '#80A0C0', sol: '#201815', intensite: 0.6 },
    principale: { type: 'spot', couleur: '#FFF5E0', intensite: 4.5, position: [-12, 16, -3], angle: 0.65, penombre: 0.1, decroissance: 0 },
    pratique: { couleur: '#FF8A3D', intensite: 4, portee: 6, decroissance: 1.6, vacillement: 0.08 },
    decor: { saturation: 0.6, teinte: '#FFFFFF' },
    cafe: { couleur: ENCRE, opacite: 0.35, rayon: 5.5, epaisseur: 0.6 },
  },
};
