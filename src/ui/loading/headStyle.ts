// Feuille de style de l'écran d'attente de la tête (lot LWAIT), direction « Vinyle » : tout vient de src/art/tokens.js.
// Mêmes règles que style.ts (LLOAD) : on n'anime que transform, opacity (et le clip du dévoilement), zéro glow.
import { durees, joueurs, polices, ui } from '../../art/tokens.js';

const STYLE_ID = 'lwait-style';

function css(): string {
  const sticker = `0 0 0 ${ui.marge}px ${ui.vinyle}, 0 0 0 ${ui.marge + ui.lisere}px ${ui.encre}, 0 ${ui.epaisseur}px 0 ${ui.marge + ui.lisere}px ${ui.encre}`;
  return `
.fighter-panel.lwait-on { align-items:stretch; cursor:default; }
.lwait { display:flex; align-items:center; gap:22px; flex:1; min-width:0; padding:6px 2px 2px; }
.fighter-panel.p2 .lwait { flex-direction:row-reverse; text-align:right; }
.lwait-stage { position:relative; flex:none; width:176px; height:176px; }
.lwait-photo { position:absolute; inset:14px; border-radius:${ui.rayon}px; overflow:hidden; background:${ui.carton};
  border:${ui.trait}px solid ${ui.encre}; box-shadow:${sticker}; transform:rotate(-${ui.inclinaison}deg);
  transition:transform ${durees.glisse}ms ${ui.courbes.sortie}, opacity ${durees.glisse}ms linear; }
.lwait-photo img { width:100%; height:100%; object-fit:cover; display:block; filter:grayscale(.35) contrast(1.05); }
.lwait.flash .lwait-photo { animation:lwaitFlash ${durees.snap * 3}ms ease-out; }
@keyframes lwaitFlash { from { filter:brightness(2.6); transform:rotate(-${ui.inclinaison}deg) scale(1.08); } }
.lwait[data-step="face"] .lload-beam, .lwait[data-step="draw"] .lload-beam { display:block; }
.lwait .lload-beam { display:none; }
.lwait-pencil { position:absolute; left:50%; top:46%; width:58px; height:58px; margin:-29px 0 0 -29px; opacity:0; pointer-events:none;
  transition:opacity ${durees.glisse}ms linear; will-change:transform; }
.lwait-pencil svg { width:100%; height:100%; overflow:visible; }
.lwait[data-step="draw"] .lwait-pencil { opacity:1; animation:lwaitScribble ${durees.dramatique * 1.3}ms ease-in-out infinite; }
@keyframes lwaitScribble { 0% { transform:translate(-34px, -26px) rotate(-8deg); } 25% { transform:translate(30px, -14px) rotate(6deg); }
  50% { transform:translate(-26px, 8px) rotate(-6deg); } 75% { transform:translate(32px, 22px) rotate(8deg); } 100% { transform:translate(-34px, -26px) rotate(-8deg); } }
.lwait-sheet { position:absolute; left:-16px; right:-16px; top:18px; width:calc(100% + 32px); height:140px; object-fit:contain; opacity:0;
  filter:drop-shadow(0 ${ui.epaisseur * 0.5}px 0 ${ui.encre}); clip-path:inset(0 100% 0 0); }
.lwait-sheet.on { opacity:1; animation:lwaitReveal ${durees.dramatique}ms ${ui.courbes.sortie} both; }
@keyframes lwaitReveal { from { clip-path:inset(0 100% 0 0); transform:scale(1.12) rotate(3deg); }
  to { clip-path:inset(0 0 0 0); transform:scale(1) rotate(-2deg); } }
.lwait.has-sheet .lwait-photo { transform:rotate(-${ui.inclinaison * 3}deg) translate(-30%, -34%) scale(.42); }
.lwait.has-sheet .lwait-pencil { opacity:0; animation:none; }
.lwait.has-3d .lwait-photo { opacity:0; }
.lwait.has-3d .lwait-sheet.on { animation:none; clip-path:inset(0 0 0 0); transform:translate(34%, 44%) scale(.36) rotate(4deg);
  transition:transform ${durees.glisse}ms ${ui.courbes.sortie}; }
.lwait-3d { position:absolute; inset:-10px -18px 0; width:calc(100% + 36px); height:calc(100% + 10px); display:block; }
.lwait-stamp { position:absolute; left:50%; top:58%; padding:4px 16px 6px; font:400 44px/1 ${polices.titre}; color:${ui.vinyle};
  background:${ui.alerte}; -webkit-text-stroke:${ui.contourTexte.petit}px ${ui.encre}; paint-order:stroke fill;
  border:${ui.trait}px solid ${ui.encre}; border-radius:${ui.rayon}px; box-shadow:0 ${ui.epaisseur}px 0 ${ui.encre};
  transform:translate(-50%, -50%) rotate(-8deg) scale(1.9); opacity:0; pointer-events:none; }
.lwait.ready .lwait-stamp { opacity:1; transform:translate(-50%, -50%) rotate(-8deg) scale(1);
  transition:transform ${durees.glisse}ms ${ui.courbes.claque}, opacity ${durees.snap}ms linear; }

.lwait-info { display:grid; gap:8px; min-width:0; flex:1; }
.lwait-steps { display:grid; gap:7px; margin:0; padding:0; list-style:none; font:800 17px/1.15 ${polices.texte}; color:${ui.encre}; }
.lwait-steps li { display:flex; align-items:center; gap:9px; opacity:.38; }
.fighter-panel.p2 .lwait-steps li { flex-direction:row-reverse; }
.lwait-steps li.now, .lwait-steps li.done, .lwait-steps li.fail { opacity:1; }
.lwait-steps i { flex:none; position:relative; width:20px; height:20px; border-radius:50%; border:${ui.trait}px solid ${ui.encre};
  background:transparent; box-sizing:border-box; }
.lwait-steps li.now i { background:${ui.vinyle}; animation:lwaitPulse ${durees.dramatique * 0.8}ms ease-in-out infinite; }
@keyframes lwaitPulse { 50% { transform:scale(1.3); } }
.lwait-steps li.done i { background:${ui.encre}; animation:lwaitCheck ${durees.glisse}ms ${ui.courbes.claque}; }
.lwait-steps li.done i::after { content:''; position:absolute; left:4px; top:1px; width:5px; height:9px; border:solid ${ui.vinyle};
  border-width:0 3px 3px 0; transform:rotate(45deg); }
@keyframes lwaitCheck { from { transform:scale(1.8); } }
.lwait-steps li.fail i { background:${ui.alerte}; }
.lwait-steps li.fail i::after { content:'!'; position:absolute; inset:0; display:grid; place-items:center; font:400 13px/1 ${polices.titre}; }
.lwait-clock { margin-left:auto; font:400 16px/1 ${polices.titre}; opacity:.8; font-variant-numeric:tabular-nums; }
.fighter-panel.p2 .lwait-clock { margin-left:0; margin-right:auto; }
.lwait-read { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-height:34px; padding-left:29px; }
.fighter-panel.p2 .lwait-read { flex-direction:row-reverse; padding-left:0; padding-right:29px; }
.lwait-nick { margin:0; font:400 clamp(24px, 3.4vh, 34px)/1 ${polices.titre}; color:${ui.vinyle};
  -webkit-text-stroke:${ui.contourTexte.petit}px ${ui.encre}; paint-order:stroke fill; overflow-wrap:anywhere; }
.lwait-swatch { width:22px; height:22px; border-radius:50%; border:${ui.trait}px solid ${ui.encre}; box-shadow:0 0 0 ${ui.lisere}px ${ui.vinyle};
  animation:lwaitPop ${durees.glisse}ms ${ui.courbes.claque} both; }
@keyframes lwaitPop { from { transform:scale(0); } }
.lwait-tag { padding:3px 9px; font:800 13px/1 ${polices.texte}; text-transform:uppercase; background:${ui.vinyle};
  border:2px solid ${ui.encre}; border-radius:999px; animation:lwaitPop ${durees.glisse}ms ${ui.courbes.claque} both; }
.lwait-fail { display:grid; gap:8px; padding:8px 12px; background:${ui.papier}; border:${ui.trait}px solid ${ui.encre};
  border-radius:${ui.rayon}px; box-shadow:0 4px 0 ${ui.encre}; animation:lwaitPop ${durees.glisse}ms ${ui.courbes.claque} both; }
.lwait-fail p { margin:0; font:800 15px/1.25 ${polices.texte}; }
.lwait-actions { display:flex; flex-wrap:wrap; gap:10px; }
.fighter-panel.p2 .lwait-actions { justify-content:flex-end; }
.lwait.p1 .lwait-steps li.now i { border-color:${joueurs.p1.fonce}; }
.lwait.p2 .lwait-steps li.now i { border-color:${joueurs.p2.fonce}; }

.lwait-tip { max-width:min(760px, 92%); margin:0 auto; padding:8px 18px; background:${ui.papier}; color:${ui.encre};
  border:${ui.trait}px solid ${ui.encre}; border-radius:${ui.rayon}px; font:800 17px/1.25 ${polices.texte}; text-align:center;
  transform:rotate(${ui.inclinaison * -0.4}deg); }
.lwait-tip b { font-family:${polices.titre}; font-weight:400; }
.lwait-tip.swap { animation:lwaitTip ${durees.glisse}ms ${ui.courbes.claque}; }
@keyframes lwaitTip { from { transform:rotate(${ui.inclinaison * -0.4}deg) scale(1.12); } }
.ready-bar.lwait-wait { font-size:calc(var(--b-taille-min) * .8); }

@media (prefers-reduced-motion: reduce) {
  .lwait-pencil, .lwait-sheet.on, .lwait-steps i, .lwait-swatch, .lwait-tag, .lwait-fail, .lwait-tip.swap { animation:none !important; }
}
`;
}

export function injectHeadStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css();
  document.head.append(style);
}
