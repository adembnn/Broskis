// Écran de fin enrichi : « L'Addition » (facture des dégâts de la taverne), le grimoire du joueur, le meilleur combo
// et le profil d'habitudes (si un autre module fournit ctx.habits.summary()). Inséré dans #over sur 'duel:over'.
import { LAWS, WEATHERS } from '../oracle.js';

const PRICE = {
  lustre: ['Lustre en laiton décroché « pour voir »', 120],
  tonneau: ['Tonneau de bière (la cuvée du patron)', 45],
  tonneau_huile: ['Tonneau d\'huile et ramonage du plafond', 60],
  table: ['Table en chêne, pieds compris', 30],
  caisses: ['Caisses de navets en vol libre', 8],
  caisses_pile: ['Pile de caisses à ranger (encore)', 25],
  marmite: ['Soupe du jour, renversée non consommée', 12],
  huile: ['Huile de friture étalée au sol', 18],
  pilier: ['Pilier porteur (c\'était structurel)', 250],
  bouteille: ['Eau-de-vie hors d\'âge', 15],
  chope: ['Chope en grès', 6],
  tabouret: ['Tabouret (encore un)', 9],
  corde: ['Corde du lustre, brûlée jusqu\'au nœud', 5],
  plancher: ['Plancher roussi', 15],
  charred: ['Mobilier carbonisé', 22],
  panneau: ['Panneau réglementaire de la loi', 8],
  foudre: ['Poutre foudroyée', 12],
  invocation: ['Livraison d\'objet non commandé', 15],
  invoc_boom: ['Invocation explosive non déclarée', 35],
  possession: ['Exorcisme de mobilier', 20],
  gravite: ['Traces de chaises au plafond', 25],
};
const WEATHER_PRICE = { pluie: ['Serpillières (beaucoup de serpillières)', 30], neige: ['Déneigement du comptoir', 35], brouillard: ['Aération de la salle', 20], orage: ['Paratonnerre de fortune', 50] };
const KIND_LABEL = { law: 'Loi', mirror: 'Sort miroir', possess: 'Possession', weather: 'Météo', summon: 'Invocation', prop: 'Décor' };

export function installEndScreen(ctx, wow) {
  const bill = new Map(); // clé → { label, unit, n }
  const grimoire = [];
  const combos = new Map(); // combo → { n, dmg }
  const recent = []; // réactions récentes { combo, by, t }
  const burned = new Set();
  const api = { bill, grimoire, combos, total, render };
  wow.bill = api;

  function add(key, n = 1, label = null, unit = null) {
    const [l, u] = PRICE[key] || [label, unit];
    if (!l) return;
    const it = bill.get(key) || { label: label || l, unit: unit ?? u, n: 0 };
    it.n += n;
    bill.set(key, it);
  }
  function total() { let t = 0; for (const it of bill.values()) t += it.n * it.unit; return t; }
  const groupOf = (p) => (p.group === 'invocation' ? 'invocation' : p.group || String(p.id).replace(/_\d+$/, ''));

  ctx.events.on('duel:start', () => { bill.clear(); grimoire.length = 0; combos.clear(); recent.length = 0; burned.clear(); seenAction.clear(); });

  const seenAction = new Map(); // dropLustre et execute() émettent tous deux 'prop:action' : une seule ligne
  ctx.events.on('prop:action', ({ prop, verb }) => {
    const k = `${prop.id}:${verb}`;
    if (ctx.time - (seenAction.get(k) ?? -9) < 1) return;
    seenAction.set(k, ctx.time);
    const g = groupOf(prop);
    if (verb === 'drop') add('lustre');
    else if (verb === 'explode') add(g === 'invocation' ? 'invoc_boom' : g === 'tonneau_huile' ? 'tonneau_huile' : 'tonneau');
    else if (verb === 'flip') add('table');
    else if (verb === 'topple') add('caisses_pile');
    else if (verb === 'throw') add(g === 'caisses' ? 'caisses' : g, g === 'caisses' ? 2 : 1);
    else if (verb === 'spill') add(g === 'tonneau_huile' ? 'huile' : 'marmite');
    else if (verb === 'collapse') add('pilier');
  });
  ctx.events.on('prop:break', ({ prop, cause }) => {
    if (prop.id === 'lustre_corde') add('corde');
    else if (cause === 'charred') add('charred');
  });
  ctx.events.on('chem:state', ({ entity, state, on }) => {
    if (on && state === 'burning' && entity.kind === 'surface' && !burned.has(entity.id)) { burned.add(entity.id); add('plancher'); }
  });
  ctx.events.on('wow:sign', ({ broken }) => { if (broken) add('panneau'); });
  ctx.events.on('wow:strike', () => add('foudre'));
  ctx.events.on('wow:summon', () => add('invocation'));
  ctx.events.on('wow:possess', ({ on }) => { if (on) add('possession'); });
  ctx.events.on('wow:law', ({ law, on }) => {
    if (!on) return;
    add('law', 1, 'Frais de dossier (loi temporaire)', 5);
    if (law === 'gravite_inversee') add('gravite');
  });
  ctx.events.on('wow:weather', ({ weather, on }) => { if (on && WEATHER_PRICE[weather]) add(`meteo_${weather}`, 1, ...WEATHER_PRICE[weather]); });

  // Grimoire : chaque incantation écrite, avec le nom donné par l'Oracle.
  ctx.events.on('action:start', ({ caster, action, text }) => {
    if (!text) return;
    const human = ctx.duel.state.mode === 'hotseat' || caster === 'p1';
    if (!human) return;
    let name;
    if (action.kind === 'spell') name = action.spell.name;
    else if (action.kind === 'prop') name = `${KIND_LABEL.prop} : ${ctx.props.byId(action.prop.id)?.name || action.prop.id}`;
    else if (action.kind === 'law') name = `${KIND_LABEL.law} : ${LAWS[action.law]}`;
    else if (action.kind === 'weather') name = `${KIND_LABEL.weather} : ${WEATHERS[action.weather]}`;
    else if (action.kind === 'summon') name = `${KIND_LABEL.summon} : ${action.base}`;
    else if (action.kind === 'possess') name = `${KIND_LABEL.possess} : ${ctx.entities.get(action.propId)?.name || action.propId}`;
    else name = KIND_LABEL[action.kind] || action.kind;
    const who = ctx.fighters[caster]?.name || caster;
    const dup = grimoire.find((g) => g.text.toLowerCase() === text.toLowerCase() && g.caster === caster);
    if (dup) { dup.n++; return; }
    grimoire.push({ text, name, caster, who, n: 1 });
  });

  // Meilleur combo : dégâts infligés par le même lanceur dans les 1,5 s qui suivent la réaction.
  ctx.events.on('chem:reaction', (r) => {
    if (!r.combo) return;
    const c = combos.get(r.combo) || { n: 0, dmg: 0, by: r.by };
    c.n++;
    combos.set(r.combo, c);
    recent.push({ combo: r.combo, by: r.by, t: ctx.time });
    while (recent.length > 12) recent.shift();
    // les dégâts de la réaction elle-même arrivent juste AVANT l'événement (ex. court-jus) : on les rattache
    for (const d of recentDmg) if (ctx.time - d.t < 0.2 && !d.used && (!r.by || d.by === r.by)) { c.dmg += d.amount; d.used = true; }
  });
  const recentDmg = [];
  ctx.events.on('damage', (d) => {
    recentDmg.push({ by: d.by, amount: d.amount || 0, t: ctx.time, used: false });
    while (recentDmg.length > 16) recentDmg.shift();
    const mine = recentDmg[recentDmg.length - 1];
    for (let i = recent.length - 1; i >= 0; i--) {
      const r = recent[i];
      if (ctx.time - r.t > 1.5) continue;
      if (!r.by || r.by === d.by) { combos.get(r.combo).dmg += d.amount || 0; mine.used = true; break; }
    }
  });

  // ---------- Rendu ----------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmt = (n) => `${n.toLocaleString('fr-FR')} écus`;

  function render() {
    const panel = ctx.ui.over.querySelector('.panel');
    panel.querySelector('.wow-over')?.remove();
    panel.classList.add('wow-wide');
    const root = el('div', 'wow-over');

    // L'Addition
    const bill$ = el('section', 'wow-bill');
    bill$.append(el('h3', null, 'L\'Addition'));
    const items = [...bill.values()].filter((it) => it.n > 0).sort((a, b) => b.n * b.unit - a.n * a.unit);
    const ul = el('ul', 'wow-bill-lines');
    if (!items.length) ul.append(line('Aucun dégât. Le patron est presque déçu.', 0));
    for (const it of items.slice(0, 9)) ul.append(line(it.n > 1 ? `${it.label} ×${it.n}` : it.label, it.n * it.unit));
    if (items.length > 9) ul.append(line(`Divers (${items.length - 9} lignes)`, items.slice(9).reduce((s, it) => s + it.n * it.unit, 0)));
    bill$.append(ul);
    const tot = el('p', 'wow-bill-total');
    tot.append(el('span', null, 'Total'), el('b', 'num', fmt(total())));
    bill$.append(tot, el('p', 'wow-bill-note', total() > 300 ? 'Service non compris. Le patron garde ta chope en caution.' : 'Service non compris.'));

    // Grimoire, combo, habitudes
    const side = el('section', 'wow-side');
    side.append(el('h3', null, ctx.duel.state.mode === 'hotseat' ? 'Les grimoires' : 'Ton grimoire'));
    const ol = el('ol', 'wow-grimoire');
    if (!grimoire.length) ol.append(el('li', 'wow-empty', 'Pas une seule incantation. Timide ?'));
    for (const g of grimoire.slice(-8)) {
      const li = el('li');
      li.append(el('span', 'wow-g-text', `« ${g.text} »${g.n > 1 ? ` ×${g.n}` : ''}`), el('span', 'wow-g-name', ctx.duel.state.mode === 'hotseat' ? `${g.name} · ${g.who}` : g.name));
      ol.append(li);
    }
    side.append(ol);
    const best = [...combos.entries()].sort((a, b) => b[1].dmg - a[1].dmg || b[1].n - a[1].n)[0];
    side.append(el('h3', null, 'Meilleur combo'));
    side.append(el('p', 'wow-best', best ? `${best[0]} · ${best[1].dmg} dégâts${best[1].n > 1 ? ` · ×${best[1].n}` : ''}` : 'Aucun combo… la taverne attendait mieux.'));
    let habits = null;
    try { habits = ctx.habits?.lines?.() ?? ctx.habits?.summary?.(); } catch { habits = null; }
    if (typeof habits === 'string' && habits.trim()) habits = [habits];
    if (Array.isArray(habits) && habits.length) {
      side.append(el('h3', null, 'Tes habitudes'));
      const hl = el('ul', 'wow-habits');
      for (const h of habits.slice(0, 4)) hl.append(el('li', null, String(h)));
      side.append(hl);
    }
    root.append(bill$, side);
    // pied collant : le bouton reste visible (et lisible) quand l'écran de fin défile
    let foot = panel.querySelector('.wow-over-foot');
    if (!foot) { foot = el('div', 'wow-over-foot'); panel.appendChild(foot); }
    foot.appendChild(ctx.ui.again);
    panel.insertBefore(root, foot);
  }
  function line(label, price) {
    const li = el('li');
    li.append(el('span', 'wow-bill-label', label), el('span', 'wow-bill-dots'), el('span', 'wow-bill-price num', price ? fmt(price) : '—'));
    return li;
  }

  ctx.events.on('duel:over', render);
}
