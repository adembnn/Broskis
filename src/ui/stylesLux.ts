// Feuille de style du lot LUX (interface pour joueur occasionnel) : HUD façon Smash, barre d'armes, aide à touches
// dessinées, invite de parade, bandeaux READY?/GO!/GAME!, fonds d'écran de menu, grilles à stickers.
// Même grammaire « Vinyle » que styles.ts (sticker : trait encre, marge vinyle, ombre dure) ; uniquement des --b-*.
export const LUX_CSS = `
/* ---------- Touches de clavier dessinées ---------- */
.key { display:inline-grid; place-items:center; min-width:1.55em; height:1.55em; padding:0 .38em; font:400 .78em/1 var(--b-display);
  color:var(--b-encre); background:var(--b-vinyle); border:2.5px solid var(--b-encre); border-radius:.32em;
  box-shadow:0 .17em 0 var(--b-encre); transform:translateY(-.09em); -webkit-text-stroke:0; letter-spacing:.02em; white-space:nowrap; }
.key.wide { padding:0 .6em; }
.keyline { display:inline-flex; align-items:center; gap:.42em; }
.keygroup { display:inline-flex; gap:.18em; }
.keysep { color:var(--b-muted); }

/* ---------- Sticker 2D d'une arme ---------- */
.wsticker { position:relative; display:grid; place-items:center; width:100%; height:100%; min-height:0; }
.wsticker-img { display:block; max-width:100%; max-height:100%; object-fit:contain; user-select:none;
  filter:drop-shadow(0 3px 0 color-mix(in srgb, var(--b-encre) 55%, transparent)); }
.wsticker.forged .wsticker-img { animation:forged 560ms var(--b-claque) both; }
@keyframes forged { 0% { transform:scale(.35) rotate(-14deg); filter:brightness(2.6); } 100% { transform:none; } }
.wsticker-label { max-width:100%; padding:4px 8px; font:400 15px/1.05 var(--b-display); text-transform:uppercase; text-align:center;
  background:var(--b-vinyle); border:2px solid var(--b-encre); border-radius:8px; transform:rotate(-4deg); overflow-wrap:anywhere; }
.wsticker .forge { padding:0; gap:0; width:100%; height:100%; place-items:center; }
.wsticker .forge-svg { width:72%; height:auto; max-height:100%; }
.wsticker .forge-label { display:none; }

/* ---------- Étiquette de catégorie : pictogramme + mot ---------- */
.cat-tag { display:inline-flex; align-items:center; gap:5px; font:800 12px/1 var(--b-body); text-transform:uppercase; letter-spacing:.03em; white-space:nowrap; }
.cat-tag .cat-badge { width:22px; height:22px; min-width:22px; padding:3px; border-width:2px; box-shadow:none; }

/* ---------- Fonds des écrans de menu : ring de boxe en affiche (coin rouge, coin bleu, trame) ---------- */
.b-menu { background:
    radial-gradient(color-mix(in srgb, var(--b-encre) 15%, transparent) 1.5px, transparent 2px) 0 0 / 18px 18px,
    linear-gradient(112deg, var(--b-p1) 0 11%, var(--b-encre) 11% 11.5%, transparent 11.5% 88.5%, var(--b-encre) 88.5% 89%, var(--b-p2) 89%),
    var(--b-carton); }
.b-menu .b-card { box-shadow:0 0 0 var(--b-marge) var(--b-vinyle), 0 0 0 var(--b-marge-lisere) var(--b-encre), 0 10px 0 var(--b-marge-lisere) var(--b-encre); }
.screen-head { display:flex; align-items:center; justify-content:center; gap:14px; margin:0 0 12px; }
.screen-head .b-title { margin:0; }
.screen-foot { display:flex; justify-content:center; align-items:center; gap:14px; margin-top:16px; }
.ptoken { display:inline-grid; place-items:center; min-width:64px; height:44px; padding:0 10px; font:400 28px/1 var(--b-display); color:var(--b-vinyle);
  border:var(--b-trait) solid var(--b-encre); border-radius:999px; box-shadow:0 4px 0 var(--b-encre); transform:rotate(-4deg); }
.ptoken.p1 { background:var(--b-p1); }
.ptoken.p2 { background:var(--b-p2); transform:rotate(4deg); }
.b-btn.cta { font-size:calc(var(--b-taille-min) * 1.15); padding:12px 34px; background:var(--b-alerte); }
.b-btn.cta:disabled { background:var(--b-carton); }
.b-btn.link { background:none; border:none; box-shadow:none; font:800 16px var(--b-body); text-decoration:underline; padding:6px 10px; color:var(--b-encre); }

/* ---------- Arsenal : 3 emplacements (touches 1 2 3) + râtelier de stickers ---------- */
.arsenal-card { width:min(1080px, 100%); }
.arsenal-slots { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:18px; margin:6px 0 18px; }
.arsenal-slot { position:relative; display:grid; justify-items:center; align-content:start; gap:4px; min-height:132px; padding:14px 10px 10px;
  background:var(--b-papier); cursor:pointer; text-align:center; }
.arsenal-slot.active { background:var(--b-vinyle); outline:4px dashed var(--b-encre); outline-offset:4px; }
.arsenal-card.p1 .arsenal-slot.active { background:var(--b-p1-clair); }
.arsenal-card.p2 .arsenal-slot.active { background:var(--b-p2-clair); }
.slot-key { position:absolute; top:-14px; left:-10px; font-size:22px; }
.slot-sticker { height:64px; }
.slot-hole { width:64px; height:64px; border:3px dashed var(--b-muted); border-radius:50%; }
.slot-name { font:800 15px/1.1 var(--b-body); }
.slot-empty-hint { margin:0; font-size:14px; color:var(--b-muted); }
.weapon-rack { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:14px; margin:0; }
.rack-tile { display:grid; justify-items:center; align-content:start; gap:5px; padding:10px 8px 10px; text-align:center; }
.rack-sticker { height:74px; }
.rack-name { font:800 14px/1.1 var(--b-body); }
.snap-tile { background:var(--b-alerte); }
.snap-icon { width:70px; height:62px; color:var(--b-p2); }
.snap-icon svg { width:100%; height:100%; }
.snap-sub { font-size:12px; font-weight:800; }

/* ---------- Carte d'arme : le sticker à la place du pictogramme ---------- */
.wc-category { display:inline-flex; align-items:center; gap:4px; text-transform:uppercase; }
.wc-category svg { width:13px; height:13px; }
.wc-illustration .wc-sticker { width:78%; height:84%; }
.wc-photo-wrap { width:34%; top:6%; right:5%; }

/* ---------- HUD : encarts joueurs en bas ---------- */
.hud-root[hidden] { display:none; }
.plate { position:absolute; bottom:18px; display:flex; align-items:center; gap:12px; width:clamp(270px, 38vh, 420px);
  padding:10px 16px 10px 12px; background:var(--b-papier); border:var(--b-trait) solid var(--b-encre); border-radius:var(--b-rayon);
  box-shadow:var(--b-sticker-shadow); transition:transform var(--b-t-glisse) var(--b-sortie), background var(--b-t-glisse); }
.plate.p1 { left:22px; --pc:var(--b-p1); --pc-fonce:var(--b-p1-fonce); --pc-clair:var(--b-p1-clair); transform:rotate(-1.2deg); }
.plate.p2 { right:22px; flex-direction:row-reverse; text-align:right; padding:10px 12px 10px 16px; --pc:var(--b-p2); --pc-fonce:var(--b-p2-fonce); --pc-clair:var(--b-p2-clair); transform:rotate(1.2deg); }
.plate.active { background:var(--pc-clair); }
.plate.p1.active { transform:translateY(-10px) rotate(-1.2deg); }
.plate.p2.active { transform:translateY(-10px) rotate(1.2deg); }
.plate-body { min-width:0; flex:1; display:grid; gap:2px; }
.plate-name { font:400 clamp(17px, 2.6vh, 26px)/1 var(--b-display); color:var(--pc-fonce); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.plate-pct { font-family:var(--b-display); font-size:clamp(56px, 9.5vh, 104px); line-height:.92; color:var(--pct-color, var(--b-vinyle));
  -webkit-text-stroke:var(--b-contour-grand) var(--b-encre); paint-order:stroke fill; white-space:nowrap; }
.plate-pct .pct-sign { font-size:.5em; margin-left:.04em; }
.plate-pct.hit { animation:pctHit 360ms var(--b-sortie); }
@keyframes pctHit { 0% { transform:scale(1.35) translateX(0); } 20% { transform:scale(1.25) translateX(-7px); } 40% { transform:scale(1.15) translateX(6px); }
  60% { transform:scale(1.07) translateX(-4px); } 80% { transform:scale(1.02) translateX(2px); } 100% { transform:none; } }
.plate.p1 .plate-pct { transform-origin:left center; }
.plate.p2 .plate-pct { transform-origin:right center; }
.plate-stocks { display:flex; gap:6px; }
.plate.p2 .plate-stocks { justify-content:flex-end; }
.stock { width:17px; height:17px; border-radius:50%; background:var(--pc); border:2.5px solid var(--b-encre); }
.stock.lost { background:transparent; border-style:dashed; opacity:.45; }
.plate-stocks.lost-one { animation:stickerIn var(--b-t-glisse) var(--b-claque); }
.plate-turn { position:absolute; top:-30px; padding:3px 12px; font:400 18px/1.2 var(--b-display); color:var(--b-vinyle); background:var(--pc);
  border:var(--b-trait) solid var(--b-encre); border-radius:999px; box-shadow:0 4px 0 var(--b-encre); visibility:hidden; }
.plate.p1 .plate-turn { left:16px; transform:rotate(-3deg); }
.plate.p2 .plate-turn { right:16px; transform:rotate(3deg); }
.plate.active .plate-turn { visibility:visible; animation:stickerIn var(--b-t-snap) var(--b-claque); }
.plate-bro { position:absolute; left:18%; right:18%; bottom:-11px; height:14px; border:2.5px solid var(--b-encre); border-radius:8px; background:var(--b-carton); overflow:hidden; display:none; }
.plate-bro i { position:absolute; inset:0; transform-origin:left; transform:scaleX(0); background:var(--b-alerte); transition:transform var(--b-t-snap) var(--b-sortie); }
.plate-bro .bro-label { position:relative; display:block; font:800 9px/9px var(--b-body); text-align:center; }
.plate-bro.ready { display:block; }
.plate-bro.ready i { background:repeating-linear-gradient(45deg, var(--b-alerte) 0 var(--b-stripe), var(--b-encre) var(--b-stripe) calc(var(--b-stripe) * 2)); }
.plate-bro.ready .bro-label { color:var(--b-vinyle); -webkit-text-stroke:2px var(--b-encre); paint-order:stroke fill; }

/* ---------- Portraits (grille, encarts, fin) ---------- */
.portrait { position:relative; display:grid; place-items:center; overflow:hidden; border-radius:50%; background:var(--pc, var(--b-carton));
  border:var(--b-trait) solid var(--b-encre); aspect-ratio:1; }
.portrait.p1 { --pc:var(--b-p1); }
.portrait.p2 { --pc:var(--b-p2); }
.portrait-img { width:100%; height:100%; object-fit:cover; }
.portrait-img.face { object-fit:contain; padding:8%; }
.portrait-initial { font:400 2.4em/1 var(--b-display); color:var(--b-vinyle); -webkit-text-stroke:5px var(--b-encre); paint-order:stroke fill; }
.plate-portrait { width:clamp(66px, 11vh, 112px); flex:none; font-size:clamp(14px, 2vh, 20px); }
.plate-portrait .portrait { width:100%; box-shadow:0 0 0 4px var(--b-vinyle), 0 0 0 6px var(--b-encre); }

/* ---------- Barre d'armes du joueur actif ---------- */
.wbar { position:absolute; left:50%; bottom:18px; display:flex; gap:clamp(12px, 1.8vh, 20px); align-items:flex-end; transform:translateX(-50%);
  transition:transform var(--b-t-glisse) var(--b-sortie); }
.wbar.p1 { --pc:var(--b-p1); --pc-clair:var(--b-p1-clair); }
.wbar.p2 { --pc:var(--b-p2); --pc-clair:var(--b-p2-clair); }
.wbar.idle { transform:translate(-50%, 170%); }
.wcard { position:relative; width:clamp(122px, 18vh, 196px); padding:12px 8px 8px; display:grid; justify-items:center; gap:4px;
  background:var(--b-papier); border:var(--b-trait) solid var(--b-encre); border-radius:var(--b-rayon); box-shadow:var(--b-sticker-shadow);
  transition:transform var(--b-t-snap) var(--b-claque), background var(--b-t-snap); }
.wcard:nth-child(1) { transform:rotate(-2deg); }
.wcard:nth-child(3) { transform:rotate(2deg); }
.wcard-art { width:100%; height:clamp(52px, 8.2vh, 90px); }
.wcard-name { max-width:100%; font:800 clamp(13px, 1.9vh, 20px)/1.1 var(--b-body); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wcard-tag .cat-tag { font-size:clamp(11px, 1.5vh, 15px); }
.wcard-key { position:absolute; top:-15px; left:-12px; font-size:clamp(20px, 3vh, 30px); }
.wcard.selected { transform:translateY(-18px) scale(1.07); background:var(--pc-clair);
  box-shadow:0 0 0 var(--b-marge) var(--pc), 0 0 0 var(--b-marge-lisere) var(--b-encre), 0 var(--b-epaisseur) 0 var(--b-marge-lisere) var(--b-encre); }
.wcard.selected .wcard-key { background:var(--b-alerte); }
.wcard.cooling .wcard-art, .wcard.cooling .wcard-name, .wcard.cooling .wcard-tag { filter:grayscale(1); opacity:.4; }
.wcard-cd { display:none; position:absolute; left:6px; right:6px; top:34%; padding:3px 4px; font:400 clamp(13px, 1.9vh, 19px)/1.05 var(--b-display);
  text-align:center; color:var(--b-vinyle); background:var(--b-encre); border-radius:6px; transform:rotate(-7deg); }
.wcard.cooling .wcard-cd { display:block; }

/* ---------- Aide contextuelle (au-dessus des armes) ---------- */
.help-bar { position:absolute; left:50%; bottom:clamp(178px, 22vh, 250px); transform:translateX(-50%); display:flex; align-items:center; gap:14px;
  padding:8px 18px; font:800 clamp(19px, 2.9vh, 31px)/1 var(--b-body); white-space:nowrap; background:var(--b-papier);
  border:var(--b-trait) solid var(--b-encre); border-radius:999px; box-shadow:0 5px 0 var(--b-encre); }
.help-bar[hidden] { display:none; }
.help-bar .strong { font-family:var(--b-display); font-weight:400; }
.help-bar .fire { font-family:var(--b-display); font-weight:400; font-size:1.25em; color:var(--b-p1); }
.help-bar.p2 .fire { color:var(--b-p2); }
.help-chip { padding:4px 10px; font-size:.78em; background:var(--b-carton); border:2px solid var(--b-encre); border-radius:999px; }
.help-edge { padding:4px 12px; font:400 1em/1 var(--b-display); color:var(--b-vinyle); background:var(--b-p1); border:2px solid var(--b-encre);
  border-radius:8px; animation:edgePulse var(--b-t-alerte) steps(2, jump-none) infinite; }
@keyframes edgePulse { 50% { transform:scale(1.12) rotate(-3deg); } }

/* ---------- Invite de parade du défenseur ---------- */
.defend { position:absolute; left:50%; bottom:13vh; transform:translateX(-50%); display:grid; justify-items:center; gap:10px; text-align:center; pointer-events:none; z-index:6; }
.defend[hidden] { display:none; }
.defend.p1 { --pc:var(--b-p1); }
.defend.p2 { --pc:var(--b-p2); }
.defend-head { font:400 clamp(66px, 12vh, 132px)/.9 var(--b-display); color:var(--pc); -webkit-text-stroke:var(--b-contour-grand) var(--b-encre);
  paint-order:stroke fill; transform:rotate(-3deg); animation:stickerIn var(--b-t-snap) var(--b-claque); }
.defend-line { display:flex; align-items:center; gap:.35em; font:800 clamp(28px, 4.6vh, 50px)/1 var(--b-body); color:var(--b-vinyle);
  -webkit-text-stroke:6px var(--b-encre); paint-order:stroke fill; white-space:nowrap; }
.defend-key { position:relative; display:inline-grid; place-items:center; margin:0 .45em; }
.defend-key .key { font-size:1.15em; height:1.7em; padding:0 .55em; background:var(--b-alerte); }
.defend-ring { position:absolute; left:50%; top:50%; width:4.2em; height:4.2em; margin:-2.1em 0 0 -2.1em; border-radius:50%;
  border:.2em solid var(--pc); box-shadow:0 0 0 3px var(--b-encre), inset 0 0 0 3px var(--b-encre); animation:ringClose linear forwards; }
@keyframes ringClose { from { transform:scale(3); } to { transform:scale(1); } }

/* ---------- Repères projetés sur la scène : flèche du joueur actif, EDGE! ---------- */
.world-layer { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
.parrow { position:absolute; left:0; top:0; width:0; height:0; will-change:transform; --pc:var(--b-p1); }
.parrow.p2 { --pc:var(--b-p2); }
.parrow[hidden], .edge-warn[hidden] { display:none; }
.parrow-tag { position:absolute; left:0; bottom:26px; transform:translateX(-50%); padding:1px 12px; font:400 clamp(22px, 3.4vh, 34px)/1.15 var(--b-display);
  color:var(--b-vinyle); background:var(--pc); border:var(--b-trait) solid var(--b-encre); border-radius:10px; box-shadow:0 4px 0 var(--b-encre);
  white-space:nowrap; animation:bob 900ms ease-in-out infinite; }
.parrow-tip { position:absolute; left:-15px; bottom:0; width:30px; height:22px; background:var(--b-encre); clip-path:polygon(0 0, 100% 0, 50% 100%);
  animation:bob 900ms ease-in-out infinite; }
@keyframes bob { 50% { translate:0 -8px; } }
.edge-warn { position:absolute; left:0; top:0; width:0; height:0; }
.edge-warn span { position:absolute; left:0; bottom:0; transform:translateX(-50%); font:400 clamp(34px, 5.6vh, 58px)/1 var(--b-display); color:var(--b-p1);
  -webkit-text-stroke:var(--b-contour-petit) var(--b-encre); paint-order:stroke fill; white-space:nowrap; animation:edgeBlink var(--b-t-alerte) steps(2, jump-none) infinite; }
@keyframes edgeBlink { 50% { scale:1.15; rotate:-4deg; } }

/* ---------- Bandeaux géants READY? / GO! / GAME! ---------- */
.big-banner { position:absolute; inset:0; z-index:30; display:grid; place-items:center; pointer-events:none;
  font:400 clamp(120px, 24vh, 270px)/1 var(--b-display); color:var(--b-vinyle); -webkit-text-stroke:calc(var(--b-contour-grand) * 2) var(--b-encre);
  paint-order:stroke fill; text-shadow:0 .06em 0 var(--b-encre); }
.big-banner[hidden] { display:none; }
.big-banner.go { color:var(--b-alerte); }
.big-banner.game { color:var(--b-vinyle); text-shadow:0 .06em 0 var(--b-p1); }
.big-banner.slam { animation:slam var(--b-t-glisse) var(--b-claque) both; }
@keyframes slam { from { transform:scale(2.6) rotate(-8deg); opacity:0; } 50% { opacity:1; } to { transform:scale(1) rotate(-3deg); } }
.big-banner.leave { animation:bigLeave var(--b-t-decolle) var(--b-decolle) forwards; }
@keyframes bigLeave { from { transform:rotate(-3deg); } to { transform:rotate(12deg) translateY(-60vh); } }

/* ---------- Bandeaux existants : plus gros, lisibles de loin ---------- */
.center-banner.ko.p1 { background:var(--b-p1); }
.center-banner.ko.p2 { background:var(--b-p2); }
.floater.streak { color:var(--b-alerte); font-size:calc(var(--b-taille-degats) * .9); }

@media (prefers-reduced-motion: reduce) {
  .big-banner, .defend-head, .plate-pct.hit, .parrow-tag, .parrow-tip, .edge-warn, .help-edge, .wsticker-img { animation-duration:.01s !important; }
}
`;
