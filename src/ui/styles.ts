// Feuille de style du lot LU, direction « Vinyle » (DA, 26/09). Ne référence QUE des variables CSS (--b-*),
// toutes sourcées de src/art/tokens.js (voir theme.ts). Grammaire : tout est un sticker (fond papier ou couleur
// du coin, contour encre 3 px, marge vinyle, liseré, ombre dure sans flou, légère inclinaison alternée).
// Entrée = claque (échelle), sortie = décolle (rotation + translation, JAMAIS de fondu). Zéro glow, zéro reflet,
// zéro holographie, zéro dégradé de rareté, zéro emoji.
export const CSS_TEXT = `
.broskis-ui { position:fixed; inset:0; pointer-events:none; font:700 16px/1.3 var(--b-body); color:var(--b-encre); }
.broskis-ui * { box-sizing:border-box; }
/* Fix LSCAN-PERSO : sans cette règle, [hidden] perd contre .fighter-grid/.weapon-rack (display:grid, règle
   auteur) car une règle auteur bat toujours l'agent utilisateur, même à spécificité égale. Bouton "Snap yourself"
   et la grille de persos restaient visibles pendant la capture. */
.broskis-ui [hidden] { display:none !important; }
.broskis-ui svg { display:block; }
.num { font-variant-numeric:tabular-nums; font-weight:800; }
.stroke { font-family:var(--b-display); color:var(--b-vinyle); -webkit-text-stroke:var(--b-contour-grand) var(--b-encre); paint-order:stroke fill; }
.screen-layer { position:absolute; inset:0; z-index:10; }

/* ---------- Le sticker : la grammaire commune à tout élément posé sur la scène ---------- */
.b-btn, .b-panel, .fighter-tile, .rack-tile, .map-tile, .arsenal-slot, .cat-badge, .turn-banner,
.center-banner, .commentary {
  border:var(--b-trait) solid var(--b-encre); border-radius:var(--b-rayon); box-shadow:var(--b-sticker-shadow);
}
.sticker-in { animation:stickerIn var(--b-t-snap) var(--b-claque); }
@keyframes stickerIn { from { transform:scale(1.3); } to { transform:scale(1); } }
.sticker-out { animation:stickerOut var(--b-t-decolle) var(--b-decolle) forwards; }
@keyframes stickerOut { to { transform:rotate(8deg) translateY(-30px); } }

/* ---------- Écrans de menu (fond carton) vs overlay pendant le match (voile) ---------- */
.b-menu { position:absolute; inset:0; display:grid; place-items:center; padding:24px; background:var(--b-carton); pointer-events:auto; overflow-y:auto; }
.b-overlay { position:absolute; inset:0; z-index:20; display:grid; place-items:center; padding:24px; background:var(--b-voile); pointer-events:auto; }
.b-panel { background:var(--b-papier); color:var(--b-encre); }
.b-card { width:min(640px,100%); max-height:calc(100vh - 48px); overflow-y:auto; padding:28px 30px 24px; text-align:center; }
h1.b-title, h2.b-title, h3.b-title { font-family:var(--b-display); font-weight:400; margin:0 0 10px; line-height:1; color:var(--b-encre); }
h1.b-title { font-size:var(--b-taille-titre); }
h2.b-title { font-size:calc(var(--b-taille-titre) * 0.45); }
h3.b-title { font-size:20px; margin-bottom:6px; }
.b-lede { font-size:17px; line-height:1.45; margin:0 auto 16px; max-width:48ch; }

/* ---------- Boutons ---------- */
.b-btn { pointer-events:auto; font-family:var(--b-display); font-size:var(--b-taille-min); letter-spacing:.02em; color:var(--b-encre);
  background:var(--b-papier); cursor:pointer; padding:10px 22px; transition:transform 80ms var(--b-sortie); }
.b-btn:hover:not(:disabled) { background:var(--b-vinyle); }
.b-btn:active:not(:disabled) { transform:translateY(3px); }
.b-btn:disabled { background:var(--b-carton); color:var(--b-muted); cursor:default; }
.b-btn.alt { background:var(--b-alerte); }
.b-btn.small { font-size:15px; padding:6px 14px; }

/* ---------- Choix du perso / arsenal : tuiles ---------- */
.fighter-grid, .weapon-rack, .map-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:18px; margin:18px 0; }
.fighter-tile, .rack-tile, .map-tile { cursor:pointer; text-align:left; padding:14px 16px; background:var(--b-papier); transition:transform 80ms var(--b-sortie); }
.fighter-tile:nth-child(odd), .rack-tile:nth-child(odd), .map-tile:nth-child(odd) { transform:rotate(calc(var(--b-inclinaison) * -0.6)); }
.fighter-tile:nth-child(even), .rack-tile:nth-child(even), .map-tile:nth-child(even) { transform:rotate(calc(var(--b-inclinaison) * 0.6)); }
.fighter-tile:hover, .fighter-tile:focus-visible, .rack-tile:hover, .rack-tile:focus-visible, .map-tile:hover, .map-tile:focus-visible { transform:scale(1.04); outline:none; }
.fighter-name { font-family:var(--b-display); font-size:20px; margin:0 0 2px; }
.fighter-model { margin:0 0 8px; font-size:13px; text-transform:capitalize; color:var(--b-muted); }
.fighter-quote { margin:10px 0 0; font-style:italic; font-size:14px; }
.fighter-confirm { margin-top:6px; }
.confirm-row { display:flex; justify-content:center; gap:12px; margin-top:14px; }
.stat-row { margin:6px 0; }
.stat-row-top { display:flex; justify-content:space-between; font-size:13px; font-weight:800; margin-bottom:2px; }
.stat-label { text-transform:capitalize; }
.b-bar { position:relative; height:10px; background:var(--b-carton); border:2px solid var(--b-encre); border-radius:6px; overflow:hidden; }
.b-bar i, .b-bar s { position:absolute; inset:0; transform-origin:left; }
.b-bar i { background:var(--b-alerte); transition:transform var(--b-t-snap) linear; z-index:1; }
.b-bar s { background:var(--b-vinyle); transition:transform var(--b-t-vidange) linear var(--b-t-fantome); }

/* ---------- Capture (webcam / import / glisser-déposer) ---------- */
.capture { display:grid; gap:12px; margin-top:12px; }
.capture-zone { position:relative; min-height:200px; display:grid; place-items:center; gap:8px; padding:14px; background:var(--b-carton); border:2px dashed var(--b-encre); border-radius:10px; }
.capture-zone.drag-over { border-color:var(--b-alerte); }
.capture-video, .snap-video { width:100%; max-width:420px; border-radius:6px; }
.capture-hint { color:var(--b-encre); font-size:14px; text-align:center; margin:0; }
.capture-row { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; }
.capture-file-input { display:none; }
.capture-error { color:var(--b-danger); font-size:13px; margin:0; }

/* ---------- Forge ---------- */
.forge { display:grid; justify-items:center; gap:10px; padding:20px; }
.forge-svg { width:140px; height:110px; overflow:visible; }
.forge-anvil { fill:var(--b-muted); }
.forge-hammer { transform-box:fill-box; transform-origin:90% 10%; animation:forgeSwing 700ms ease-in-out infinite; }
.forge-handle { fill:var(--b-carton); }
.forge-head { fill:var(--b-encre); }
@keyframes forgeSwing { 0%, 60%, 100% { transform:rotate(0deg); } 78% { transform:rotate(38deg); } }
.forge-spark { fill:var(--b-alerte); opacity:0; }
.forge-spark-0 { animation:forgeSpark 700ms ease-out infinite; }
.forge-spark-1 { animation:forgeSpark 700ms ease-out infinite; animation-delay:35ms; }
.forge-spark-2 { animation:forgeSpark 700ms ease-out infinite; animation-delay:70ms; }
.forge-spark-3 { animation:forgeSpark 700ms ease-out infinite; animation-delay:14ms; }
.forge-spark-4 { animation:forgeSpark 700ms ease-out infinite; animation-delay:56ms; }
@keyframes forgeSpark { 0%, 75% { opacity:0; translate:0 0; } 82% { opacity:1; } 100% { opacity:0; translate:0 -16px; } }
.forge-label { margin:0; font-family:var(--b-display); font-size:18px; }

/* ---------- Carte d'arme Wacky Packages (règle 5) ---------- */
.weapon-card { aspect-ratio:5/7; width:min(320px,72vw); perspective:1000px; background:none; border:none; box-shadow:none; }
.weapon-card.reveal-size { width:var(--b-card-w); }
.weapon-card-inner { position:relative; width:100%; height:100%; transform-style:preserve-3d; transition:transform var(--b-t-glisse) linear; }
.weapon-card-inner.face-down { transform:rotateY(180deg); }
.weapon-card-face { position:absolute; inset:0; backface-visibility:hidden; overflow:hidden; display:flex; flex-direction:column;
  background:var(--b-papier); border:var(--b-sticker-card-border) solid var(--b-vinyle); outline:var(--b-trait) solid var(--b-encre); outline-offset:calc(var(--b-sticker-card-border) * -1); border-radius:var(--b-rayon); box-shadow:0 var(--b-epaisseur) 0 var(--b-encre); }
.wc-back { transform:rotateY(180deg); display:grid; place-items:center; background:var(--b-carton); }
.wc-back-mark { font-size:28px; color:var(--b-papier); -webkit-text-stroke:4px var(--b-encre); paint-order:stroke fill; }
.wc-front { text-align:left; padding:0; font-size:13px; }
.wc-band-top { display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:var(--owner); color:var(--b-vinyle); font-weight:800; border-bottom:var(--b-trait) solid var(--b-encre); }
.wc-category { padding:1px 8px; border-radius:999px; background:var(--accent); color:var(--b-encre); font-size:11px; text-transform:capitalize; }
.wc-number { font-family:var(--b-display); font-size:15px; -webkit-text-stroke:2px var(--b-encre); paint-order:stroke fill; }
.wc-illustration { position:relative; height:44%; background-color:var(--owner-light); background-image:radial-gradient(var(--b-encre) 1.2px, transparent 1.6px); background-size:var(--b-dot) var(--b-dot); display:grid; place-items:center; border-bottom:var(--b-trait) solid var(--b-encre); overflow:hidden; }
.wc-glyph { width:44%; color:var(--b-encre); opacity:.85; }
.wc-photo-wrap { position:absolute; top:8%; right:8%; width:46%; transform:rotate(var(--b-photo-tilt)); }
.wc-photo { display:block; width:100%; border:3px solid var(--b-vinyle); outline:2px solid var(--b-encre); filter:grayscale(1) contrast(1.12); box-shadow:0 4px 0 var(--b-encre); }
.wc-staple { position:absolute; top:-4px; left:22%; width:12px; height:5px; background:var(--b-encre); border-radius:1px; transform:rotate(-8deg); }
.wc-staple.b { left:auto; right:22%; transform:rotate(8deg); }
.wc-band-name { font-family:var(--b-display); font-size:18px; padding:5px 10px; background:var(--owner); color:var(--b-vinyle); border-top:var(--b-trait) solid var(--b-encre); border-bottom:var(--b-trait) solid var(--b-encre); }
.wc-front .weapon-object { margin:6px 10px 0; }
.wc-pips { display:grid; gap:3px; padding:4px 10px; }
.wc-pip-row { display:flex; align-items:center; gap:6px; }
.wc-pip-label { width:56px; font-size:10px; font-weight:800; text-transform:capitalize; color:var(--b-muted); }
.wc-pip-dots { display:flex; gap:3px; }
.wc-pip-dots .pip { position:relative; width:11px; height:11px; border:2px solid var(--b-encre); border-radius:50%; background:var(--b-papier); }
.wc-pip-dots .pip.filled { background:var(--owner); }
.wc-stamp { align-self:center; margin:4px auto; padding:2px 12px; font-family:var(--b-display); font-size:15px; text-transform:uppercase; color:var(--b-danger);
  border:2px solid var(--b-danger); box-shadow:none; transform:rotate(var(--b-stamp-tilt)); background:none; }
.wc-front .category-pills { margin:4px 0; padding:0 10px; }
.wc-front .weapon-why { margin:2px 10px 8px; font-size:11px; flex:1; }

/* ---------- Présentation ---------- */
.reveal-stage { min-height:min(460px,58vh); display:grid; align-content:center; justify-items:center; margin:14px 0; }
.reveal-kicker { margin:0 0 8px; font-weight:800; color:var(--b-p1-fonce); }
.reveal-subtitle { min-height:24px; font-size:15px; font-weight:700; margin:10px 0; }
.reveal-footer { display:flex; justify-content:center; gap:12px; }

/* ---------- Choix de la map ---------- */
.map-tile { text-align:center; }
.map-tile-art { width:64px; height:64px; margin:0 auto 10px; color:var(--b-encre); }
.map-tile-art svg { width:100%; height:100%; }
.map-tile-name { font-family:var(--b-display); font-size:19px; margin:0 0 6px; }
.map-tile-blurb { font-size:13px; margin:0; }

/* ---------- Bandeau de tour (règle 2) : arrive de son côté, tient durees.bandeau ---------- */
.turn-banner { position:fixed; top:22vh; font-family:var(--b-display); font-size:var(--b-taille-bandeau); color:var(--b-vinyle);
  padding:.15em .6em; white-space:nowrap; }
.turn-banner.p1 { left:0; background:var(--b-p1); }
.turn-banner.p2 { right:0; background:var(--b-p2); }
.turn-banner.p1.enter { animation:bannerInLeft var(--b-t-snap) var(--b-claque) forwards; }
.turn-banner.p2.enter { animation:bannerInRight var(--b-t-snap) var(--b-claque) forwards; }
@keyframes bannerInLeft { from { transform:translateX(-120%) rotate(calc(var(--b-inclinaison) * -1)); } to { transform:translateX(0) rotate(calc(var(--b-inclinaison) * -1)); } }
@keyframes bannerInRight { from { transform:translateX(120%) rotate(var(--b-inclinaison)); } to { transform:translateX(0) rotate(var(--b-inclinaison)); } }

/* ---------- Bandeau central : PERFECT!/GOOD/MISS, RING OUT!/K.O. ---------- */
.center-banner { position:fixed; top:22vh; left:50%; font-family:var(--b-display); font-size:calc(var(--b-taille-bandeau) * 0.7);
  padding:.15em .6em; background:var(--b-papier); white-space:nowrap; }
.center-banner.enter { animation:stickerIn var(--b-t-snap) var(--b-claque) forwards; }
.center-banner.grade-perfect { color:var(--b-alerte); -webkit-text-stroke:var(--b-contour-grand) var(--b-encre); paint-order:stroke fill; background:none; border-color:transparent; box-shadow:none; }
.center-banner.grade-good { color:var(--b-cat-shield); }
.center-banner.grade-miss { color:var(--b-danger); font-size:calc(var(--b-taille-bandeau) * 0.5); }
.center-banner.ko { font-size:var(--b-taille-bandeau); color:var(--b-vinyle); background:var(--b-encre); }

/* ---------- Sous-titres de l'animateur (règle 3) ---------- */
.commentary { position:absolute; top:14px; left:50%; transform:translateX(-50%); display:flex; align-items:flex-end; gap:10px;
  max-width:60vw; background:var(--b-papier); padding:8px 14px; }
.commentary-portrait { width:var(--b-portrait); height:var(--b-portrait); min-width:var(--b-portrait); border-radius:50%;
  background:var(--b-vinyle); border:var(--b-trait) solid var(--b-encre); }
.commentary-portrait .mouth-open { display:none; }
.commentary-portrait.talk .mouth-open { display:block; }
.commentary-portrait.talk .mouth-closed { display:none; }
.commentary-bubble { font-size:var(--b-taille-sous-titre); font-weight:800; line-height:1.2; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.commentary-bubble .name-p1 { color:var(--b-p1-fonce); }
.commentary-bubble .name-p2 { color:var(--b-p2-fonce); }

/* ---------- Nombres flottants (dégâts) ---------- */
.floater-layer { position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:8; }
.floater { position:absolute; transform:translate(-50%,-50%); font-family:var(--b-display); font-size:var(--b-taille-degats);
  color:var(--b-vinyle); -webkit-text-stroke:var(--b-contour-grand) var(--b-encre); paint-order:stroke fill; white-space:nowrap;
  animation:floatUp var(--b-t-floater) var(--b-sortie) forwards; }
.floater.crit { font-size:calc(var(--b-taille-degats) * 1.2); color:var(--b-alerte); }
@keyframes floatUp { 0% { opacity:0; transform:translate(-50%,-30%) scale(1.3); } 15% { opacity:1; transform:translate(-50%,-55%) scale(1); } 100% { opacity:0; transform:translate(-50%,-170%) scale(1); } }

/* ---------- Fin de match : Damage Report ---------- */
.report-layout { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:18px; margin:10px 0 18px; text-align:left; }
.bill-lines { list-style:none; margin:0; padding:0; display:grid; gap:4px; font-size:14px; }
.bill-line { display:flex; align-items:baseline; gap:6px; }
.bill-label { min-width:0; }
.bill-dots { flex:1; min-width:12px; border-bottom:2px dotted var(--b-encre); transform:translateY(-4px); }
.bill-amount { white-space:nowrap; }
.bill-empty { color:var(--b-muted); font-style:italic; }
.bill-total { display:flex; justify-content:space-between; align-items:baseline; margin:10px 0 0; padding-top:8px; border-top:3px double var(--b-encre); font-family:var(--b-display); font-size:20px; }
.report-best, .report-mvp, .report-cause { font-size:15px; }
.report-actions { display:flex; justify-content:center; gap:14px; margin-top:6px; }
.snap-countdown { display:block; font-size:48px; margin:6px 0; }

@media (max-width:760px) {
  .report-layout { grid-template-columns:minmax(0,1fr); }
  .b-card { padding:20px 16px; }
  .commentary { max-width:82vw; }
  .commentary-portrait { width:64px; height:64px; min-width:64px; }
}
@media (prefers-reduced-motion: reduce) {
  .turn-banner, .center-banner, .floater, .weapon-card-inner, .forge-hammer { animation-duration:.01s; transition-duration:.01s; }
}
`;
