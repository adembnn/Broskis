// Thème de l'interface (lot LU), direction « Vinyle » (figée par le lot DA le 26/09, voir src/art/tokens.js).
// Toute valeur vient de `ui` / `joueurs` / `polices` / `durees`. LOCAL_TOKENS ne garde que ce que tokens.js ne
// couvre pas encore (mesures précises données par le DA mais pas encore rangées dans un bucket `ui.*`, et les
// 4 couleurs de catégorie d'arme, absentes du token). À reporter au DA — voir le rendu de fin de lot.
import { durees, joueurs, polices, ui } from '../art/tokens.js';
import { CSS_TEXT } from './styles';

export const LOCAL_TOKENS = {
  // Pas de token de catégorie d'arme : 4 teintes plates dérivées de la palette vinyle, aucun néon.
  category: {
    blaster: '#D98A3D',
    grenade: '#7A8F4A',
    throwable: '#B04A32',
    shield: '#3E6E77',
  } as Record<string, string>,
  // Texte secondaire / erreur : tokens.js n'a que encre/vinyle/papier/carton/alerte, pas de gris atténué ni de rouge.
  color: {
    muted: '#6B5A45',
    danger: '#8A2C1C',
  },
  // Mesures données par le DA dans ses règles d'interface, pas encore rangées dans tokens.js `ui.*`.
  sticker: {
    cardBorder: 12, // bordure vinyle de la carte d'arme (le reste des stickers utilise ui.marge = 7)
    cardW: 320,
    cardH: 448, // 5:7, taille de présentation
    dot: 8, // pas de la trame de points de l'illustration
    portrait: 120, // portrait sticker de l'animateur
    photoTilt: 6, // inclinaison de la photo agrafée (deg)
    stampTilt: -12, // inclinaison du trait en tampon encreur (deg)
    tearAngle: 25, // un segment de PV arraché (deg)
    tearOffsetPx: 40, // …et son décalage (px)
    stripePx: 7, // largeur des rayures d'alerte en CSS (rendu.rayures est en mètres, pour la 3D)
  },
  // Nombre de dégâts flottant (juice, hors des 5 règles du DA) : taille/contour viennent de ui.taille.degats /
  // ui.contourTexte, seule la durée de vie de l'animation manque à tokens.js.
  floaterMs: 1300,
};

let fontsInjected = false;
/** `<link>` Google Fonts injecté par JS (en attendant `polices.imports` en @fontsource, à la fusion). Idempotent. */
export function injectGoogleFonts(): void {
  if (fontsInjected || document.getElementById('broskis-fonts')) return;
  fontsInjected = true;
  const pre1 = document.createElement('link');
  pre1.rel = 'preconnect';
  pre1.href = 'https://fonts.googleapis.com';
  const pre2 = document.createElement('link');
  pre2.rel = 'preconnect';
  pre2.href = 'https://fonts.gstatic.com';
  pre2.crossOrigin = '';
  const sheet = document.createElement('link');
  sheet.id = 'broskis-fonts';
  sheet.rel = 'stylesheet';
  sheet.href = 'https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800&display=swap';
  document.head.append(pre1, pre2, sheet);
}

let cssInjected = false;
/** Injecte la feuille de style (styles.ts) + les variables CSS dans `ctx.three.uiRoot` (jamais dans document.head). */
export function injectStyles(uiRoot: HTMLElement): void {
  if (cssInjected || uiRoot.querySelector('#broskis-ui-style')) return;
  cssInjected = true;
  const c = LOCAL_TOKENS.category;
  const s = LOCAL_TOKENS.sticker;
  const vars = `:root{
--b-encre:${ui.encre};--b-vinyle:${ui.vinyle};--b-papier:${ui.papier};--b-carton:${ui.carton};--b-alerte:${ui.alerte};
--b-voile:${ui.voile};--b-p1:${joueurs.p1.principal};--b-p1-fonce:${joueurs.p1.fonce};--b-p1-clair:${joueurs.p1.clair};
--b-p2:${joueurs.p2.principal};--b-p2-fonce:${joueurs.p2.fonce};--b-p2-clair:${joueurs.p2.clair};
--b-cat-blaster:${c.blaster};--b-cat-grenade:${c.grenade};--b-cat-throwable:${c.throwable};--b-cat-shield:${c.shield};
--b-muted:${LOCAL_TOKENS.color.muted};--b-danger:${LOCAL_TOKENS.color.danger};
--b-display:${polices.titre};--b-body:${polices.texte};
--b-trait:${ui.trait}px;--b-marge:${ui.marge}px;--b-lisere:${ui.lisere}px;--b-marge-lisere:${ui.marge + ui.lisere}px;
--b-epaisseur:${ui.epaisseur}px;--b-rayon:${ui.rayon}px;--b-inclinaison:${ui.inclinaison}deg;--b-recharge:${ui.recharge};
--b-taille-min:${ui.taille.min}px;--b-taille-sous-titre:${ui.taille.sousTitre}px;--b-taille-pv:${ui.taille.pv}px;
--b-taille-degats:${ui.taille.degats}px;--b-taille-bandeau:${ui.taille.bandeau}px;--b-taille-titre:${ui.taille.titre}px;
--b-contour-petit:${ui.contourTexte.petit}px;--b-contour-grand:${ui.contourTexte.grand}px;
--b-claque:${ui.courbes.claque};--b-sortie:${ui.courbes.sortie};--b-decolle:${ui.courbes.decolle};
--b-t-snap:${durees.snap}ms;--b-t-glisse:${durees.glisse}ms;--b-t-dramatique:${durees.dramatique}ms;
--b-t-decolle:${durees.decolle}ms;--b-t-bandeau:${durees.bandeau}ms;--b-t-fantome:${durees.fantome}ms;
--b-t-vidange:${durees.vidange}ms;--b-t-segment:${durees.segment}ms;--b-t-pastille:${durees.pastille}ms;
--b-t-alerte:${durees.alerte}ms;--b-t-ko:${durees.ko}ms;
--b-sticker-card-border:${s.cardBorder}px;--b-card-w:${s.cardW}px;--b-card-h:${s.cardH}px;--b-dot:${s.dot}px;
--b-portrait:${s.portrait}px;--b-photo-tilt:${s.photoTilt}deg;--b-stamp-tilt:${s.stampTilt}deg;
--b-tear-angle:${s.tearAngle}deg;--b-tear-offset:${s.tearOffsetPx}px;--b-stripe:${s.stripePx}px;
--b-t-floater:${LOCAL_TOKENS.floaterMs}ms;
--b-sticker-shadow:0 0 0 var(--b-marge) var(--b-vinyle), 0 0 0 var(--b-marge-lisere) var(--b-encre), 0 var(--b-epaisseur) 0 var(--b-marge-lisere) var(--b-encre);
}`;
  const style = document.createElement('style');
  style.id = 'broskis-ui-style';
  style.textContent = vars + CSS_TEXT;
  uiRoot.prepend(style);
}
