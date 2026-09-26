// Le Barde (commentateur) + score de Créativité + pénalité d'Écho.
//
// Barde : sur chaque moment clé (combo, parade, gros coup, premier sang, retournement, K.O., habitude détectée,
// incident du metteur en scène, première mondiale, taverne en feu…) une ligne LOCALE s'affiche tout de suite
// (banque de répliques, anti-répétition sur les 15 dernières). En parallèle on demande une ligne au LLM :
// si elle arrive en moins de 600 ms, elle remplace la ligne locale ; sinon elle est jetée. Une ligne en file
// depuis plus de 2 s est périmée et abandonnée. Affichage : bandeau parchemin dans la rangée « Manche » du dock.
// Voix : window.speechSynthesis (fr-FR), coupée si le son du jeu est coupé ; toute phrase périmée est annulée.
//
// Créativité (calculée par le code, jamais par l'IA) à chaque action d'un joueur humain :
//   nouveauté (signature élément/forme ou accessoire/verbe jamais vue : +30, vue une fois : +12),
//   décor (+20 accessoire, +15 sort visant un objet), variété (3 types différents sur les 4 dernières actions : +10),
//   combos chimiques du joueur (+25 nouveau, +8 déjà vu ; enchaînement de 2 combos différents en 4 s : +15).
// Écho : un sort qui ressemble aux 5 précédents du même lanceur (même élément, même forme, mêmes mots) perd de la
//   puissance : ×(1 − 0,15 × nb de sorts similaires), plancher ×0,55. Appliqué via ctx.modifiers (dégâts de sort).
//
// API : ctx.bard = { say(text, pri), history, current, stats } ; ctx.creativity = { total(id), history, echoOf(id) }
// Événements émis : creativity:score { by, points, reasons }, echo { by, mult, count }, bard:line { text, source }
import { isMuted } from '../audio.js';
import { llm, cleanLine } from './llm.js';
import { LAWS, WEATHERS } from '../oracle.js';

const REPEAT = 15;
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
function jaccard(a, b) { if (!a.size && !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); }

const BANK = {
  round: ['Manche {n} ! {adv} entre dans l\'arène.', 'Place, place ! Voici {adv}.', 'Les chopes se lèvent : {adv} entre en piste.'],
  firstBloodTu: ['Premier sang pour toi !', 'Tu ouvres le bal !', 'Et c\'est toi qui frappes en premier !'],
  bigHitTu: ['Quel coup ! Tu as senti passer celui-là.', 'Aïe ! Tu vois des étoiles.', 'Coup énorme… et c\'est pour toi !', 'Ça, ça va te laisser une marque.'],
  koWin: ['K.O. ! Tu remportes la manche !', 'Rideau ! Victoire pour toi !', '{cible} mord la sciure. Tu gagnes !'],
  koLose: ['K.O. ! {qui} remporte la manche !', 'Rideau ! Victoire de {qui} !', 'Tu mords la sciure. {qui} gagne !'],
  comebackTu: ['Retournement ! Tu reviens de loin !', 'Incroyable ! Tu reprends l\'avantage !', 'On te croyait fini, et tu renais !'],
  firstBlood: ['Premier sang pour {qui} !', '{qui} ouvre le bal !', 'Et c\'est {qui} qui frappe en premier !'],
  combo: ['{combo} ! La chimie a parlé.', '{combo} ! Quelle recette !', '{combo} ! Les alchimistes applaudissent.', '{combo} ! Ça, c\'est du grand art.', 'Oh ! {combo} ! On n\'avait pas vu ça depuis la dernière foire.'],
  parry: ['Parade ! Retour à l\'envoyeur !', 'Bloqué net ! Quels réflexes !', 'Parade magistrale !', 'Il le renvoie comme une chope vide !'],
  bigHit: ['Quel coup ! {cible} a senti passer celui-là.', 'Aïe ! {cible} voit des étoiles.', 'Coup énorme sur {cible} !', 'Ça, ça va laisser une marque.'],
  ko: ['K.O. ! {qui} remporte la manche !', 'Rideau ! Victoire de {qui} !', '{cible} mord la sciure. {qui} gagne !'],
  comeback: ['Retournement ! {qui} revient de loin !', 'Incroyable ! {qui} reprend l\'avantage !', 'On le croyait fini, {qui} renaît !'],
  habit: ['{adv} a repéré ton habitude : {label} !', 'Attention, {adv} connaît ton truc : {label}.', 'Trop prévisible ! {adv} a compris : {label}.'],
  counter: ['{adv} te coupe l\'herbe sous le pied !', 'Contre préparé ! {adv} avait tout prévu.'],
  lustre: ['Levez les yeux : le lustre a le hoquet !', 'Ce lustre grince comme ma vieille charrette…'],
  lights: ['Qui a soufflé les bougies ?', 'Noir complet ! Visez les étincelles !'],
  barrel: ['Le patron lance la tournée… en tonneau !', 'Un tonneau offert par la maison !'],
  wind: ['Courant d\'air ! Fermez cette porte !', 'Le vent se mêle du duel !'],
  rats: ['Des rats ! Levez les pieds !', 'Les rats veulent leur part du spectacle !'],
  mugs: ['Il pleut des chopes à l\'étage !', 'Attention la tête, ça tombe d\'en haut !'],
  brawl: ['Bagarre au comptoir ! Ça déborde !', 'Les clients s\'y mettent aussi !'],
  first: ['Première mondiale ! « {nom} », jamais vu !', 'Du jamais vu ! « {nom} » entre dans la légende !', 'Notez la date : « {nom} » est né ce soir !'],
  echo: ['Encore ce sort ? L\'écho l\'affaiblit.', 'Déjà vu ! La magie s\'essouffle.', 'Toujours la même chanson… et moins fort.'],
  fire: ['La taverne est en feu ! Tout le monde debout !', 'Ambiance maximale ! Les coups vont faire mal !'],
  strategy: ['{txt}'],
  // moments « wow » (src/wow) et réflexes souris (src/input)
  law: ['Nouvelle loi : « {loi} » ! La physique n\'a qu\'à suivre.', 'Le règlement change : « {loi} » !', 'Loi de la taverne : « {loi} ». Personne n\'a voté !'],
  lawBroken: ['Le panneau vole en éclats ! Loi abrogée !', 'Crac ! Fin de la loi, la physique respire.'],
  weather: ['Météo d\'intérieur : {meteo} ! Le patron n\'est pas content.', '{meteo} sous les poutres ! Quelle soirée !'],
  possess: ['Possession ! On dirait que {objet} a une âme.', 'Possession ! {objet} a une âme, et elle est de mauvaise humeur.'],
  mirror: ['Sort miroir ! « {txt} » change de camp !', 'Miroir, mon beau miroir… retour à l\'envoyeur !'],
  summon: ['Invocation ! Qui a commandé ça ?', 'Ça tombe du plafond ! Invocation réussie !'],
  crit: ['COUP CRITIQUE ! On arrête tout, on admire.', 'Critique ! La taverne retient son souffle !'],
  throw: ['Lancer de {objet} ! Pleine poire !', 'Et hop, {objet} en vol !'],
  table: ['La table se dresse ! Rempart de chêne !', 'Table-bouclier ! Le mobilier prend parti.'],
  glyph: ['Glyphe tracé : {nom} ! Joli coup de poignet.', 'Un {nom} parfait ! Les runes approuvent.'],
};
const PRI = { law: 3, lawBroken: 3, weather: 3, possess: 3, mirror: 3, summon: 2, crit: 4, throw: 2, table: 2, glyph: 2, round: 2, firstBlood: 3, firstBloodTu: 3, combo: 3, parry: 3, bigHit: 2, bigHitTu: 2, ko: 5, koWin: 5, koLose: 5, comeback: 4, comebackTu: 4, habit: 4, counter: 2, first: 4, echo: 2, fire: 4, strategy: 3, director: 3 };

export function installCommentator(ctx) {
  const { p1, p2 } = ctx.fighters;
  const human = (id) => id === 'p1' || (ctx.duel?.state.mode === 'hotseat' && id === 'p2');
  const nameOf = (id) => (id === 'p1' && ctx.duel?.state.mode === 'tournament' ? 'Toi' : ctx.fighters[id]?.name || '?');
  const fighting = () => ctx.duel?.state.phase === 'fight';
  const isTu = (id) => id === 'p1' && ctx.duel?.state.mode === 'tournament'; // le joueur du tournoi : on le tutoie

  // ======================= CRÉATIVITÉ & ÉCHO =======================
  const crea = { totals: { p1: 0, p2: 0 }, sigs: { p1: new Map(), p2: new Map() }, recent: { p1: [], p2: [] }, combos: { p1: new Set(), p2: new Set() }, lastCombo: { p1: null, p2: null }, echo: { p1: null, p2: null }, history: [] };
  function score(by, points, reasons) {
    if (!points) return;
    crea.totals[by] += points;
    crea.history.push({ t: +ctx.time.toFixed(2), by, points, reasons });
    if (crea.history.length > 60) crea.history.shift();
    const f = ctx.fighters[by];
    ctx.floater(f, `+${points} créativité`, 'crea');
    ctx.events.emit('creativity:score', { by, points, reasons });
  }
  ctx.events.on('action:start', ({ caster, action, text }) => {
    if (!human(caster) || !action) return;
    const sp = action.kind === 'spell' ? action.spell : null;
    const group = action.kind === 'prop' ? (ctx.props.byId(action.prop.id)?.group || action.prop.id) : null;
    // moments « wow » (law, weather, possess, summon, mirror) : signature propre à leur contenu
    const wowSig = () => `wow:${action.kind}:${action.law || action.weather || action.propId || [action.base, ...(action.adjectives || [])].filter(Boolean).join('+') || ''}`;
    const sig = sp ? `${sp.element}/${sp.form}` : action.kind === 'prop' ? `prop:${group}.${action.prop?.verb}` : wowSig();
    const reasons = [];
    let pts = 0;
    // Écho (sorts offensifs uniquement)
    let mult = 1, count = 0;
    if (sp && sp.form !== 'bouclier' && sp.form !== 'soin') {
      const tk = tokens(`${text || ''} ${sp.name}`);
      for (const r of crea.recent[caster].slice(-5)) {
        if (!r.sp) continue;
        const sim = (r.sp.element === sp.element ? 0.45 : 0) + (r.sp.form === sp.form ? 0.35 : 0) + 0.2 * jaccard(tk, r.tk);
        if (sim >= 0.75) count++;
      }
      mult = Math.max(0.55, 1 - 0.15 * count);
      crea.recent[caster].push({ sp, tk, sig, t: ctx.time });
    } else crea.recent[caster].push({ sp: null, sig, t: ctx.time });
    if (crea.recent[caster].length > 8) crea.recent[caster].shift();
    crea.echo[caster] = mult < 1 ? { mult, until: ctx.time + 6 } : null;
    if (mult < 1) {
      ctx.later(0.15, () => ctx.floater(ctx.fighters[caster], `Écho ×${mult.toFixed(2).replace('.', ',')}`, 'echo'));
      ctx.events.emit('echo', { by: caster, mult, count });
    }
    // Nouveauté
    const seen = crea.sigs[caster].get(sig) || 0;
    crea.sigs[caster].set(sig, seen + 1);
    if (mult === 1) {
      if (seen === 0) { pts += 30; reasons.push('nouveau'); } else if (seen === 1) { pts += 12; reasons.push('variante'); }
    }
    // Décor
    if (action.kind === 'prop') { pts += 20; reasons.push('décor'); }
    else if (!sp) { pts += 15; reasons.push('moment wow'); }
    else if (sp?.target && sp.target !== 'p1' && sp.target !== 'p2') { pts += 15; reasons.push('vise le décor'); }
    // Variété
    const last4 = crea.recent[caster].slice(-4).map((r) => (r.sp ? r.sp.element : 'decor'));
    if (last4.length >= 4 && new Set(last4).size >= 3) { pts += 10; reasons.push('variété'); }
    if (pts) ctx.later(0.4, () => score(caster, pts, reasons));
  });
  ctx.events.on('chem:reaction', ({ by, combo }) => {
    if (!human(by) || !combo || !fighting()) return;
    const isNew = !crea.combos[by].has(combo);
    crea.combos[by].add(combo);
    let pts = isNew ? 25 : 8;
    const reasons = ['combo'];
    const lc = crea.lastCombo[by];
    if (lc && lc.combo !== combo && ctx.time - lc.t < 4) { pts += 15; reasons.push('enchaînement'); }
    crea.lastCombo[by] = { combo, t: ctx.time };
    score(by, pts, reasons);
  });
  ctx.modifiers.add('damage', (f, a, info) => {
    const e = info.by && crea.echo[info.by];
    if (!e || info.kind !== 'spell' || ctx.time > e.until || f.id === info.by) return a;
    return a * e.mult;
  });
  ctx.events.on('duel:start', ({ mode }) => {
    if (mode === 'tournament' || mode === 'hotseat') for (const id of ['p1', 'p2']) { crea.totals[id] = 0; crea.sigs[id].clear(); crea.recent[id].length = 0; crea.combos[id].clear(); crea.echo[id] = null; }
  });
  ctx.creativity = { total: (id) => crea.totals[id] || 0, history: crea.history, echoOf: (id) => crea.echo[id]?.mult ?? 1, state: crea };

  // ======================= LE BARDE =======================
  const el = document.createElement('div');
  el.className = 'bard';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<span class="who">Le Barde</span><span class="line"></span>';
  (ctx.ui.dock.querySelector('.chips') || ctx.ui.dock).appendChild(el);
  const lineEl = el.querySelector('.line');
  const bard = { history: [], current: null, queue: [], stats: { local: 0, llm: 0, llmLate: 0, dropped: 0, spoken: 0 }, hideAt: 0 };
  const recent = [];

  function fill(tpl, v) { return tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? ''); }
  function local(kind, v) {
    const bank = BANK[kind] || [kind];
    const opts = bank.map((t) => fill(t, v));
    const fresh = opts.filter((t) => !recent.includes(t));
    if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
    // tout a servi récemment : la plus ancienne
    return opts.sort((a, b) => recent.indexOf(a) - recent.indexOf(b))[0];
  }
  function remember(text) { recent.push(text); if (recent.length > REPEAT) recent.shift(); }

  function event(kind, v = {}, desc = '') {
    const pri = PRI[kind] ?? 2;
    const text = local(kind, v);
    const item = { kind, text, pri, t: performance.now(), gt: ctx.time, desc: desc || text, source: 'local', v };
    const cur = bard.current;
    const busy = cur && performance.now() - cur.shownAt < 1800;
    if (!busy || pri > cur.pri) show(item);
    else { bard.queue.push(item); bard.queue.sort((a, b) => b.pri - a.pri); if (bard.queue.length > 4) { bard.queue.length = 4; bard.stats.dropped++; } }
  }

  function show(item) {
    bard.current = item;
    item.shownAt = performance.now();
    item.id = (bard.seq = (bard.seq || 0) + 1);
    setLine(item.text);
    bard.stats.local++;
    bard.hideAt = performance.now() + 4200;
    remember(item.text);
    bard.history.push({ t: item.gt, text: item.text, source: 'local', kind: item.kind });
    if (bard.history.length > 40) bard.history.shift();
    ctx.events.emit('bard:line', { text: item.text, source: 'local', kind: item.kind });
    // LLM : remplacement si réponse < 600 ms ; la voix attend ce verdict (jamais plus de 600 ms)
    if (llm.available() && item.kind !== 'strategy') {
      const id = item.id;
      const t0 = performance.now();
      let decided = false;
      const speakLocal = setTimeout(() => { decided = true; speak(item); }, 600);
      llm.json(`Tu es le Barde, commentateur enjoué d'un duel de sorciers dans une taverne cartoon (public familial).
Commente cet instant en UNE phrase drôle, 14 mots maximum, en français, sans guillemets ni emoji.
Instant : ${item.desc}. Duel : ${nameOf('p1')} (${p1.hp} PV) contre ${nameOf('p2')} (${p2.hp} PV).${isTu('p1') ? ' Le joueur humain s\'appelle « Toi » : tutoie-le.' : ''}
Réponds UNIQUEMENT en JSON : {"ligne":"…"}`, { timeoutMs: 2000 }).then((raw) => {
        const dt = performance.now() - t0;
        const text = cleanLine(raw?.ligne, 110);
        if (!text) return;
        if (dt > 600 || decided || bard.current?.id !== id) { bard.stats.llmLate++; return; }
        if (recent.includes(text)) return;
        clearTimeout(speakLocal); decided = true;
        item.text = text; item.source = llm.name;
        setLine(text); remember(text);
        bard.stats.llm++;
        bard.history.push({ t: item.gt, text, source: item.source, kind: item.kind, replaced: true });
        ctx.events.emit('bard:line', { text, source: item.source, kind: item.kind });
        speak(item);
      });
    } else speak(item);
  }
  function setLine(text) {
    lineEl.textContent = text;
    el.hidden = false;
    el.classList.remove('idle', 'swap'); void el.offsetWidth; el.classList.add('swap');
  }

  // ---------- Voix ----------
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voice = null;
  function pickVoice() {
    try { const vs = synth.getVoices(); voice = vs.find((v) => /^fr(-|_)FR/i.test(v.lang)) || vs.find((v) => /^fr/i.test(v.lang)) || null; } catch { voice = null; }
  }
  if (synth) { pickVoice(); try { synth.addEventListener?.('voiceschanged', pickVoice); } catch { /* navigateur ancien */ } }
  function speak(item) {
    if (!synth || isMuted() || window.__noSpeech) return;
    if (performance.now() - item.t > 2000) return; // périmé
    try {
      synth.cancel(); // on coupe toute phrase précédente
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = 'fr-FR'; if (voice) u.voice = voice;
      u.rate = 1.1; u.pitch = 1.05; u.volume = 0.9;
      synth.speak(u);
      bard.stats.spoken++;
    } catch { /* voix indisponible */ }
  }
  // coupe la voix si le joueur coupe le son
  ctx.ui.mute?.addEventListener('click', () => setTimeout(() => { if (isMuted()) try { synth?.cancel(); } catch { /* rien */ } }, 0));

  // ---------- File + masquage ----------
  ctx.addSystem('bard', () => {
    const now = performance.now();
    if (bard.current && now - bard.current.shownAt > 1800 && bard.queue.length) {
      let next;
      while ((next = bard.queue.shift())) { if (now - next.t <= 2000) { show(next); break; } bard.stats.dropped++; }
    }
    if (bard.hideAt && now > bard.hideAt) { el.classList.add('idle'); bard.hideAt = 0; } // la dernière ligne reste, en retrait
  }, 91);

  // ---------- Déclencheurs ----------
  const round = { firstBlood: false, worst: { p1: 0, p2: 0 }, comeback: false };
  ctx.events.on('duel:fight', ({ index }) => {
    Object.assign(round, { firstBlood: false, worst: { p1: 0, p2: 0 }, comeback: false });
    event('round', { n: index + 1, adv: p2.name }, `début de la manche ${index + 1} contre ${p2.name}`);
  });
  ctx.events.on('duel:start', ({ mode }) => {
    Object.assign(round, { firstBlood: false, worst: { p1: 0, p2: 0 }, comeback: false });
    bard.queue.length = 0;
    if (mode === 'hotseat') event('round', { n: 1, adv: p2.name }, 'début du duel');
  });
  ctx.events.on('damage', ({ target, amount, by }) => {
    if (!fighting() || !(amount > 0)) return;
    if (!round.firstBlood && by && by !== target && ctx.fighters[by]) { round.firstBlood = true; event(isTu(by) ? 'firstBloodTu' : 'firstBlood', { qui: nameOf(by) }, `premier sang : ${nameOf(by)} touche ${nameOf(target)}`); }
    else if (amount >= 20) event(isTu(target) ? 'bigHitTu' : 'bigHit', { cible: nameOf(target) }, `coup énorme de ${amount} dégâts sur ${nameOf(target)}`);
    const r1 = p1.hp / p1.maxHp, r2 = p2.hp / p2.maxHp;
    round.worst.p1 = Math.max(round.worst.p1, r2 - r1); round.worst.p2 = Math.max(round.worst.p2, r1 - r2);
    for (const [id, mine, other] of [['p1', r1, r2], ['p2', r2, r1]]) {
      if (!round.comeback && round.worst[id] >= 0.35 && mine > other + 0.05 && !ctx.fighters[id].ko) { round.comeback = true; event(isTu(id) ? 'comebackTu' : 'comeback', { qui: nameOf(id) }, `${nameOf(id)} était mené de loin et reprend l'avantage`); }
    }
  });
  ctx.events.on('chem:reaction', ({ combo, by }) => { if (combo && fighting()) event('combo', { combo, qui: nameOf(by) }, `réaction chimique « ${combo} » provoquée par ${by ? nameOf(by) : 'le décor'}`); });
  ctx.events.on('input:parry', ({ fighter }) => event('parry', { qui: nameOf(fighter || 'p1') }, `${nameOf(fighter || 'p1')} pare un projectile`));
  ctx.events.on('fighter:ko', ({ fighter, winner }) => event(isTu(winner) ? 'koWin' : isTu(fighter) ? 'koLose' : 'ko', { qui: nameOf(winner), cible: nameOf(fighter) }, `${nameOf(fighter)} est K.O., ${nameOf(winner)} gagne la manche`));
  ctx.events.on('habit:detected', ({ label }) => event('habit', { adv: p2.name, label }, `${p2.name} a détecté une habitude du joueur : ${label}`));
  ctx.events.on('habit:counter', () => { if (Math.random() < 0.5) event('counter', { adv: p2.name }, `${p2.name} joue un contre préparé`); });
  ctx.events.on('director:warn', ({ type }) => { if (BANK[type]) event(type, {}, `incident dans la taverne : ${type}`); });
  ctx.events.on('first:world', ({ name }) => event('first', { nom: name }, `première mondiale : « ${name} », jamais vu auparavant`));
  ctx.events.on('echo', ({ mult }) => { if (mult <= 0.85) event('echo', {}, 'le joueur répète le même sort, il perd de la puissance'); });
  ctx.events.on('ambiance:full', () => event('fire', {}, 'la foule est en délire, la taverne est en feu'));
  ctx.events.on('ai:strategy', ({ text }) => { if (text) event('strategy', { txt: text }); });
  // Moments « wow » et réflexes : le barde les annonce aussi (libellés venant des listes fermées de l'Oracle).
  ctx.events.on('wow:law', ({ law, on, caster, why }) => {
    if (!fighting()) return;
    if (on) event('law', { loi: LAWS[law] || law, qui: nameOf(caster) }, `${nameOf(caster)} impose la loi « ${LAWS[law] || law} »`);
    else if (why === 'panneau') event('lawBroken', {}, 'le panneau de la loi est cassé, la loi est annulée');
  });
  ctx.events.on('wow:weather', ({ weather, on, caster }) => { if (on && fighting()) event('weather', { meteo: WEATHERS[weather] || weather }, `${nameOf(caster)} déclenche la météo « ${WEATHERS[weather] || weather} » dans la taverne`); });
  ctx.events.on('wow:possess', ({ prop, caster, on }) => { if (on && fighting()) { const nm = ctx.props.byId(prop)?.name || prop; event('possess', { qui: nameOf(caster), objet: nm }, `${nameOf(caster)} possède ${nm}`); } });
  ctx.events.on('wow:mirror', ({ caster, text }) => { if (fighting()) event('mirror', { txt: text }, `${nameOf(caster)} renvoie le sort « ${text} » avec un miroir`); });
  ctx.events.on('wow:summon', ({ caster, base }) => { if (fighting()) event('summon', {}, `${nameOf(caster)} invoque ${base || 'un objet'}`); });
  ctx.events.on('wow:critical', ({ by, amount }) => { if (fighting()) event('crit', {}, `coup critique de ${nameOf(by)} : ${amount} dégâts`); });
  ctx.events.on('input:throw', ({ fighter, prop }) => { if (fighting()) { const nm = (ctx.props.byId(prop)?.group || 'objet').replace('_', ' '); event('throw', { objet: nm }, `${nameOf(fighter)} lance ${nm} à la main`); } });
  ctx.events.on('input:table', ({ phase, fighter }) => { if (phase === 'up' && fighting()) event('table', {}, `${nameOf(fighter)} dresse la table comme bouclier`); });
  ctx.events.on('input:glyph', ({ ok, name, fighter }) => { if (ok && name && fighting()) event('glyph', { nom: name }, `${nameOf(fighter)} trace un glyphe ${name}`); });

  ctx.bard = Object.assign(bard, { say: (text, pri = 3) => show({ kind: 'custom', text, pri, t: performance.now(), gt: ctx.time, desc: text }), event, recent });
}
