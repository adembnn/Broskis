// Déroulé du duel : modes Tournoi (temps réel, mana, bullet time, 3 adversaires + boss) et Duel 2 joueurs (tour par tour 15 s).
//
// Point d'entrée UNIQUE pour toute action de jeu (clavier, IA, souris plus tard) :
//   ctx.duel.act(fighter, action, { text, windup }) → Promise<'ok'|'nomana'|'nophase'|'ko'>
//     action = { kind:'spell', spell:{ element, form, power, count, colors, name, target? } } | { kind:'prop', prop:{ id, verb, target } }
//   ctx.duel.cast(text, fighter)   : fait interpréter un texte par l'Oracle puis joue l'action
//   ctx.duel.start('tournament' | 'hotseat'), ctx.duel.state, ctx.duel.costOf(action), ctx.duel.oracleState(caster)
// Événements : duel:start {mode}, duel:round {index, opponent}, duel:fight {index}, duel:end {winner, mode},
//   action:start / action:end {caster, action, text}, oracle:interpret {caster, text, action, source}, duel:turn {active}, duel:over {won, mode}
// Nouveaux kinds d'action : ctx.actionHandlers[kind] = async (action, caster) => {} (voir src/wow/index.js).
import * as THREE from 'three';
import { interpret, oracleName, ELEMENTS } from '../oracle.js';
import { VERBS, VERB_LABELS } from '../props.js';
import { ROSTER } from '../ai/roster.js';
import { costOf } from '../ai/brain.js';
import { sfx } from '../audio.js';

export const TURN_SECONDS = 15;
export const SLOW = { typing: 0.35, oracle: 0.2 };

function runeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.strokeStyle = '#F2A541'; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 112, 0, 7); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 86, 0, 7); g.stroke();
  g.fillStyle = '#F2A541'; g.font = 'bold 26px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ';
  for (let i = 0; i < 12; i++) { g.save(); g.rotate((i / 12) * Math.PI * 2); g.fillText(runes[i], 0, -99); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function installDuel(ctx) {
  const { p1, p2 } = ctx.fighters;
  const ui = ctx.ui;
  const state = { mode: null, phase: 'title', round: -1, opponent: null, active: null, deadline: 0, winner: null, turn: 0, log: [], combos: [], pending: 0, interpreting: false };
  const foe = ctx.foe;

  // ---------- Anneau runique (interprétation / télégraphe) ----------
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTexture(), transparent: true, depthWrite: false });
  const rings = new Map();
  for (const f of [p1, p2]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), runeMat);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.visible = false; m.renderOrder = 3;
    f.root.add(m);
    rings.set(f, m);
  }
  const showRing = (f, on) => { const r = rings.get(f); r.visible = on; if (on) r.scale.setScalar(0.3); };

  // ---------- Oracle ----------
  function nearestProp(group, target) {
    const tp = target.root.position;
    let best = null, bd = Infinity;
    for (const p of ctx.props.registry) {
      if (!p.live || !p.affordances.length) continue;
      const g = p.group || p.id;
      if (g !== group && !(group === 'tonneau' && g === 'tonneau_huile')) continue;
      const w = p.where(); const d = Math.hypot(w.x - tp.x, w.z - tp.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function nearestEntity(group, targetId) {
    const tp = ctx.fighters[targetId].root.position;
    let best = null, bd = Infinity;
    for (const e of ctx.entities.live()) {
      if (e.kind === 'fighter') continue;
      const g = e.group || e.id;
      if (g !== group && e.id !== group && !(group === 'tonneau' && g === 'tonneau_huile')) continue;
      const p = e.pos(); const d = Math.hypot(p.x - tp.x, p.z - tp.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best?.id || null;
  }
  function nearestSurface(targetId, liquid = null) {
    const tp = ctx.fighters[targetId].root.position;
    let best = null, bd = Infinity;
    for (const s of ctx.surfaces.list) {
      if (!s.alive || (liquid && s.liquid !== liquid)) continue;
      const d = Math.hypot(s.center.x - tp.x, s.center.z - tp.z) - s.radius;
      if (d < bd) { bd = d; best = s; }
    }
    return best?.id || null;
  }
  function oracleState(caster) {
    const st = (f) => [...f.states.keys()];
    return {
      caster: caster.id,
      hp: { p1: p1.hp, p2: p2.hp },
      states: { p1: st(p1), p2: st(p2) },
      props: ctx.props.live().map((p) => ({ id: p.id, affordances: p.affordances })),
      propsDesc: ctx.props.describe(ctx.fighters),
      entities: ctx.entities.live().filter((e) => e.kind !== 'fighter').map((e) => ({ id: e.id, nom: e.name, type: e.kind, matiere: e.material, etats: st(e), ...(e.liquid ? { liquide: e.liquid } : {}), ...(e.live && e.affordances?.length ? { accessoire: true } : {}) })),
      verbs: VERBS,
      nearest: (group, targetId) => nearestProp(group, ctx.fighters[targetId]),
      nearestEntity, nearestSurface,
    };
  }

  // ---------- Actions ----------
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const formLabel = (s) => ({ projectile: 'projectile', salve: `salve ×${Math.max(2, Math.min(7, s.count))}`, meteore: 'météore', nova: 'onde', bouclier: 'bouclier', soin: 'soin' }[s.form]);

  function resolveSpellTarget(s, caster) {
    if (s.form === 'bouclier' || s.form === 'soin') return caster;
    if (s.target === caster.id && s.form !== 'projectile') return foe(caster);
    if (s.target && s.target !== 'p1' && s.target !== 'p2') {
      const e = ctx.entities.get(s.target);
      if (e && e.alive) return e;
    }
    return s.target === caster.id ? caster : foe(caster);
  }

  async function perform(action, caster) {
    // Actions « wow » (law, mirror, possess, weather, summon…) : gestionnaires enregistrés par src/wow/*.js
    const handler = ctx.actionHandlers?.[action.kind];
    if (handler) { await handler(action, caster); ctx.ui.hud(); return; }
    if (action.kind === 'prop') {
      const prop = ctx.props.byId(action.prop.id);
      if (!prop || !prop.live || !prop.affordances.includes(action.prop.verb)) {
        ctx.caption('Pschitt…', 'Cet accessoire ne répond plus.', 1.2);
        sfx.fizzle();
        await ctx.wait(0.6);
        return;
      }
      const tgt = ctx.fighters[action.prop.target] || foe(caster);
      ctx.caption(`${capitalize(prop.name)} ${VERB_LABELS[action.prop.verb]}`, `${caster.name} → ${tgt === p1 && state.mode === 'tournament' ? 'toi' : tgt.name}`);
      caster.play(action.prop.verb === 'spill' || action.prop.verb === 'drop' ? 'Wave' : 'Punch');
      await ctx.wait(0.3);
      await ctx.props.execute(prop, action.prop.verb, tgt, caster);
    } else {
      const s = action.spell;
      const tgt = resolveSpellTarget(s, caster);
      const onWhat = tgt.kind === 'fighter' ? '' : ` · sur ${tgt.name}`;
      ctx.caption(s.name, `${ELEMENTS[s.element].label} · ${formLabel(s)} · puissance ${s.power}${onWhat}`);
      await ctx.spells.cast(s, caster, tgt);
    }
    ctx.ui.hud();
  }

  async function act(caster, action, { text = '', windup = 0 } = {}) {
    if (state.phase !== 'fight') return 'nophase';
    while (caster.busy || !ctx.canAct(caster)) {
      if (caster.ko || state.phase !== 'fight') return 'ko';
      await ctx.wait(0.1);
    }
    const cost = ctx.manaOn ? costOf(action) : 0;
    if (caster.mana < cost) {
      sfx.fizzle();
      ctx.floater(caster, 'Pas assez de mana', 'shield');
      ctx.events.emit('action:nomana', { caster: caster.id, action, cost });
      return 'nomana';
    }
    caster.mana -= cost;
    caster.busy = true;
    const entry = { t: +ctx.time.toFixed(2), caster: caster.id, text, action, cost };
    state.log.push(entry);
    ctx.events.emit('action:start', { caster: caster.id, action, text, cost });
    const t0 = ctx.time;
    let interrupted = false;
    try {
      if (windup > 0) {
        if (text) ctx.bubble(caster, `« ${text} »`, 1.8);
        showRing(caster, true);
        await ctx.wait(windup);
        showRing(caster, false);
      }
      // Réflexes souris (src/input/) : une parade parfaite ou un glyphe éclair pendant l'anneau runique annule l'action.
      interrupted = (caster.interruptedAt ?? -1) >= t0;
      if (interrupted) ctx.events.emit('action:interrupted', { caster: caster.id, action, text });
      else {
        if (action.taunt && caster === p2 && state.mode === 'tournament') ctx.later(0.8, () => ctx.bubble(p2, action.taunt, 1.8));
        await perform(action, caster);
      }
    } catch (e) { console.error(e); } finally { caster.busy = false; showRing(caster, false); }
    ctx.events.emit('action:end', { caster: caster.id, action, text });
    return 'ok';
  }

  async function cast(text, caster = p1) {
    text = (text || '').trim();
    if (!text) return null;
    state.interpreting = true;
    if (state.mode === 'tournament') ctx.setSlow('oracle', SLOW.oracle);
    showRing(caster, true);
    ui.oracle.textContent = 'L\'Oracle interprète…';
    sfx.weave();
    const t0 = performance.now();
    let res;
    try { res = await interpret(text, oracleState(caster)); } finally {
      const minMs = window.__instantOracle ? 0 : (window.__oracleDelayMs ?? 320); // lisibilité de l'anneau runique même avec le grimoire local
      const left = minMs - (performance.now() - t0);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      state.interpreting = false;
      ctx.clearSlow('oracle');
      showRing(caster, false);
    }
    const { action, source } = res;
    ui.oracle.textContent = `Oracle : ${source}`;
    ctx.events.emit('oracle:interpret', { caster: caster.id, text, action, source });
    const r = await act(caster, action, { text });
    return { text, action, source, result: r };
  }

  // ---------- Saisie ----------
  async function submit(text) {
    text = (text ?? ui.input.value).trim();
    if (state.phase !== 'fight') return;
    if (state.mode === 'tournament') {
      if (!text) return;
      if (state.pending >= 1) { ctx.floater(p1, 'Une à la fois !', 'shield'); sfx.fizzle(); return; }
      ui.input.value = '';
      state.pending++;
      try { await cast(text, p1); } finally { state.pending--; }
      return;
    }
    // Duel 2 joueurs
    if (state.turnLocked) return;
    state.turnLocked = true;
    const f = state.active;
    lockInput('…');
    if (!text) {
      sfx.fizzle();
      ctx.bubble(f, '… euh…', 1.6);
      ctx.caption('Trop lent !', 'Le sablier est vide, tour perdu.', 1.2);
      await ctx.wait(1.2);
    } else {
      ui.input.value = '';
      lockInput('L\'Oracle interprète…');
      await cast(text, f);
    }
    await ctx.wait(0.4);
    if (state.phase === 'fight') beginTurn(foe(f));
  }

  function lockInput(msg) {
    ui.input.disabled = true; ui.castBtn.disabled = true;
    ui.dock.classList.add('locked');
    if (msg) ui.input.placeholder = msg;
  }
  function unlockInput(placeholder = 'Écris une incantation… (Entrée pour lancer)') {
    ui.input.disabled = false; ui.castBtn.disabled = false;
    ui.dock.classList.remove('locked');
    ui.input.placeholder = placeholder;
    ui.input.focus({ preventScroll: true });
  }

  // ---------- Remise à zéro de l'arène ----------
  function resetArena(opp) {
    for (const pr of [...ctx.projectiles]) pr.cancel();
    ctx.props.reset();
    ctx.surfaces.clear();
    ctx.chem.reset();
    for (const f of [p1, p2]) {
      f.states.clear(); f.heat = 0; f.busy = false; f.stunUntil = 0;
      f.resetPose();
      ctx.removeShield(f);
      f.mana = f.maxMana;
    }
    p1.maxHp = 100; p1.hp = 100;
    if (opp) {
      p2.name = opp.name;
      p2.maxHp = opp.maxHp || 100;
      p2.setPalette(opp.palette || p1.palette);
    }
    p2.hp = p2.maxHp;
    state.winner = null;
    ctx.ui.hud();
  }

  // ---------- Tournoi ----------
  async function startRound(i) {
    const opp = ROSTER[i];
    state.round = i; state.opponent = opp;
    state.phase = 'intro';
    ctx.manaOn = false;
    lockInput('');
    resetArena(opp);
    ctx.events.emit('duel:round', { index: i, opponent: opp });
    setTurnLabel();
    await ui.card({ kicker: `Manche ${i + 1} sur ${ROSTER.length}`, title: opp.name, sub: opp.title, body: opp.blurb, button: i === 0 ? 'Au combat !' : 'Manche suivante' });
    state.phase = 'fight';
    ctx.manaOn = true;
    ctx.bubble(p2, opp.lines.intro, 2.4);
    setTurnLabel();
    unlockInput();
    sfx.turn();
    ctx.events.emit('duel:fight', { index: i });
  }

  // ---------- Duel 2 joueurs ----------
  function beginTurn(f) {
    if (state.phase !== 'fight') return;
    state.active = f;
    if (f === p1) state.turn++;
    state.turnLocked = false;
    state.deadline = ctx.time + TURN_SECONDS;
    setTurnLabel();
    sfx.turn();
    unlockInput(`${f.name}, à toi… (Entrée pour lancer)`);
    ui.input.value = '';
    ctx.events.emit('duel:turn', { active: f.id, turn: state.turn });
  }

  function setTurnLabel() {
    let t = '';
    if (state.mode === 'tournament') t = state.round >= 0 ? `Manche ${state.round + 1} · ${state.opponent?.name || ''}` : '';
    else if (state.mode === 'hotseat' && state.active) t = `Tour ${state.turn} · ${state.active.name}`;
    ui.turn.textContent = t;
  }

  async function start(mode) {
    ui.title.hidden = true; ui.over.hidden = true; ui.cardEl.hidden = true;
    ui.hudEl.hidden = false; ui.dock.hidden = false;
    state.mode = mode; state.log.length = 0; state.combos.length = 0; state.turn = 0; state.round = -1;
    document.body.dataset.mode = mode;
    ui.setManaVisible(mode === 'tournament');
    ctx.events.emit('duel:start', { mode });
    if (mode === 'tournament') {
      p1.name = 'Toi';
      await startRound(0);
    } else {
      p1.name = 'Joueur 1';
      state.opponent = null;
      resetArena({ name: 'Joueur 2', maxHp: 100, palette: { Main: '#d9503a', Grey: '#f0dcc0', Black: '#2d231d', accent: '#d9503a' } });
      ctx.manaOn = false;
      state.phase = 'fight';
      ctx.bubble(p2, 'À nous deux !', 2);
      ctx.later(0.6, () => beginTurn(p1));
    }
  }

  // ---------- Fin de manche / de partie ----------
  ctx.events.on('chem:reaction', (r) => { if (state.phase === 'fight') state.combos.push({ ...r, round: state.round }); });
  ctx.events.on('fighter:ko', ({ fighter }) => {
    if (state.phase !== 'fight') return;
    const loser = ctx.fighters[fighter];
    state.winner = foe(loser);
    state.phase = 'between';
    ctx.manaOn = false;
    lockInput('Manche terminée');
    ctx.clearSlow('typing');
    ctx.events.emit('duel:end', { winner: state.winner.id, mode: state.mode, round: state.round });
    const won = state.winner === p1;
    (won ? sfx.win : sfx.ko)();
    ctx.later(1.8, async () => {
      if (state.mode === 'tournament' && won && state.round < ROSTER.length - 1) {
        const combos = [...new Set(state.combos.filter((c) => c.round === state.round).map((c) => c.combo))];
        await ui.card({
          kicker: `Manche ${state.round + 1} gagnée`, title: 'Victoire !',
          sub: `${state.opponent.lines.lose}`,
          body: combos.length ? `Combos réussis : ${combos.join(', ')}. Prochain adversaire : ${ROSTER[state.round + 1].name}.` : `Prochain adversaire : ${ROSTER[state.round + 1].name}.`,
          button: 'Continuer',
        });
        startRound(state.round + 1);
        return;
      }
      state.phase = 'over';
      showOver(won);
    });
  });

  function showOver(won) {
    const combos = [...new Set(state.combos.map((c) => c.combo))];
    if (state.mode === 'tournament') {
      ui.overTitle.textContent = won ? 'Champion !' : 'K.O.';
      ui.overText.textContent = won ? `${state.opponent.lines.lose} La taverne t'offre une tournée.` : `${state.opponent.lines.win} Manche ${state.round + 1} sur ${ROSTER.length}.`;
      ui.again.textContent = 'Recommencer le tournoi';
    } else {
      ui.overTitle.textContent = `${state.winner.name} gagne !`;
      ui.overText.textContent = `En ${state.turn} tours. La taverne réclame une revanche.`;
      ui.again.textContent = 'Revanche';
    }
    ui.overCombos.replaceChildren(...combos.slice(0, 6).map((c) => { const li = document.createElement('li'); li.textContent = c; return li; }));
    ui.overCombos.hidden = !combos.length;
    ui.over.hidden = false;
    ui.again.focus();
    ctx.events.emit('duel:over', { won, mode: state.mode, winner: state.winner?.id });
  }

  // ---------- Entrées ----------
  ui.form.addEventListener('submit', (e) => { e.preventDefault(); submit(ui.input.value); });
  ui.input.addEventListener('keydown', () => sfx.type());
  ui.again.addEventListener('click', () => start(state.mode || 'tournament'));

  // ---------- Système : bullet time, sablier, anneaux ----------
  ctx.addSystem('duel', (dt, real) => {
    const typing = state.mode === 'tournament' && state.phase === 'fight' && document.activeElement === ui.input && ui.input.value.trim() !== '';
    if (typing) ctx.setSlow('typing', SLOW.typing); else ctx.clearSlow('typing');
    const slow = ctx.timeScale < 0.999;
    document.body.classList.toggle('is-slow', slow);
    const label = state.interpreting ? `L'Oracle interprète · temps ×${String(SLOW.oracle).replace('.', ',')}` : typing ? `Incantation · temps ×${String(SLOW.typing).replace('.', ',')}` : '';
    ui.slowmo.hidden = !label;
    if (label && ui.slowmo.textContent !== label) ui.slowmo.textContent = label;
    for (const [, r] of rings) if (r.visible) { r.rotation.z += real * 2.2; r.scale.setScalar(Math.min(1, r.scale.x + real * 5)); }

    if (state.mode === 'hotseat' && state.phase === 'fight' && !state.turnLocked && state.active) {
      const left = state.deadline - ctx.time;
      ui.timer.style.transform = `scaleX(${Math.max(0, left / TURN_SECONDS)})`;
      const sec = Math.max(0, Math.ceil(left));
      if (ui.timerNum.textContent !== String(sec)) { ui.timerNum.textContent = sec; if (sec <= 3 && sec > 0) sfx.tick(); }
      ui.dock.classList.toggle('urgent', left < 3);
      if (left <= 0 && !window.__noTimer) submit('');
    } else ui.dock.classList.remove('urgent');
  }, 10);

  ui.oracle.textContent = `Oracle : ${oracleName()}`;
  ctx.duel = { state, act, cast, submit, start, costOf, oracleState, perform, resetArena, startRound, beginTurn, rings, showRing };
}
