// Feuille de style de la carte d'arme en direct (lot LWAIT-OBJ), injectée une fois. Valeurs : src/art/tokens.js et
// variables --b-* de theme.ts. Grammaire du lot LU : ce qui arrive claque (dépasse puis se pose), rien ne fond seul ;
// ce qui attend respire (squelettes, faisceau, chrono) : jamais une seconde où rien ne bouge.
import { durees, palette, ui } from '../art/tokens.js';

const STYLE_ID = 'lscan-live-style';

function css(): string {
  return `
.lscan { display:flex; flex-wrap:wrap; justify-content:center; align-items:flex-start; gap:22px; margin-top:4px; }
.lscan-card { width:min(300px, 76vw); flex:0 0 auto; }
.lscan-card .weapon-card-inner { transition:none; }
.lscan-side { flex:0 1 310px; min-width:250px; display:grid; gap:10px; align-content:start; text-align:left; }

.lscan-stage { isolation:isolate; }
.lscan-photo { position:absolute; left:10%; top:7%; width:80%; height:86%; object-fit:cover; display:block;
  border:3px solid var(--b-vinyle); outline:2px solid var(--b-encre); box-shadow:0 4px 0 var(--b-encre);
  transform:rotate(-${ui.inclinaison * 0.6}deg); transform-origin:100% 0;
  transition:transform ${durees.glisse * 2}ms ${ui.courbes.sortie}; }
.lscan-stage.has-sticker .lscan-photo { transform:translate(4%, -2%) scale(.36) rotate(${ui.inclinaison * 1.4}deg); filter:grayscale(1) contrast(1.12); z-index:2; }
.lscan-beam { position:absolute; left:6%; right:6%; top:0; height:14%; z-index:1; background:${palette.lumiere}; opacity:.75;
  border-top:${ui.trait}px solid var(--b-encre); border-bottom:${ui.trait}px solid var(--b-encre); will-change:transform;
  animation:lscanBeam ${durees.dramatique * 1.2}ms linear infinite; }
.lscan[data-state="drawing"] .lscan-beam, .lscan[data-state="slow"] .lscan-beam { height:5%; opacity:.9; animation-duration:${durees.dramatique * 2.6}ms; }
.lscan-stage.has-sticker .lscan-beam, .lscan[data-state="failed"] .lscan-beam { display:none; }
@keyframes lscanBeam { from { transform:translateY(-120%); } to { transform:translateY(720%); } }
.lscan-sticker { position:absolute; left:8%; top:6%; width:84%; height:88%; object-fit:contain; opacity:0; z-index:1; pointer-events:none; }
.lscan-stage.has-sticker .lscan-sticker { animation:lscanReveal ${durees.dramatique}ms ${ui.courbes.sortie} both; }
.lscan-stage:has(.lscan-3d.on) .lscan-sticker { visibility:hidden; }
@keyframes lscanReveal {
  0% { opacity:0; filter:blur(18px) saturate(.2); transform:scale(1.18); }
  35% { opacity:1; }
  100% { opacity:1; filter:blur(0) saturate(1); transform:scale(1); } }
.lscan-3d { position:absolute; inset:0; width:100%; height:100%; opacity:0; z-index:1; pointer-events:none; }
.lscan-3d.on { opacity:1; }

.lscan-skel { opacity:.45; animation:lscanBreathe ${durees.dramatique}ms ease-in-out infinite alternate; }
@keyframes lscanBreathe { from { opacity:.25; } to { opacity:.6; } }
.lscan-in { animation:lscanSlap ${durees.snap * 2}ms ${ui.courbes.claque} both; }
@keyframes lscanSlap { from { transform:scale(1.45); } to { transform:scale(1); } }
.lscan .pip.lscan-pop { animation:lscanPop ${durees.snap + 40}ms ease-out both; }
@keyframes lscanPop { from { transform:scale(0); } to { transform:scale(1); } }
.lscan .wc-category { display:inline-flex; min-width:3em; justify-content:center; }
.lscan-name { min-height:1.35em; }
.lscan-object:empty::before { content:'From: …'; opacity:.4; }
.lscan-why { min-height:2.4em; }
.lscan-stamp { display:inline-block; }
.lscan .lload-caret::after { content:''; display:inline-block; width:.5em; height:.12em; margin-left:.08em; background:currentColor;
  vertical-align:baseline; animation:lscanCaret ${durees.alerte}ms steps(1) infinite; }
@keyframes lscanCaret { 50% { opacity:0; } }

.lscan-status { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin:0; min-height:2.3em;
  font-family:var(--b-display); font-size:22px; line-height:1.1; color:var(--b-encre); }
.lscan-clock { flex:0 0 auto; font:800 14px/1 var(--b-body); font-variant-numeric:tabular-nums; color:var(--b-muted); }
.lscan[data-state="ready"] .lscan-clock { color:var(--b-encre); }
.lscan-steps { display:flex; flex-wrap:wrap; gap:6px; margin:0; padding:0; list-style:none; font:800 12px/1 var(--b-body); }
.lscan-steps li { padding:5px 10px; border:2px solid var(--b-encre); border-radius:999px; color:var(--b-encre); opacity:.4; }
.lscan-steps li.now { opacity:1; animation:lscanBreathe ${durees.alerte}ms ease-in-out infinite alternate; }
.lscan-steps li.done { opacity:1; background:var(--b-encre); color:var(--b-vinyle); }
.lscan-steps li.done[data-t]::after { content:' ' attr(data-t); opacity:.7; }
.lscan-steps li.fail { opacity:1; border-color:var(--b-danger); color:var(--b-danger); }
.lscan-phys { display:grid; grid-template-columns:auto 1fr; gap:3px 12px; margin:0; padding:10px 12px; background:var(--b-papier);
  border:2px solid var(--b-encre); border-radius:10px; }
.lscan-phys dt { font:800 12px/1.5 var(--b-body); text-transform:uppercase; letter-spacing:.04em; color:var(--b-muted); }
.lscan-phys dd { margin:0; font:400 17px/1.3 var(--b-display); color:var(--b-encre); transform-origin:0 50%; }
.lscan-fail { display:grid; gap:6px; padding:10px 12px; border:${ui.trait}px solid var(--b-danger); border-radius:10px; background:var(--b-papier); }
.lscan[data-state="slow"] .lscan-fail { border-color:var(--b-encre); }
.lscan-fail-text { margin:0; font:800 15px/1.3 var(--b-body); color:var(--b-encre); }
.lscan-fail .confirm-row, .lscan-actions { margin-top:0; justify-content:flex-start; flex-wrap:wrap; }
.lscan-actions .cta:disabled { opacity:.55; }
.lscan[data-state="ready"] .lscan-actions .cta { animation:lscanSlap ${durees.snap * 2}ms ${ui.courbes.claque} both; }
.lscan-pills { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0; }
.lscan-pills::before { content:'Wrong category?'; font:800 12px/1 var(--b-body); color:var(--b-muted); }
.lscan-pills .cat-pill { padding:4px 10px; border:2px solid var(--b-encre); border-radius:999px; background:var(--b-papier);
  color:var(--b-encre); font:800 12px/1 var(--b-body); text-transform:capitalize; cursor:pointer; }
.lscan-pills .cat-pill:hover, .lscan-pills .cat-pill:focus-visible { background:var(--b-vinyle); outline:none; }

@media (prefers-reduced-motion: reduce) {
  .lscan-beam, .lscan-skel, .lscan-in, .lscan .pip.lscan-pop, .lscan-steps li.now, .lscan-stage.has-sticker .lscan-sticker { animation-duration:1ms !important; }
}
`;
}

export function injectScanLiveStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css();
  document.head.append(style);
}
