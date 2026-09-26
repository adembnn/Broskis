// Carte d'arme EN DIRECT (lot LWAIT-OBJ, demande d'Adem : « du streaming sur la génération des objets, et on ne quitte
// pas l'écran tant que ce n'est pas fait »). Chaque résultat apparaît dès qu'il existe, rien de décoratif sans donnée :
//   photo prise → « Gemini is looking at your object… » → objet reconnu → physique champ par champ (flux Gemini) →
//   catégorie, nom, stats calculées par le code, trait, phrase → « Nano Banana is drawing… » → le sticker se révèle
//   (flou → net) → l'objet 3D du jeu se gonfle et tourne sur la carte → Confirm s'allume.
// Confirm reste éteint tant que sticker ET objet 3D ne sont pas prêts. Échec, refus ou 30 s sans résultat : message
// clair + « Retry » + « Use a default weapon », le joueur choisit (jamais de sortie automatique). Chaque carte suit SON
// scan (scanObject onProgress) : plusieurs cartes et 2 joueurs peuvent scanner en même temps sans se mélanger.
import { durees } from '../art/tokens.js';
import type { Category, PlayerId, Weapon } from '../core/types';
import { CATEGORIES, STAT_NAMES } from '../core/types';
import { scanNote, scanObject, type PhysicsPreview, type ScanPreview, type ScanStep } from '../ia';
import { button, el } from './dom';
import { categoryIconSvg } from './icons';
import { typewriter } from './loading/typewriter';
import { mountObjectSpin, type ObjectSpin } from './objectSpin';
import { weaponPresets } from './presets';
import { detourSticker } from './sticker2d';
import { injectScanLiveStyles } from './scanLiveStyle';
import { LOCAL_TOKENS } from './theme';

export interface LiveScanOptions {
  blob: Blob;
  photoUrl: string;
  player: PlayerId;
  cardNumber: number;
}

/** L'arme choisie (scan prêt, ou arme de secours), ou « reprendre une photo ». */
export type LiveScanOutcome = { weapon: Weapon; photoUrl?: string } | 'resnap';

export interface LiveScan {
  root: HTMLDivElement;
  outcome: Promise<LiveScanOutcome>;
  dispose(): void;
}

/** Au-delà, le joueur voit le message de lenteur et choisit (le scan continue derrière : s'il arrive, la carte finit). */
const SLOW_MS = 30000;
/** Budget du JSON dans l'arsenal : le joueur voit le flux, on ne coupe pas un Gemini lent (réseau chargé : 8 s par appel). */
const JSON_BUDGET_MS = SLOW_MS;

type Fail = 'offline' | 'substituted' | 'sticker' | 'shape' | 'slow';
const FAIL_TEXT: Record<Fail, string> = {
  offline: "Gemini didn't answer. Check the connection and retry.",
  substituted: "Nice try. Real weapons and people don't count.",
  sticker: "Nano Banana couldn't draw this one.",
  shape: "This one won't hold its shape in 3D.",
  slow: 'This is taking longer than usual.',
};

const STATUS = {
  reading: 'Gemini is looking at your object…',
  weighing: 'Gemini is weighing it…',
  naming: 'Gemini is naming your weapon…',
  drawing: 'Nano Banana is drawing your sticker…',
  building: 'Inflating it in 3D…',
  ready: 'Ready to fight!',
  failed: 'Your call:',
};

/** Rangées de physique, dans l'ordre où Gemini les écrit (schéma de api/scan-object.ts). */
const PHYS_ROWS: [keyof PhysicsPreview, string][] = [
  ['material', 'Material'],
  ['shape', 'Shape'],
  ['heightM', 'Height'],
  ['widthM', 'Width'],
  ['depthM', 'Depth'],
  ['massKg', 'Mass'],
  ['bounciness', 'Bounce'],
  ['fragile', 'Breaks'],
  ['liquid', 'Splashes'],
];

function metres(m: number): string {
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(2)} m`;
}
function formatPhys(k: keyof PhysicsPreview, v: PhysicsPreview[keyof PhysicsPreview]): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string') return v;
  if (typeof v !== 'number') return '';
  if (k === 'massKg') return v < 1 ? `${Math.round(v * 1000)} g` : `${v < 10 ? v.toFixed(1) : Math.round(v)} kg`;
  if (k === 'bounciness') return v < 0.2 ? 'dead weight' : v < 0.5 ? 'a little' : v < 0.8 ? 'bouncy' : 'super bouncy';
  return metres(v);
}

/** Physique finale (arbitrée par le code) au format des rangées. */
function physicsRows(w: Weapon): PhysicsPreview {
  const ph = w.physics;
  if (!ph) return {};
  return { material: ph.material, shape: ph.shape, heightM: ph.sizeM[0], widthM: ph.sizeM[1], depthM: ph.sizeM[2], massKg: ph.massKg, bounciness: ph.bounciness, fragile: ph.fragile, liquid: ph.liquid };
}

/** Chronologie des cartes en direct (débogage, tools/lwait-obj) : window.__lscan. */
interface LiveLog { card: number; t: number; step: string; fields?: string }
const liveLog: LiveLog[] = [];
if (typeof window !== 'undefined') (window as unknown as { __lscan: LiveLog[] }).__lscan = liveLog;
let cards = 0;

/** Arme de secours : une vraie arme du râtelier (sticker prêt), de la même catégorie si on la connaît. */
function backupWeapon(category?: Category): Weapon {
  const pool = weaponPresets();
  const same = category ? pool.filter((w) => w.category === category) : [];
  const from = same.length ? same : pool;
  return from[Math.floor(Math.random() * from.length)];
}

export function mountLiveScan(opts: LiveScanOptions): LiveScan {
  injectScanLiveStyles();
  const cardId = ++cards;
  const root = el('div', 'lscan');
  root.dataset.state = 'reading';

  // ---- Carte (mêmes classes que weaponCard.ts : même objet final, rempli au fil de l'eau) ----
  const card = el('div', 'weapon-card lscan-card');
  const inner = el('div', 'weapon-card-inner');
  const front = el('div', 'weapon-card-face wc-front');
  front.style.setProperty('--owner', `var(--b-p${opts.player + 1})`);
  front.style.setProperty('--owner-light', `var(--b-p${opts.player + 1}-clair)`);
  inner.append(front);
  card.append(inner);

  const band = el('div', 'wc-band-top');
  const catLabel = el('span', 'wc-category lscan-skel', '…');
  band.append(catLabel, el('span', 'wc-number', `#${String(opts.cardNumber).padStart(2, '0')}`));

  const stage = el('div', 'wc-illustration lscan-stage');
  // La vraie photo (classe wc-photo-wrap comme sur la carte finale : les outils de test la masquent) ; elle part
  // s'agrafer dans le coin quand le sticker arrive.
  const photoWrap = el('div', 'wc-photo-wrap lscan-photo');
  const photo = el('img', 'lscan-photo-img');
  photo.src = opts.photoUrl;
  photo.alt = '';
  photoWrap.append(photo);
  const beam = el('div', 'lscan-beam');
  const sticker = el('img', 'lscan-sticker');
  sticker.alt = '';
  stage.append(photoWrap, beam, sticker);

  const nameBand = el('div', 'wc-band-name lscan-name');
  const nameText = el('span', 'lscan-name-text');
  nameBand.append(nameText);
  const objectLine = el('p', 'weapon-object lscan-object');
  const pips = el('div', 'wc-pips');
  const pipRows: { label: HTMLSpanElement; dots: HTMLSpanElement[] }[] = [];
  for (let r = 0; r < 3; r++) {
    const row = el('div', 'wc-pip-row');
    const label = el('span', 'wc-pip-label', '·');
    const dotsBox = el('div', 'wc-pip-dots');
    const dots: HTMLSpanElement[] = [];
    for (let i = 0; i < 6; i++) {
      const d = el('span', 'pip');
      dots.push(d);
      dotsBox.append(d);
    }
    row.append(label, dotsBox);
    pips.append(row);
    pipRows.push({ label, dots });
  }
  const stamp = el('div', 'wc-stamp lscan-stamp');
  stamp.hidden = true;
  const why = el('p', 'weapon-why lscan-why');
  front.append(band, stage, nameBand, objectLine, pips, stamp, why);

  // ---- Panneau de droite : statut + chrono, étapes réelles, physique champ par champ, choix ----
  const side = el('div', 'lscan-side');
  const statusRow = el('p', 'lscan-status');
  const statusText = el('span', 'lscan-status-text');
  const clock = el('span', 'lscan-clock', '0.0 s');
  statusRow.append(statusText, clock);
  const steps = el('ol', 'lscan-steps');
  const stepEls: Record<'gemini' | 'sticker' | 'shape', HTMLLIElement> = {
    gemini: el('li', 'now', 'Gemini reads it'),
    sticker: el('li', '', 'Nano Banana draws it'),
    shape: el('li', '', 'Built in 3D'),
  };
  const photoStep = el('li', 'done', 'Photo');
  steps.append(photoStep, stepEls.gemini, stepEls.sticker, stepEls.shape);
  const physBox = el('dl', 'lscan-phys');
  const physVals = new Map<keyof PhysicsPreview, HTMLElement>();
  for (const [k, label] of PHYS_ROWS) {
    const dt = el('dt', '', label);
    const dd = el('dd', 'lscan-skel', '…');
    physBox.append(dt, dd);
    physVals.set(k, dd);
  }
  const failBox = el('div', 'lscan-fail');
  failBox.hidden = true;
  const failText = el('p', 'lscan-fail-text');
  const failRow = el('div', 'confirm-row');
  const retryBtn = button('Retry', 'b-btn');
  const backupBtn = button('Use a default weapon', 'b-btn small alt');
  failRow.append(retryBtn, backupBtn);
  failBox.append(failText, failRow);
  const actions = el('div', 'confirm-row lscan-actions');
  const confirmBtn = button('Forging…', 'b-btn cta');
  confirmBtn.disabled = true;
  const resnapBtn = button('New photo', 'b-btn small alt');
  actions.append(confirmBtn, resnapBtn);
  const pills = el('div', 'category-pills lscan-pills');
  pills.hidden = true;
  side.append(statusRow, steps, physBox, failBox, actions, pills);
  root.append(card, side);

  const name = typewriter(nameText);
  const status = typewriter(statusText);
  const whyTw = typewriter(why);

  // ---- État d'une tentative (Retry ou changement de catégorie = nouvelle tentative, même photo) ----
  let run = 0;
  let t0 = performance.now();
  let clockTimer = 0;
  let slowTimer = 0;
  let spin: ObjectSpin | null = null;
  let weapon: Weapon | null = null;
  let fail: Fail | null = null;
  let isReady = false;
  let statsShown = false;
  let shownCategory: Category | null = null;
  const shownPhys: PhysicsPreview = {};
  let resolveOutcome!: (o: LiveScanOutcome) => void;
  const outcome = new Promise<LiveScanOutcome>((r) => (resolveOutcome = r));
  let settled = false;
  const settle = (o: LiveScanOutcome) => {
    if (settled) return;
    settled = true;
    resolveOutcome(o);
  };

  const setState = (s: string) => {
    if (root.dataset.state !== s) liveLog.push({ card: cardId, t: Math.round(performance.now() - t0), step: `state:${s}` });
    root.dataset.state = s;
  };
  const say = (text: string) => status.set(text);
  const secs = () => `${((performance.now() - t0) / 1000).toFixed(1)} s`;
  const markStep = (k: keyof typeof stepEls, cls: 'now' | 'done' | 'fail' | '') => {
    stepEls[k].className = cls;
    if (cls === 'done') stepEls[k].dataset.t = secs();
  };
  const slap = (node: HTMLElement) => {
    node.classList.remove('lscan-in');
    void node.offsetWidth; // relance l'animation d'entrée
    node.classList.add('lscan-in');
  };

  const showCategory = (cat: Category) => {
    if (shownCategory === cat) return;
    shownCategory = cat;
    catLabel.classList.remove('lscan-skel');
    catLabel.innerHTML = categoryIconSvg(cat);
    catLabel.append(el('span', '', cat));
    catLabel.style.setProperty('--accent', LOCAL_TOKENS.category[cat]);
    slap(catLabel);
    STAT_NAMES[cat].forEach((n, i) => (pipRows[i].label.textContent = n));
  };
  const showPhys = (ph: PhysicsPreview) => {
    for (const [k] of PHYS_ROWS) {
      const v = ph[k];
      if (v === undefined || shownPhys[k] === v) continue;
      (shownPhys as Record<string, unknown>)[k] = v;
      const dd = physVals.get(k)!;
      dd.classList.remove('lscan-skel');
      dd.textContent = formatPhys(k, v);
      slap(dd);
    }
  };
  const showStats = (w: Pick<Weapon, 'stats'>) => {
    if (statsShown) return;
    statsShown = true;
    const vals = [w.stats.a, w.stats.b, w.stats.c];
    let n = 0;
    vals.forEach((v, r) =>
      pipRows[r].dots.forEach((d, i) => {
        if (i >= v) return;
        window.setTimeout(() => d.classList.add('filled', 'lscan-pop'), n++ * durees.pastille);
      }),
    );
  };
  const showTrait = (trait: string) => {
    if (stamp.textContent === trait && !stamp.hidden) return;
    stamp.textContent = trait;
    stamp.hidden = false;
    slap(stamp);
  };

  const onPreview = (p: ScanPreview) => {
    if (p.object) {
      objectLine.textContent = `From: ${p.object}`;
      if (!p.physicsPreview && !p.category) say(`Gemini sees: ${p.object}`);
    }
    if (p.physicsPreview) {
      showPhys(p.physicsPreview);
      if (!p.category) say(p.object ? `Gemini sees: ${p.object}` : STATUS.weighing);
    }
    if (p.category) {
      showCategory(p.category);
      say(STATUS.naming);
    }
    if (p.name) name.set(p.name);
    if (p.stats) showStats(p as Weapon);
    if (p.trait) showTrait(p.trait);
    if (p.why) whyTw.set(`"${p.why}"`);
  };

  const showFail = (kind: Fail) => {
    fail = kind;
    setState(kind === 'slow' ? 'slow' : 'failed');
    failText.textContent = FAIL_TEXT[kind];
    failBox.hidden = false;
    slap(failBox);
    retryBtn.textContent = kind === 'substituted' || kind === 'shape' ? 'Snap another' : 'Retry';
    if (kind !== 'slow') {
      say(STATUS.failed);
      window.clearInterval(clockTimer);
      const k = kind === 'offline' || kind === 'substituted' ? 'gemini' : kind === 'sticker' ? 'sticker' : 'shape';
      markStep(k, 'fail');
    }
  };

  const becomeReady = () => {
    if (isReady || !weapon) return;
    isReady = true;
    fail = null;
    failBox.hidden = true;
    window.clearInterval(clockTimer);
    window.clearTimeout(slowTimer);
    clock.textContent = secs();
    markStep('shape', 'done');
    setState('ready');
    say(STATUS.ready);
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm';
    pills.hidden = false;
    slap(confirmBtn);
  };

  const build3D = (w: Weapon) => {
    setState('building');
    say(STATUS.building);
    markStep('shape', 'now');
    spin?.dispose();
    spin = mountObjectSpin(w);
    stage.append(spin.root);
    const mine = run;
    spin.ready.then(
      () => {
        if (mine !== run) return;
        stage.classList.add('is-3d');
        becomeReady();
      },
      (e) => {
        if (mine !== run) return;
        console.error('[lscan] 3D', e);
        showFail('shape');
      },
    );
  };

  const onSticker = (w: Weapon) => {
    if (!w.stickerUrl || isReady || (fail && fail !== 'slow')) return;
    markStep('sticker', 'done');
    const mine = run;
    void detourSticker(w.stickerUrl).then((src) => {
      if (mine !== run) return;
      sticker.src = src ?? w.stickerUrl!;
      stage.classList.add('has-sticker');
      setState('revealing');
      // La révélation (flou → net) se joue d'abord ; la construction 3D (calcul du gonflage) vient juste après.
      window.setTimeout(() => {
        if (mine === run) build3D(w);
      }, durees.dramatique);
    });
  };

  const onStep = (step: ScanStep, preview: ScanPreview | undefined, weaponId: string | undefined) => {
    if (step === 'partial' && preview) {
      if (!statsShown && !preview.category) setState('streaming');
      onPreview(preview);
      return;
    }
    if (step === 'stats' && preview && weaponId) {
      const note = scanNote(weaponId);
      if (note) {
        weapon = preview as Weapon; // arme de secours déjà choisie par le pipeline, proposée telle quelle
        showFail(note);
        return;
      }
      weapon = preview as Weapon;
      markStep('gemini', 'done');
      markStep('sticker', 'now');
      showPhys(physicsRows(weapon));
      onPreview(weapon);
      if (!weapon.stickerUrl) {
        setState('drawing');
        say(STATUS.drawing);
      }
      return;
    }
    if (step === 'sticker' && preview) {
      onSticker(preview as Weapon);
      return;
    }
    if (step === 'sticker-failed' && !fail) {
      markStep('sticker', 'fail');
      showFail('sticker');
    }
  };

  const reset = () => {
    spin?.dispose();
    spin = null;
    weapon = null;
    fail = null;
    isReady = false;
    statsShown = false;
    shownCategory = null;
    for (const k of Object.keys(shownPhys)) delete (shownPhys as Record<string, unknown>)[k];
    stage.classList.remove('has-sticker', 'is-3d');
    sticker.removeAttribute('src');
    catLabel.className = 'wc-category lscan-skel';
    catLabel.textContent = '…';
    for (const r of pipRows) {
      r.label.textContent = '·';
      for (const d of r.dots) d.className = 'pip';
    }
    stamp.hidden = true;
    name.set('');
    whyTw.set('');
    objectLine.textContent = '';
    for (const dd of physVals.values()) {
      dd.className = 'lscan-skel';
      dd.textContent = '…';
    }
    failBox.hidden = true;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Forging…';
    pills.hidden = true;
    markStep('gemini', 'now');
    markStep('sticker', '');
    markStep('shape', '');
  };

  let lastCategory: Category | undefined;
  const attempt = (category?: Category) => {
    const mine = ++run;
    lastCategory = category;
    reset();
    t0 = performance.now();
    setState('reading');
    say(STATUS.reading);
    window.clearInterval(clockTimer);
    clockTimer = window.setInterval(() => (clock.textContent = secs()), 100);
    window.clearTimeout(slowTimer);
    slowTimer = window.setTimeout(() => {
      if (mine === run && !isReady && !fail) showFail('slow');
    }, SLOW_MS);
    scanObject(opts.blob, {
      category,
      player: opts.player,
      timeoutMs: JSON_BUDGET_MS,
      onProgress: (step, preview, weaponId) => {
        if (mine !== run || settled) return;
        const fields = preview ? [...Object.keys(preview), ...Object.keys(preview.physicsPreview ?? {})].join(',') : undefined;
        liveLog.push({ card: cardId, t: Math.round(performance.now() - t0), step, fields });
        try {
          onStep(step, preview, weaponId);
        } catch (e) {
          console.error('[lscan] step', e);
        }
      },
    }).catch((e) => {
      if (mine !== run) return;
      console.error('[lscan] scan', e);
      showFail('offline');
    });
  };

  // Pastilles de catégorie : relance en catégorie imposée (même photo, sticker réutilisé : lot LSCAN).
  for (const cat of CATEGORIES) {
    const pill = el('button', 'cat-pill', cat);
    pill.type = 'button';
    pill.addEventListener('click', () => {
      if (weapon && cat !== weapon.category) attempt(cat);
    });
    pills.append(pill);
  }

  confirmBtn.addEventListener('click', () => {
    if (isReady && weapon) settle({ weapon, photoUrl: opts.photoUrl });
  });
  resnapBtn.addEventListener('click', () => settle('resnap'));
  retryBtn.addEventListener('click', () => {
    if (fail === 'substituted' || fail === 'shape') settle('resnap');
    else attempt(lastCategory);
  });
  backupBtn.addEventListener('click', () => {
    // Refus ou réseau : le pipeline a déjà tiré une arme de secours ; sinon, une vraie arme du râtelier.
    const note = weapon ? scanNote(weapon.id) : undefined;
    settle({ weapon: note && weapon ? weapon : backupWeapon(weapon?.category ?? shownCategory ?? undefined) });
  });

  attempt();

  return {
    root,
    outcome,
    dispose() {
      run++;
      window.clearInterval(clockTimer);
      window.clearTimeout(slowTimer);
      spin?.dispose();
      name.dispose();
      status.dispose();
      whyTw.dispose();
    },
  };
}
