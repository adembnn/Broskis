// Interface DOM par-dessus le canvas : HUD (PV, mana, états), bulles, nombres flottants, légendes, cartes de manche.
//   ctx.ui.hud()                        : rafraîchit le HUD (appelé sur 'damage', 'chem:state', chaque 0,1 s)
//   ctx.floater(f, text, cls, element)  : nombre flottant au-dessus d'un combattant
//   ctx.floaterAt(pos3, text, cls, color) : libellé flottant à une position monde (réactions chimiques)
//   ctx.bubble(f, text, sec)            : bulle de parole
//   ctx.caption(big, small) / ctx.ui.hideCaption()
//   ctx.ui.card({ kicker, title, sub, body, button }) → Promise (clic sur le bouton)
import * as THREE from 'three';
import { STATES } from '../rules.js';
import { MANA } from './combat.js';

const $ = (id) => document.getElementById(id);

// Pictogrammes d'état : SVG 2 tons, trait encre (pas d'emoji).
const ICONS = {
  flame: '<path d="M12 2.5c1 3.6 5.8 5.8 5.8 11.3a5.8 5.8 0 0 1-11.6 0c0-3 1.7-4.8 2.8-6.6.8 1.9 1 3 2.7 3.9-.1-3.6-.9-5.9.3-8.6z"/>',
  drop: '<path d="M12 2.8c3 4.6 6.6 8.3 6.6 12.1a6.6 6.6 0 0 1-13.2 0c0-3.8 3.6-7.5 6.6-12.1z"/>',
  flake: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2 3.8 16.8M9.6 3.8 12 6.2l2.4-2.4M9.6 20.2 12 17.8l2.4 2.4" fill="none" stroke-width="2.2"/>',
  bolt: '<path d="M13.5 2 4.8 13.6h6.3L9.6 22l9.6-12.4h-6.4z"/>',
  oil: '<path d="M12 2.8c3 4.6 6.6 8.3 6.6 12.1a6.6 6.6 0 0 1-13.2 0c0-3.8 3.6-7.5 6.6-12.1z"/><path d="M9 14.5a3 3 0 0 0 3 3" fill="none" stroke-width="1.8"/>',
  goo: '<path d="M4 7.5c0-3.4 16-3.4 16 0v4.2c0 1.9-1.8 1.9-1.8 3.8s-2.4 1.9-2.4 0-2-1.9-2 0c0 3.2-3.4 3.2-3.4 0 0-1.9-2-1.9-2 0s-2.6 1.9-2.6-.2c0-1.8-1.8-1.8-1.8-3.6z"/>',
  cloud: '<path d="M6.5 18.5a4 4 0 0 1-.4-8 6 6 0 0 1 11.3-1.6 4.8 4.8 0 0 1 .6 9.6z"/>',
  ash: '<circle cx="12" cy="12" r="6.5"/>',
};
const iconSvg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.ash}</svg>`;
const SHOWN = ['burning', 'wet', 'frozen', 'electrified', 'oily', 'sticky', 'smoking'];
const ELEMENT_COLOR = { fire: '#FF6A1F', water: '#3d8fd6', frost: '#7FD6F0', lightning: '#FFE94A', oil: '#8a7a3a', sticky: '#6CC43A' };

export function installUI(ctx) {
  const { camera } = ctx;
  const { p1, p2 } = ctx.fighters;
  const ui = {
    hudEl: $('hud'), turn: $('turn'), slowmo: $('slowmo'), caption: $('caption'), dock: $('dock'), form: $('castForm'), input: $('incant'), castBtn: $('castBtn'),
    timer: $('timerFill'), timerNum: $('timerNum'), oracle: $('oracle'), mute: $('muteBtn'), decor: $('decor'), layer: $('layer'),
    title: $('title'), modeT: $('modeTournament'), modeD: $('modeDuel'), loading: $('loading'), modeHint: $('modeHint'),
    card: $('card'), cardKicker: $('cardKicker'), cardTitle: $('cardTitle'), cardSub: $('cardSub'), cardBody: $('cardBody'), cardBtn: $('cardBtn'),
    over: $('over'), overTitle: $('overTitle'), overText: $('overText'), overCombos: $('overCombos'), again: $('againBtn'),
    f: {
      p1: { name: $('name1'), hp: $('hp1'), ghost: $('ghost1'), sh: $('sh1'), num: $('hpNum1'), mana: $('mana1'), manaNum: $('manaNum1'), st: $('st1') },
      p2: { name: $('name2'), hp: $('hp2'), ghost: $('ghost2'), sh: $('sh2'), num: $('hpNum2'), mana: $('mana2'), manaNum: $('manaNum2'), st: $('st2') },
    },
  };
  ui.modeHint.hidden = true;

  const tmpV = new THREE.Vector3();
  function screenOf(pos) {
    tmpV.copy(pos).project(camera);
    return { x: (tmpV.x * 0.5 + 0.5) * window.innerWidth, y: (-tmpV.y * 0.5 + 0.5) * window.innerHeight, behind: tmpV.z > 1 };
  }
  ui.screenOf = screenOf;

  function floaterAt(pos, text, cls = '', color = null) {
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    if (color) el.style.color = color;
    const s = screenOf(pos);
    el.style.left = `${Math.round(s.x)}px`; el.style.top = `${Math.round(s.y)}px`;
    ui.layer.appendChild(el);
    setTimeout(() => el.remove(), cls === 'react' ? 1700 : 1400);
  }
  function floater(f, text, cls = '', element = null) {
    floaterAt(f.headPos().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, 0)), text, cls, ELEMENT_COLOR[element] || null);
  }

  const bubbles = new Map();
  function bubble(f, text, seconds = 2.6) {
    let b = bubbles.get(f);
    if (!b) {
      const el = document.createElement('div');
      el.className = `bubble ${f.id}`;
      ui.layer.appendChild(el);
      b = { el, until: 0 };
      bubbles.set(f, b);
    }
    b.el.textContent = text;
    b.el.hidden = !text;
    b.half = 0;
    b.until = performance.now() + seconds * 1000;
  }

  // Pastilles d'état au-dessus des têtes
  const heads = new Map();
  for (const f of [p1, p2]) {
    const el = document.createElement('div');
    el.className = 'head-states';
    ui.layer.appendChild(el);
    heads.set(f, { el, key: '' });
  }

  // Légende centrale. Priorité : une annonce importante (moment « wow », priorité 2) n'est pas écrasée par une
  // légende ordinaire ; celle-ci attend la fin de l'annonce (seule la plus récente est gardée). Renvoie l'élément
  // du gros titre, ou null si la légende est différée.
  let capTimer = 0, pendTimer = 0, capCur = null, capPending = null;
  function caption(big, small = '', seconds = 2.2, { priority = 1 } = {}) {
    const now = performance.now();
    if (capCur && now < capCur.until && capCur.priority > priority) {
      capPending = { big, small, seconds, priority };
      clearTimeout(pendTimer);
      pendTimer = setTimeout(() => { const q = capPending; capPending = null; if (q) caption(q.big, q.small, Math.max(1.2, q.seconds * 0.8), { priority: q.priority }); }, capCur.until - now + 30);
      return null;
    }
    capCur = { priority, until: now + seconds * 1000 };
    ui.caption.innerHTML = '';
    const a = document.createElement('div'); a.className = 'cap-big'; a.textContent = big;
    const b = document.createElement('div'); b.className = 'cap-small'; b.textContent = small;
    ui.caption.append(a, b);
    ui.caption.hidden = false;
    ui.caption.classList.remove('show'); void ui.caption.offsetWidth; ui.caption.classList.add('show');
    clearTimeout(capTimer);
    capTimer = setTimeout(hideCaption, seconds * 1000);
    return a;
  }
  function hideCaption() { ui.caption.classList.remove('show'); capCur = null; }

  function statusList(f) {
    return SHOWN.filter((s) => f.states.has(s)).map((s) => ({ s, ticks: f.states.get(s), ...STATES[s] }));
  }
  function chip(st, withLabel) {
    const li = document.createElement(withLabel ? 'li' : 'span');
    li.className = `st st-${st.s}`;
    li.style.setProperty('--c', st.color);
    li.innerHTML = iconSvg(st.icon) + (withLabel ? `<span>${st.label}</span>` : '');
    li.title = st.label;
    return li;
  }

  const last = { p1: {}, p2: {} };
  function hud() {
    for (const f of [p1, p2]) {
      const r = ui.f[f.id], L = last[f.id];
      const hpK = f.hp / f.maxHp;
      if (L.hp !== f.hp) { r.hp.style.transform = `scaleX(${hpK})`; r.ghost.style.transform = `scaleX(${hpK})`; r.num.textContent = f.hp; L.hp = f.hp; }
      const sh = Math.min(1, f.shield / f.maxHp);
      if (L.sh !== sh) { r.sh.style.transform = `scaleX(${sh})`; L.sh = sh; }
      const mana = Math.floor(f.mana);
      if (L.mana !== mana) { r.mana.style.transform = `scaleX(${f.mana / f.maxMana})`; r.manaNum.textContent = mana; L.mana = mana; }
      if (L.name !== f.name) { r.name.textContent = f.name; L.name = f.name; }
      const sts = statusList(f);
      const key = sts.map((s) => s.s).join(',');
      if (L.key !== key) {
        r.st.replaceChildren(...sts.map((s) => chip(s, true)));
        const h = heads.get(f);
        h.el.replaceChildren(...sts.map((s) => chip(s, false)));
        L.key = key;
      }
      r.st.parentElement.classList.toggle('ko', f.ko);
    }
    const uniq = [...new Set(ctx.props.live().map((p) => p.name.replace(/^(le |la |l'|une? )/, '').replace(/ de (gauche|droite)| du fond/, '').replace(/ de bière$/, '')))];
    const text = uniq.length ? `Décor : ${uniq.join(', ')}.` : 'Le décor est en miettes. Place à la magie.';
    if (ui.decor.textContent !== text) ui.decor.textContent = text;
  }

  let hudT = 0;
  ctx.addSystem('ui', (dt, real) => {
    const now = performance.now();
    for (const [f, b] of bubbles) {
      if (now > b.until) { b.el.hidden = true; continue; }
      const s = screenOf(f.headPos().setY(2.95));
      if (!b.half) b.half = b.el.offsetWidth / 2 || 60;
      const x = Math.min(window.innerWidth - b.half - 8, Math.max(b.half + 8, s.x));
      b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
    }
    for (const [f, h] of heads) {
      const s = screenOf(f.headPos().setY(2.45));
      h.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
      h.el.hidden = f.ko || !h.el.childElementCount;
    }
    hudT += real;
    if (hudT > 0.1) { hudT = 0; hud(); }
  }, 90);

  ctx.events.on('damage', hud);
  ctx.events.on('action:nomana', ({ caster }) => {
    const row = ui.f[caster]?.mana.closest('.mana-row');
    if (!row) return;
    row.classList.remove('nomana'); void row.offsetWidth; row.classList.add('nomana');
  });
  ctx.events.on('chem:state', (p) => { if (p.entity.kind === 'fighter') hud(); });

  let cardGo = null;
  function card({ kicker = '', title, sub = '', body = '', button = 'Au combat !' }) {
    ui.cardKicker.textContent = kicker; ui.cardKicker.hidden = !kicker;
    ui.cardTitle.textContent = title;
    ui.cardSub.textContent = sub; ui.cardSub.hidden = !sub;
    ui.cardBody.textContent = body; ui.cardBody.hidden = !body;
    ui.cardBtn.textContent = button;
    ui.card.hidden = false;
    ui.cardBtn.focus({ preventScroll: true });
    // une seule carte à la fois : une carte précédente jamais validée (nouvelle partie lancée entre-temps) est abandonnée
    if (cardGo) ui.cardBtn.removeEventListener('click', cardGo);
    return new Promise((resolve) => {
      const go = () => { ui.cardBtn.removeEventListener('click', go); cardGo = null; ui.card.hidden = true; resolve(); };
      cardGo = go;
      ui.cardBtn.addEventListener('click', go);
    });
  }

  function setManaVisible(on) { document.body.classList.toggle('no-mana', !on); }
  const manaCostHint = (action) => {
    if (!action) return 0;
    if (action.kind === 'prop') return MANA.prop;
    if (action.kind !== 'spell') return MANA.wow[action.kind] ?? MANA.prop;
    return action.spell.form === 'bouclier' || action.spell.form === 'soin' ? MANA.defense(action.spell.power) : MANA.spell(action.spell.power);
  };

  // ctx.ui.card est la FONCTION d'affichage de carte ; l'élément DOM reste accessible via ctx.ui.cardEl
  ctx.ui = { ...ui, cardEl: ui.card, hud, card, hideCaption, setManaVisible, manaCostHint, iconSvg };
  ctx.floater = floater;
  ctx.floaterAt = floaterAt;
  ctx.bubble = bubble;
  ctx.caption = caption;
}
