// Feuille de style des composants de chargement (lot LLOAD), direction « Vinyle » : tout vient de src/art/tokens.js,
// injectée une seule fois dans <head> (les composants vivent aussi au-dessus de #ui : rideau plein écran).
// Règle d'or : on n'anime QUE transform et opacity. Le navigateur les joue sur le fil du compositeur, donc le rideau et
// la forge continuent de bouger même quand le fil principal est occupé (décodage d'un GLB, compilation d'un shader).
// Entrée = claque, sortie = décolle, jamais de fondu seul (grammaire du lot LU) ; zéro glow, zéro dégradé.
import { durees, joueurs, palette, polices, ui } from '../../art/tokens.js';

const STYLE_ID = 'lload-style';

function css(): string {
  const sticker = `0 0 0 ${ui.marge}px ${ui.vinyle}, 0 0 0 ${ui.marge + ui.lisere}px ${ui.encre}, 0 ${ui.epaisseur}px 0 ${ui.marge + ui.lisere}px ${ui.encre}`;
  return `
.lload-curtain { position:fixed; inset:0; z-index:1000; pointer-events:none; overflow:hidden; }
.lload-curtain.is-closed, .lload-curtain.is-closing { pointer-events:auto; }
.lload-panel { position:absolute; top:-12%; bottom:-12%; width:64%; will-change:transform;
  transition:transform ${durees.glisse}ms ${ui.courbes.sortie}; }
.lload-panel.p1 { left:-10%; background:${joueurs.p1.principal}; transform:skewX(-10deg) translateX(-125%);
  border-right:${ui.epaisseur * 2}px solid ${ui.encre}; box-shadow:${ui.marge}px 0 0 ${ui.vinyle}; }
.lload-panel.p2 { right:-10%; background:${joueurs.p2.principal}; transform:skewX(-10deg) translateX(125%);
  border-left:${ui.epaisseur * 2}px solid ${ui.encre}; box-shadow:-${ui.marge}px 0 0 ${ui.vinyle}; }
.lload-curtain.is-closing .lload-panel, .lload-curtain.is-closed .lload-panel { transform:skewX(-10deg) translateX(0); }
.lload-curtain.is-opening .lload-panel { transition-timing-function:${ui.courbes.decolle}; }
.lload-center { position:absolute; inset:0; display:grid; place-content:center; justify-items:center; gap:28px; }
.lload-logo { font-family:${polices.titre}; font-size:${ui.taille.titre}px; line-height:1; color:${ui.vinyle};
  -webkit-text-stroke:${ui.contourTexte.grand * 2}px ${ui.encre}; paint-order:stroke fill; letter-spacing:.02em;
  transform:scale(1.6) rotate(-3deg); opacity:0; will-change:transform; }
.lload-curtain.is-closed .lload-logo { opacity:1; animation:lloadSlap ${durees.snap * 2}ms ${ui.courbes.claque} both,
  lloadWobble ${durees.dramatique * 1.4}ms ease-in-out ${durees.snap * 2}ms infinite alternate; }
.lload-curtain.is-opening .lload-logo { opacity:1; animation:lloadPeel ${durees.decolle}ms ${ui.courbes.decolle} forwards; }
@keyframes lloadSlap { from { transform:scale(1.6) rotate(-3deg); } to { transform:scale(1) rotate(-3deg); } }
@keyframes lloadWobble { from { transform:rotate(-3deg); } to { transform:rotate(2deg) scale(1.03); } }
@keyframes lloadPeel { to { transform:rotate(10deg) translateY(-60px) scale(.9); opacity:0; } }
.lload-pips { display:flex; gap:14px; opacity:0; }
.lload-curtain.is-closed .lload-pips { opacity:1; }
.lload-pip { width:18px; height:18px; border-radius:50%; border:${ui.trait}px solid ${ui.encre}; background:transparent;
  box-shadow:0 0 0 ${ui.lisere}px ${ui.vinyle}; transition:transform ${durees.snap}ms ${ui.courbes.claque}; }
.lload-pip.done { background:${ui.vinyle}; transform:scale(1.25); }

.lload-tip { max-width:min(760px, 86vw); padding:12px 22px; background:${ui.papier}; color:${ui.encre};
  border:${ui.trait}px solid ${ui.encre}; border-radius:${ui.rayon}px; box-shadow:${sticker};
  font:800 ${ui.taille.min}px/1.25 ${polices.texte}; text-align:center; transform:rotate(${ui.inclinaison * 0.5}deg); opacity:0; }
.lload-curtain.is-closed .lload-tip { opacity:1; }
.lload-tip b { font-family:${polices.titre}; font-weight:400; }
.lload-tip.swap { animation:lloadTipIn ${durees.glisse}ms ${ui.courbes.claque}; }
@keyframes lloadTipIn { from { transform:rotate(${ui.inclinaison * 0.5}deg) scale(1.15); } to { transform:rotate(${ui.inclinaison * 0.5}deg) scale(1); } }

.lload-caret::after { content:''; display:inline-block; width:.5em; height:.12em; margin-left:.08em; background:currentColor;
  vertical-align:baseline; animation:lloadCaret ${durees.alerte}ms steps(1) infinite; }
@keyframes lloadCaret { 50% { opacity:0; } }

.lload-forge { display:grid; justify-items:center; gap:14px; padding:6px 0 4px; }
.lload-forge-stage { position:relative; width:220px; height:220px; }
.lload-forge-photo { position:absolute; inset:0; border-radius:${ui.rayon}px; overflow:hidden; background:${ui.carton};
  border:${ui.trait}px solid ${ui.encre}; box-shadow:${sticker}; transform:rotate(-${ui.inclinaison}deg); }
.lload-forge-photo img { width:100%; height:100%; object-fit:cover; display:block; filter:grayscale(.35) contrast(1.05); }
.lload-forge-photo::after { content:''; position:absolute; inset:0; opacity:.16;
  background-image:radial-gradient(${ui.encre} 22%, transparent 24%); background-size:8px 8px; }
.lload-beam { position:absolute; left:-6%; right:-6%; top:0; height:18%; background:${palette.lumiere};
  border-top:${ui.trait}px solid ${ui.encre}; border-bottom:${ui.trait}px solid ${ui.encre}; opacity:.85; will-change:transform;
  animation:lloadBeam ${durees.dramatique * 1.2}ms ${ui.courbes.sortie} infinite; }
.lload-forge[data-step="stats"] .lload-beam, .lload-forge[data-step="sticker"] .lload-beam,
.lload-forge[data-step="sticker-failed"] .lload-beam { display:none; }
@keyframes lloadBeam { from { transform:translateY(-120%); } to { transform:translateY(560%); } }
.lload-forge-sticker { position:absolute; inset:-6%; width:112%; height:112%; object-fit:contain; opacity:0;
  filter:drop-shadow(0 0 0 ${ui.encre}); transform:scale(1.5) rotate(8deg); }
.lload-forge-sticker.on { opacity:1; transform:scale(1) rotate(-2deg);
  transition:transform ${durees.glisse}ms ${ui.courbes.claque}, opacity ${durees.snap}ms linear; }
.lload-forge[data-step="sticker"] .lload-forge-photo { transform:rotate(-${ui.inclinaison * 3}deg) translate(-18%, 10%) scale(.5);
  transition:transform ${durees.glisse}ms ${ui.courbes.sortie}; }
.lload-spark { position:absolute; width:6px; height:18px; border-radius:2px; background:${ui.alerte};
  border:2px solid ${ui.encre}; opacity:0; will-change:transform, opacity; }
.lload-forge:not([data-step="sticker"]):not([data-step="sticker-failed"]) .lload-spark { animation:lloadSpark ${durees.dramatique}ms ${ui.courbes.sortie} infinite; }
.lload-forge.burst .lload-spark { animation:lloadSpark ${durees.glisse * 2}ms ${ui.courbes.sortie} 1 both; }
@keyframes lloadSpark { 0% { opacity:0; transform:rotate(var(--a)) translateY(0) scaleY(.4); }
  12% { opacity:1; } 100% { opacity:0; transform:rotate(var(--a)) translateY(calc(var(--d) * -1)) scaleY(1); } }
.lload-forge-status { min-height:1.3em; margin:0; font-family:${polices.titre}; font-size:${Math.round(ui.taille.min * 0.85)}px; color:${ui.encre}; }
.lload-forge-name { min-height:1.1em; margin:0; font-family:${polices.titre}; font-size:${ui.taille.sousTitre}px; line-height:1.05;
  color:${ui.vinyle}; -webkit-text-stroke:${ui.contourTexte.petit}px ${ui.encre}; paint-order:stroke fill; }
.lload-steps { display:flex; gap:8px; margin:0; padding:0; list-style:none; font:800 13px/1 ${polices.texte}; }
.lload-steps li { padding:5px 10px; border:2px solid ${ui.encre}; border-radius:999px; background:transparent; color:${ui.encre}; opacity:.45; }
.lload-steps li.done { background:${ui.vinyle}; opacity:1; }
.lload-steps li.now { opacity:1; }

@media (prefers-reduced-motion: reduce) {
  .lload-panel { transition-duration:1ms; }
  .lload-logo, .lload-beam, .lload-spark, .lload-tip.swap, .lload-caret::after { animation:none !important; }
}
`;
}

export function injectLoadingStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css();
  document.head.append(style);
}
