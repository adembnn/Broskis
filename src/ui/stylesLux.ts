// Feuille de style du lot LUX (interface pour joueur occasionnel) : HUD façon Smash, barre d'armes, aide à touches
// dessinées, invite de parade, bandeaux READY?/GO!/GAME!, fonds d'écran de menu, grilles à stickers.
// Même grammaire « Vinyle » que styles.ts (sticker : trait encre, marge vinyle, ombre dure) ; uniquement des --b-*.
export const LUX_CSS = `
/* Un élément masqué l'est vraiment, même s'il a une règle display (ex. .commentary en flex restait visible vide). */
.broskis-ui [hidden] { display:none !important; }
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
.wsticker-img { position:absolute; inset:0; display:block; width:100%; height:100%; object-fit:contain; user-select:none;
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

/* ---------- Présentation : la carte tient dans l'écran (720p compris) ---------- */
.reveal-card { width:min(760px, 100%); padding-top:18px; padding-bottom:16px; }
.reveal-card h2.b-title { font-size:clamp(34px, 6vh, 54px); margin-bottom:4px; }
.reveal-stage { min-height:0; margin:6px 0; }
.weapon-card.reveal-size { width:min(var(--b-card-w), calc((100vh - 330px) * 5 / 7)); }
.reveal-subtitle { margin:6px auto; max-width:52ch; font-size:clamp(15px, 2.3vh, 22px); }
.reveal-footer { gap:10px; }
.reveal-kicker.p2 { color:var(--b-p2-fonce); }

/* ---------- Carte d'arme : le sticker à la place du pictogramme ---------- */
.wc-category { display:inline-flex; align-items:center; gap:4px; text-transform:uppercase; }
.wc-category svg { width:13px; height:13px; }
.wc-illustration .wc-sticker { width:78%; height:84%; }
.wc-photo-wrap { width:34%; top:6%; right:5%; }

/* ---------- HUD scindé (temps réel) : une moitié par joueur, P1 à gauche, P2 à droite ---------- */
.hud-root { position:absolute; inset:0; z-index:5; }
.half { position:absolute; top:0; bottom:0; width:50%; }
.half.p1 { left:0; --pc:var(--b-p1); --pc-fonce:var(--b-p1-fonce); --pc-clair:var(--b-p1-clair); }
.half.p2 { left:50%; --pc:var(--b-p2); --pc-fonce:var(--b-p2-fonce); --pc-clair:var(--b-p2-clair); }
.hud-root.solo .half { left:0; width:100%; }
.hud-root.solo .half.p2 .ctrl, .hud-root.solo .half.p2 .wbar, .hud-root.solo .half.p2 .pring, .hud-root.solo .half.p2 .half-banner,
.hud-root.solo .half.p2 .half-edge { display:none; }
.half-bottom { position:absolute; left:14px; right:14px; bottom:14px; display:flex; flex-direction:column; align-items:flex-start; gap:10px; }
.half.p2 .half-bottom { align-items:flex-end; }
.hud-root.solo .half.p1 .half-bottom { align-items:center; }
.half-row { display:flex; align-items:flex-end; gap:12px; }
.half.p2 .half-row { flex-direction:row-reverse; }
.hud-root.solo .half.p1 .half-row { width:100%; justify-content:center; }
.hud-root.solo .half.p1 .plate { position:absolute; left:0; bottom:0; }
.split-sep { position:absolute; top:0; bottom:0; left:50%; width:6px; translate:-50% 0; background:var(--b-encre);
  box-shadow:-2px 0 0 var(--b-vinyle), 2px 0 0 var(--b-vinyle); display:none; }
.hud-root.split .split-sep { display:block; }

/* Encart du joueur */
.plate { position:relative; display:flex; align-items:center; gap:10px; width:clamp(210px, 30vh, 330px); padding:8px 14px 8px 10px;
  background:var(--b-papier); border:var(--b-trait) solid var(--b-encre); border-radius:var(--b-rayon); box-shadow:var(--b-sticker-shadow); }
.plate.p2 { flex-direction:row-reverse; text-align:right; padding:8px 10px 8px 14px; }
.plate-body { min-width:0; flex:1; display:grid; gap:2px; }
.plate-name { font:400 clamp(15px, 2.3vh, 24px)/1 var(--b-display); color:var(--pc-fonce); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.plate-pct { font-family:var(--b-display); font-size:clamp(44px, 8vh, 90px); line-height:.92; color:var(--pct-color, var(--b-vinyle));
  -webkit-text-stroke:var(--b-contour-grand) var(--b-encre); paint-order:stroke fill; white-space:nowrap; }
.plate-pct .pct-sign { font-size:.5em; margin-left:.04em; }
.plate-pct.hit { animation:pctHit 360ms var(--b-sortie); }
@keyframes pctHit { 0% { transform:scale(1.35) translateX(0); } 20% { transform:scale(1.25) translateX(-7px); } 40% { transform:scale(1.15) translateX(6px); }
  60% { transform:scale(1.07) translateX(-4px); } 80% { transform:scale(1.02) translateX(2px); } 100% { transform:none; } }
.plate.p1 .plate-pct { transform-origin:left center; }
.plate.p2 .plate-pct { transform-origin:right center; }
.plate-stocks { display:flex; gap:6px; }
.plate.p2 .plate-stocks { justify-content:flex-end; }
.stock { width:16px; height:16px; border-radius:50%; background:var(--pc); border:2.5px solid var(--b-encre); }
.stock.lost { background:transparent; border-style:dashed; opacity:.45; }
.plate-stocks.lost-one { animation:stickerIn var(--b-t-glisse) var(--b-claque); }
.plate-bro { position:absolute; left:18%; right:18%; bottom:-11px; height:14px; border:2.5px solid var(--b-encre); border-radius:8px; background:var(--b-carton); overflow:hidden; display:none; }
.plate-bro.on { display:block; }
.plate-bro i { position:absolute; inset:0; transform-origin:left; transform:scaleX(0); background:var(--b-alerte); transition:transform var(--b-t-snap) var(--b-sortie); }
.plate-bro .bro-label { position:relative; display:block; font:800 9px/9px var(--b-body); text-align:center; }
.plate-bro.ready i { background:repeating-linear-gradient(45deg, var(--b-alerte) 0 var(--b-stripe), var(--b-encre) var(--b-stripe) calc(var(--b-stripe) * 2)); }
.plate-bro.ready .bro-label { color:var(--b-vinyle); -webkit-text-stroke:2px var(--b-encre); paint-order:stroke fill; }
.plate-block { position:absolute; top:-14px; padding:1px 9px; font:400 15px/1.3 var(--b-display); color:var(--b-vinyle); background:var(--b-encre);
  border-radius:8px; display:none; }
.plate.p1 .plate-block { left:8px; }
.plate.p2 .plate-block { right:8px; }
.plate.blocking .plate-block { display:block; animation:stickerIn var(--b-t-snap) var(--b-claque); }

/* ---------- Portraits (grille, encarts, fin) ---------- */
.portrait { position:relative; display:grid; place-items:center; overflow:hidden; border-radius:50%; background:var(--pc, var(--b-carton));
  border:var(--b-trait) solid var(--b-encre); aspect-ratio:1; }
.portrait.p1 { --pc:var(--b-p1); }
.portrait.p2 { --pc:var(--b-p2); }
.portrait-img { width:100%; height:100%; object-fit:cover; }
.portrait-img.face { object-fit:contain; padding:8%; }
.portrait-initial { font:400 2.4em/1 var(--b-display); color:var(--b-vinyle); -webkit-text-stroke:5px var(--b-encre); paint-order:stroke fill; }
.plate-portrait { width:clamp(56px, 9.5vh, 100px); flex:none; font-size:clamp(12px, 1.8vh, 18px); }
.plate-portrait .portrait { width:100%; box-shadow:0 0 0 4px var(--b-vinyle), 0 0 0 6px var(--b-encre); }

/* Barre des 3 armes : sticker, touche, recharge en secondes (anneau), charge du tir */
.wbar { position:relative; display:flex; gap:clamp(8px, 1.3vh, 14px); align-items:flex-end; }
.wcard { position:relative; width:clamp(90px, 13.5vh, 150px); padding:9px 6px 6px; display:grid; justify-items:center; gap:2px;
  background:var(--b-papier); border:var(--b-trait) solid var(--b-encre); border-radius:12px; box-shadow:0 5px 0 var(--b-encre);
  transition:transform var(--b-t-snap) var(--b-claque), background var(--b-t-snap); }
.wcard-art { width:100%; height:clamp(40px, 6.4vh, 70px); }
.wcard-name { max-width:100%; font:800 clamp(11px, 1.6vh, 17px)/1.1 var(--b-body); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wcard-does { display:flex; align-items:center; gap:4px; max-width:100%; font:800 clamp(10px, 1.4vh, 15px)/1.1 var(--b-body); color:var(--b-muted); white-space:nowrap; overflow:hidden; }
.wcard-does-text { overflow:hidden; text-overflow:ellipsis; }
.wcard-ico { display:inline-grid; place-items:center; width:1.35em; height:1.35em; padding:2px; border-radius:50%; background:var(--accent); border:1.5px solid var(--b-encre); color:var(--b-encre); }
.wcard-ico svg { width:100%; height:100%; }
.wcard-keyslot { position:absolute; top:-13px; left:-10px; z-index:2; }
.wcard-key { font-size:clamp(17px, 2.6vh, 26px); }
.wcard.selected { transform:translateY(-12px) scale(1.06); background:var(--pc-clair);
  box-shadow:0 0 0 5px var(--pc), 0 0 0 7px var(--b-encre), 0 6px 0 7px var(--b-encre); }
.wcard.selected .key { background:var(--b-alerte); }
.wcard-cd { position:absolute; inset:0; border-radius:9px; display:none; place-items:center;
  background:conic-gradient(color-mix(in srgb, var(--b-encre) 62%, transparent) calc(var(--cd, 1) * 1turn), color-mix(in srgb, var(--b-papier) 30%, transparent) 0); }
.wcard.cooling .wcard-cd { display:grid; }
.wcard.cooling .wcard-art { filter:grayscale(1); }
.wcard-cd-num { font:400 clamp(22px, 3.6vh, 38px)/1 var(--b-display); color:var(--b-vinyle); -webkit-text-stroke:var(--b-contour-petit) var(--b-encre); paint-order:stroke fill; }
.wcard.ready-pop { animation:stickerIn var(--b-t-glisse) var(--b-claque); }
.wcard-charge { position:absolute; left:6px; right:6px; bottom:-12px; height:10px; border:2px solid var(--b-encre); border-radius:6px; background:var(--b-carton);
  overflow:hidden; visibility:hidden; }
.wcard-charge.on { visibility:visible; }
.wcard-charge i { position:absolute; inset:0; transform-origin:left; transform:scaleX(0); background:var(--pc); }

/* Carte de commandes (vraies touches du joueur) : discrète, grande au 1er match */
.ctrl { display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; max-width:100%; padding:5px 12px; font:800 clamp(12px, 1.9vh, 19px)/1.1 var(--b-body);
  background:color-mix(in srgb, var(--b-papier) 84%, transparent); border:2px solid var(--b-encre); border-radius:12px; }
.ctrl.big { gap:8px 18px; padding:10px 16px; font-size:clamp(15px, 2.6vh, 27px); background:var(--b-papier); border-width:var(--b-trait); box-shadow:0 5px 0 var(--b-encre); }
.ctrl-item { display:inline-flex; align-items:center; gap:.35em; white-space:nowrap; }
.ctrl-keys { display:inline-flex; gap:.15em; }
.ctrl-hint { display:inline-flex; align-items:center; gap:.3em; color:var(--b-muted); font-size:.85em; }

/* Bandeaux dans la moitié du joueur : PERFECT!, BLOCKED, EDGE! */
.half-banner { position:absolute; left:50%; top:30%; translate:-50% 0; font:400 clamp(48px, 9vh, 96px)/1 var(--b-display); color:var(--b-alerte);
  -webkit-text-stroke:var(--b-contour-grand) var(--b-encre); paint-order:stroke fill; white-space:nowrap; }
.half-banner.good { color:var(--b-vinyle); font-size:clamp(34px, 6vh, 64px); }
.half-banner.enter { animation:stickerIn var(--b-t-snap) var(--b-claque); }
.half-edge { position:absolute; left:50%; top:20%; translate:-50% 0; padding:2px 16px; font:400 clamp(30px, 5vh, 52px)/1.1 var(--b-display); color:var(--b-vinyle);
  background:var(--b-p1); border:var(--b-trait) solid var(--b-encre); border-radius:12px; box-shadow:0 5px 0 var(--b-encre);
  animation:edgeBlink var(--b-t-alerte) steps(2, jump-none) infinite; }
@keyframes edgeBlink { 50% { scale:1.12; rotate:-3deg; } }

/* Anneau de parade autour du projectile entrant, dans la vue du joueur visé */
.pring { position:absolute; left:50%; top:58%; width:0; height:0; z-index:3; pointer-events:none; }
.pring-ring { position:absolute; left:-70px; top:-70px; width:140px; height:140px; border-radius:50%; border:8px solid var(--b-alerte);
  box-shadow:0 0 0 3px var(--b-encre), inset 0 0 0 3px var(--b-encre); animation:ringClose linear forwards; }
@keyframes ringClose { from { transform:scale(2.6); opacity:.35; } to { transform:scale(.55); opacity:1; } }
.pring-key { position:absolute; left:0; top:0; translate:-50% -50%; }
.pring-key .key { font-size:clamp(20px, 3.4vh, 34px); background:var(--b-alerte); }

/* Chrono du match et sous-titre de l'animateur, en haut au centre (sur le séparateur) */
.hud-top { position:absolute; top:10px; left:50%; translate:-50% 0; display:flex; flex-direction:column; align-items:center; gap:8px; z-index:4; }
.match-clock { padding:2px 16px; font:400 clamp(24px, 4vh, 40px)/1.15 var(--b-display); color:var(--b-vinyle); background:var(--b-encre);
  border:var(--b-trait) solid var(--b-vinyle); border-radius:12px; box-shadow:0 0 0 3px var(--b-encre); font-variant-numeric:tabular-nums; }
.match-clock.late { background:var(--b-p1); }
.hud-top .commentary { position:relative; top:auto; left:auto; transform:none; align-items:center; gap:10px; max-width:min(760px, 70vw);
  padding:5px 18px 5px 6px; border-radius:999px; background:var(--b-papier); box-shadow:0 4px 0 var(--b-encre); }
.hud-top .commentary-portrait { width:40px; height:40px; min-width:40px; border-width:2px; }
.hud-top .commentary-bubble { font-size:clamp(16px, 2.5vh, 26px); line-height:1.15; -webkit-line-clamp:2; }

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

.cat-tag.does { text-transform:none; letter-spacing:0; font-size:clamp(13px, 1.8vh, 19px); }
.cat-tag.does .cat-badge { width:1.6em; height:1.6em; min-width:1.6em; }
.big-banner.count { color:var(--b-vinyle); font-size:clamp(150px, 30vh, 330px); }

/* ---------- Provocation de l'IA (gameplay/ai/taunt-bubble.ts) : petite bulle discrète au-dessus du perso ---------- */
.taunt-bubble { position:fixed; z-index:4; max-width:240px; padding:5px 10px; pointer-events:none; font:800 15px/1.2 var(--b-body); color:var(--b-encre);
  background:var(--b-papier); border:2px solid var(--b-encre); border-radius:12px; box-shadow:0 3px 0 var(--b-encre);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

/* ---------- Choix des persos façon Smash : grille de portraits + encarts P1/P2 ---------- */
.fighters-card { width:min(1100px, 100%); }
.fighter-grid { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:16px; margin:4px 0 18px; }
.fighter-tile { position:relative; display:grid; justify-items:center; gap:6px; padding:10px 8px 8px; text-align:center; transform:none !important; }
.fighter-tile:hover, .fighter-tile:focus-visible { transform:translateY(-4px) !important; }
.fighter-tile .portrait { width:min(150px, 100%); background:var(--b-carton); }
.fighter-tile-name { font:400 clamp(17px, 2.5vh, 24px)/1.1 var(--b-display); }
.fighter-tokens { position:absolute; top:-12px; right:-8px; display:flex; gap:4px; }
.ptoken.small { min-width:44px; height:32px; font-size:20px; }
.fighter-tile.snap-tile { background:var(--b-alerte); align-content:center; }
.fighter-tile.snap-tile .snap-icon { width:96px; height:84px; }
.fighter-side:not(:empty) { margin:0 0 16px; }
.fighter-panels { display:grid; grid-template-columns:1fr 1fr; gap:22px; }
.fighter-panel { position:relative; display:flex; align-items:center; gap:14px; min-height:112px; padding:12px 16px; text-align:left;
  border:var(--b-trait) solid var(--b-encre); border-radius:var(--b-rayon); box-shadow:0 5px 0 var(--b-encre); cursor:pointer; }
.fighter-panel.p1 { background:var(--b-p1-clair); }
.fighter-panel.p2 { background:var(--b-p2-clair); flex-direction:row-reverse; text-align:right; }
.fighter-panel.picking { outline:4px dashed var(--b-encre); outline-offset:4px; }
.fighter-panel .ptoken { position:absolute; top:-18px; }
.fighter-panel.p1 .ptoken { left:12px; }
.fighter-panel.p2 .ptoken { right:12px; }
.fighter-panel .portrait { width:92px; flex:none; }
.fighter-panel-text { display:grid; gap:4px; min-width:0; flex:1; }
.fighter-panel-name { font:400 clamp(24px, 3.6vh, 36px)/1 var(--b-display); }
.fighter-panel .fighter-quote { margin:0; font-size:15px; font-style:italic; }
.fighter-panel-empty { flex:1; font:400 24px/1 var(--b-display); color:var(--b-muted); text-align:center; }
.voice-btn { flex:none; }
.voice-badge { flex:none; padding:4px 10px; font:800 13px var(--b-body); background:var(--b-alerte); border:2px solid var(--b-encre); border-radius:999px; }
.ready-bar.go { animation:readyPulse 900ms var(--b-sortie) infinite; }
@keyframes readyPulse { 50% { transform:scale(1.06); } }
.fighter-confirm { display:grid; justify-items:center; gap:8px; }
.fighter-confirm .portrait { width:150px; }
.voice-clone-panel { display:grid; justify-items:center; gap:8px; padding:12px; }
.voice-script { max-width:52ch; font:800 20px/1.3 var(--b-body); }
.voice-ring { position:relative; width:90px; height:90px; border-radius:50%; overflow:hidden; border:var(--b-trait) solid var(--b-encre); background:var(--b-carton); }
.voice-ring-fill { position:absolute; left:0; right:0; bottom:0; height:0; background:var(--b-p1); }

/* ---------- Écran de fin : le gagnant en grand, puis chacun ---------- */
.end-card { width:min(900px, 100%); }
.end-hero { display:grid; justify-items:center; gap:6px; margin:0 0 16px; }
.end-hero > .portrait { width:clamp(110px, 18vh, 170px); box-shadow:0 0 0 6px var(--b-vinyle), 0 0 0 9px var(--b-encre); }
.end-title { display:flex; align-items:center; gap:12px; }
.end-name { font:400 clamp(40px, 7vh, 72px)/1 var(--b-display); }
.end-card.p1 .end-name { color:var(--b-p1); }
.end-card.p2 .end-name { color:var(--b-p2); }
.end-name { -webkit-text-stroke:var(--b-contour-petit) var(--b-encre); paint-order:stroke fill; }
.end-wins { font:400 clamp(56px, 10vh, 104px)/.9 var(--b-display); color:var(--b-alerte); -webkit-text-stroke:var(--b-contour-grand) var(--b-encre);
  paint-order:stroke fill; transform:rotate(-4deg); animation:slam var(--b-t-glisse) var(--b-claque) both; }
.end-cols { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
.end-col { display:grid; gap:8px; padding:12px 14px; border:var(--b-trait) solid var(--b-encre); border-radius:var(--b-rayon); box-shadow:0 5px 0 var(--b-encre); }
.end-col.p1 { background:var(--b-p1-clair); }
.end-col.p2 { background:var(--b-p2-clair); }
.end-col-head { display:flex; align-items:center; gap:10px; }
.end-col-head .portrait { width:54px; flex:none; }
.end-col-name { font:400 24px/1 var(--b-display); }
.end-stats { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
.end-stat { display:grid; justify-items:center; }
.end-stat-value { font:400 clamp(28px, 4.6vh, 44px)/1 var(--b-display); color:var(--b-vinyle); -webkit-text-stroke:var(--b-contour-petit) var(--b-encre); paint-order:stroke fill; }
.end-stat-label { font:800 13px var(--b-body); }
.end-mvp { display:flex; align-items:center; justify-content:center; gap:12px; margin:16px 0 0; }
.end-mvp-sticker { width:74px; height:60px; }
.end-mvp-label { padding:2px 10px; font:800 13px/1.4 var(--b-body); background:var(--b-alerte); border:2px solid var(--b-encre); border-radius:999px; }
.end-mvp-name { font:400 26px/1 var(--b-display); }
.end-mvp-total { font-weight:800; }
.end-actions .b-btn.cta .key { font-size:.8em; margin-right:.3em; }

/* ---------- Écran-titre : logo sticker, une phrase, les vraies armes collées autour ---------- */
.title-screen { overflow:hidden; }
.title-screen .b-card.title-card { position:relative; z-index:1; width:auto; max-width:92vw; overflow:visible; background:none; border:none; box-shadow:none; padding:0; }
.title-screen .title-logo { margin:0 0 .12em; font-size:clamp(110px, 25vh, 260px); line-height:.9; color:var(--b-alerte);
  -webkit-text-stroke:calc(var(--b-contour-grand) * 1.6) var(--b-encre); paint-order:stroke fill; text-shadow:0 .06em 0 var(--b-encre);
  transform:rotate(-4deg); animation:slam var(--b-t-glisse) var(--b-claque) both; }
.title-tagline { display:inline-block; margin:0 0 26px; padding:8px 20px; font:800 clamp(20px, 3.4vh, 34px)/1.2 var(--b-body); background:var(--b-papier);
  border:var(--b-trait) solid var(--b-encre); border-radius:12px; box-shadow:0 5px 0 var(--b-encre); transform:rotate(1.5deg); }
.title-actions { display:flex; justify-content:center; align-items:center; gap:16px; flex-wrap:wrap; }
.title-play { display:grid; justify-items:center; gap:2px; padding:12px 44px 10px; }
.title-play-main { font:400 clamp(40px, 7vh, 64px)/1 var(--b-display); }
.title-play-sub { font:800 15px/1.2 var(--b-body); }
.diff-label { font:400 24px/1 var(--b-display); }
.diff-btn.hardcore { background:var(--b-encre); color:var(--b-vinyle); }
.title-stickers { position:absolute; inset:0; pointer-events:none; }
.title-sticker { position:absolute; width:clamp(110px, 20vh, 210px); height:clamp(90px, 16vh, 170px);
  transform:translate(-50%, -50%) rotate(var(--r, 0deg)); animation:stickerDrop 420ms var(--b-claque) both; }
@keyframes stickerDrop { from { transform:translate(-50%, -50%) rotate(var(--r, 0deg)) scale(1.7); opacity:0; } to { transform:translate(-50%, -50%) rotate(var(--r, 0deg)) scale(1); opacity:1; } }

/* ---------- Choix de l'arène : grandes vignettes peintes ---------- */
.map-card { width:min(1100px, 100%); }
.map-grid { grid-template-columns:repeat(3, minmax(0, 1fr)); gap:22px; }
.map-tile { display:grid; gap:8px; padding:10px 10px 12px; text-align:left; }
.map-thumb { aspect-ratio:16 / 9; overflow:hidden; border:var(--b-trait) solid var(--b-encre); border-radius:10px; }
.map-thumb svg { width:100%; height:100%; }
.map-tile-head { display:flex; align-items:center; gap:10px; }
.map-tile-head .key { font-size:22px; }
.map-tile-name { margin:0; font-size:clamp(20px, 3.2vh, 30px); }
.map-tile-blurb { margin:0; font-size:clamp(13px, 1.9vh, 17px); }

/* ---------- Settings → Controls ---------- */
.settings-overlay { z-index:40; }
.settings-card { width:min(820px, 100%); text-align:left; }
.settings-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:8px; }
.settings-head .b-title { margin:0; }
.settings-tab { padding:3px 12px; font:800 15px var(--b-body); border:2px solid var(--b-encre); border-radius:999px; background:var(--b-alerte); }
.controls-grid { display:grid; grid-template-columns:minmax(0, 1.4fr) 1fr 1fr; gap:6px 14px; align-items:center; }
.cg-head { font:400 26px/1 var(--b-display); text-align:center; color:var(--b-vinyle); border:var(--b-trait) solid var(--b-encre); border-radius:10px; padding:2px 0; }
.cg-head.p1 { background:var(--b-p1); }
.cg-head.p2 { background:var(--b-p2); }
.cg-label { font:800 clamp(13px, 2vh, 17px)/1.2 var(--b-body); }
.cg-cell { display:grid; gap:2px; }
.key-btn { pointer-events:auto; min-height:36px; padding:4px 10px; font:400 18px/1.1 var(--b-display); color:var(--b-encre); cursor:pointer;
  background:var(--b-vinyle); border:2.5px solid var(--b-encre); border-radius:9px; box-shadow:0 4px 0 var(--b-encre); }
.key-btn:hover { background:var(--b-papier); }
.key-btn.listening { background:var(--b-alerte); animation:readyPulse 700ms var(--b-sortie) infinite; }
.key-btn.conflict { border-color:var(--b-danger); color:var(--b-danger); }
.cg-conflict { font:800 11px/1.2 var(--b-body); color:var(--b-danger); }
.settings-note { margin:10px 0 0; font-size:14px; color:var(--b-muted); }
.title-links { display:flex; justify-content:center; gap:18px; margin-top:12px; }

/* ---------- Bandeaux existants : centrés pour de bon, lisibles de loin ---------- */
.center-banner { translate:-50% 0; }
.center-banner.ko.p1 { background:var(--b-p1); }
.center-banner.ko.p2 { background:var(--b-p2); }
.floater.streak { color:var(--b-alerte); font-size:calc(var(--b-taille-degats) * .9); }

@media (prefers-reduced-motion: reduce) {
  .big-banner, .plate-pct.hit, .half-edge, .half-banner, .pring-ring, .wsticker-img { animation-duration:.01s !important; }
}
`;
