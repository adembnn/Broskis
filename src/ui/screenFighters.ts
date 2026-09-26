// Choix des 2 combattants façon Smash (lot LUX) : grille de portraits (4 persos + « Snap yourself »), jetons P1/P2
// posés sur la case choisie, un grand encart par joueur en bas (portrait, nom, réplique, bouton « Use my voice »
// du lot LW2). Contre l'IA, la machine prend un perso au hasard. Un seul appel à l'action : READY TO FIGHT!
import { durees } from '../art/tokens.js';
import type { FighterDef, PlayerId } from '../core/types';
import { promptVoiceClone } from '../ia/voice';
import { prechaufferScanFighter, scanFighterReport, type FighterScanIssue } from '../ia/fighter';
import { getRuntimeCtx } from '../ia/runtime';
import { mountCapture } from './capture';
import { button, clear, el, menuScreen } from './dom';
import { mountForge } from './forge';
import { CAMERA_SVG } from './icons';
import { mountHeadForge, mountTips, type HeadForge } from './loading';
import { fighterPortrait } from './portraits';
import { FIGHTER_PRESETS } from './presets';
import { mountVitrine, type Vitrine } from '../scene/fighter-custom/vitrine';

/** Lot LWAIT : l'écran attend la tête jusqu'à 30 s, puis c'est le joueur qui décide (Retry ou tête par défaut). */
const ATTENTE_TETE_MS = 30_000;
/** Message clair par problème (anglais), et si « Retry » doit reprendre une photo (la même ne marchera pas). */
const ECHEC: Record<Exclude<FighterScanIssue, null>, [string, boolean]> = {
  'no-face': ['No face found. Face the camera in good light.', true],
  blocked: ["This photo can't be drawn. Try another one.", true],
  timeout: ['Still drawing after 30 s: the AI is slow right now. Keep waiting, or:', false],
  'no-portrait': ["Your cartoon head didn't come out this time.", false],
  offline: ["Can't reach the AI. Check the connection.", false],
};

/** Photo d'une personne (lot LFACE) : capture seule. La forge tourne ensuite dans l'encart du joueur, pendant que
 * l'autre joueur fait déjà son scan. */
async function snapPhoto(area: HTMLElement): Promise<Blob | null> {
  clear(area);
  const capture = mountCapture('Center your face in the oval, or drop in a photo. Only used to draw your fighter: nothing is saved.', { face: true });
  const back = button('Back', 'b-btn small', () => {
    capture.dispose();
    resolveBack(null);
  });
  let resolveBack!: (v: null) => void;
  const cancelled = new Promise<null>((r) => (resolveBack = r));
  area.append(capture.root, back);
  const shot = await Promise.race([capture.result, cancelled]);
  if (!shot) return null;
  capture.dispose();
  return shot.blob;
}

const FORGING = 'forging-';
const isForging = (f: FighterDef | null) => !!f && f.id.startsWith(FORGING);

// Nom modifiable et message d'échec du scan (lot LFACE) : ajouts minimes, couleurs du thème existant.
const LFACE_CSS = `
.fighter-panel input.name-input { width:100%; min-width:0; border:0; border-bottom:3px dashed var(--b-encre); background:transparent;
  color:inherit; font:400 clamp(24px, 3.6vh, 36px)/1 var(--b-display); padding:0 0 2px; text-align:inherit; }
.fighter-panel input.name-input:focus { outline:none; border-bottom-style:solid; }
.fighter-panel .fighter-issue { font-size:14px; font-weight:700; }
.fighter-panel .forge { transform:scale(.7); transform-origin:center; margin:-14px 0; }
.fighter-side .capture-zone { position:relative; }
.fighter-side .capture-oval { position:absolute; left:50%; top:50%; height:74%; aspect-ratio:3/4; transform:translate(-50%,-50%);
  border:4px dashed var(--b-vinyle); border-radius:50%; box-shadow:0 0 0 2px var(--b-encre); pointer-events:none; }
.fighter-stage { height:clamp(220px, 34vh, 400px); }
.fighter-stage-canvas { display:block; width:100%; height:100%; }
.fighter-side:not([hidden]) ~ .fighter-stage { display:none !important; }
.fighters-card:has(.fighter-stage:not([hidden])) .fighter-grid { display:none !important; }`;
function injecterStyles(): void {
  if (document.getElementById('lface-css')) return;
  const s = document.createElement('style');
  s.id = 'lface-css';
  s.textContent = LFACE_CSS;
  document.head.append(s);
}

function tile(f: FighterDef, onPick: () => void): HTMLDivElement {
  const t = el('div', 'fighter-tile');
  t.tabIndex = 0;
  t.append(fighterPortrait(f), el('span', 'fighter-tile-name', f.name), el('span', 'fighter-tokens'));
  t.addEventListener('click', onPick);
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick();
    }
  });
  return t;
}

export function runFighterSelect(screenLayer: HTMLElement, vsAI = false): Promise<[FighterDef, FighterDef]> {
  clear(screenLayer);
  const { root, card } = menuScreen('fighters-card');
  const head = el('div', 'screen-head');
  const title = el('h2', 'b-title', '');
  head.append(title);
  const grid = el('div', 'fighter-grid');
  const side = el('div', 'fighter-side'); // capture photo / enregistrement de voix, à la place de la grille
  side.hidden = true;
  const panels = el('div', 'fighter-panels');
  const ready = button('Ready to fight!', 'b-btn cta ready-bar');
  const foot = el('div', 'screen-foot');
  foot.append(ready);
  // Vitrine 3D (lot LFACE) : les 2 persos côte à côte à la place de la grille dès qu'un perso photo est prêt.
  const stage = el('div', 'fighter-stage');
  stage.hidden = true;
  // Lot LWAIT : une astuce de jeu tourne sous les encarts tant qu'une tête se prépare.
  const tip = el('p', 'lwait-tip');
  tip.hidden = true;
  let tipStop: (() => void) | null = null;
  card.append(head, grid, side, stage, panels, tip, foot);
  screenLayer.append(root);

  const picks: [FighterDef | null, FighterDef | null] = [null, null];
  let picking: PlayerId = 0;
  const human = (p: PlayerId) => !(vsAI && p === 1);
  const tiles = new Map<string, HTMLDivElement>();
  const voiceReady: [boolean, boolean] = [false, false];
  const scanned = new Set<string>(); // persos issus d'une photo : nom modifiable
  // Lot LWAIT : perso photo dont la tête n'est pas ENCORE affichée sur le perso 3D (ou joueur qui doit décider).
  const pending = new Set<string>();
  const enCuisson = (f: FighterDef | null) => isForging(f) || (!!f && pending.has(f.id));
  // Écran d'attente de la tête, par joueur (il survit aux render() : on le déplace d'un encart à l'autre).
  const forges: [HeadForge | null, HeadForge | null] = [null, null];
  const decision: [boolean, boolean] = [false, false]; // échec affiché : le joueur doit choisir
  prechaufferScanFighter();
  let vitrine: Vitrine | null = null;
  let vitrineIds = '';
  let regrid = false; // un joueur a cliqué son encart pour rechoisir : la grille revient
  injecterStyles();

  /** Nom du perso photo : proposé par Gemini, le joueur tape le sien par-dessus (HUD et écran de fin le reprennent). */
  function nameField(f: FighterDef, p: PlayerId): HTMLInputElement {
    const input = document.createElement('input');
    input.className = 'fighter-panel-name name-input';
    input.value = f.name;
    input.maxLength = 14;
    input.spellcheck = false;
    input.placeholder = 'Your name';
    input.setAttribute('aria-label', `Player ${p + 1} name`);
    const propose = f.name;
    input.addEventListener('input', () => { f.name = input.value.trim() || propose; });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // pas de raccourci de jeu pendant la frappe
      if (e.key === 'Enter') input.blur();
    });
    return input;
  }

  function panel(p: PlayerId): HTMLDivElement {
    const f = picks[p];
    const box = el('div', `fighter-panel p${p + 1}${picking === p && !f ? ' picking' : ''}`);
    box.append(el('span', `ptoken p${p + 1}`, human(p) ? `P${p + 1}` : 'AI'));
    const forge = forges[p];
    if (forge) {
      // Lot LWAIT : étapes réelles, perso 3D, tampon Ready! ; l'encart ne redevient normal qu'après.
      box.classList.add('lwait-on');
      box.append(forge.root);
    } else if (isForging(f)) {
      box.append(mountForge(`Drawing P${p + 1}'s big head…`).root);
    } else if (f) {
      box.append(fighterPortrait(f, p));
      const text = el('div', 'fighter-panel-text');
      text.append(scanned.has(f.id) && human(p) ? nameField(f, p) : el('strong', 'fighter-panel-name', f.name));
      if (f.catchphrase) text.append(el('span', 'fighter-quote', `"${f.catchphrase}"`));
      box.append(text);
      if (scanned.has(f.id) && human(p)) box.append(button('New photo', 'b-btn small alt', () => void snapFor(p)));
      if (human(p)) {
        if (voiceReady[p]) box.append(el('span', 'voice-badge', 'Voice ready'));
        else
          box.append(
            button('Use my voice', 'b-btn small voice-btn', async () => {
              side.hidden = false;
              grid.hidden = true;
              const back = () => {
                side.hidden = true;
                grid.hidden = false;
                clear(side);
              };
              await promptVoiceClone(p, side, () => {
                voiceReady[p] = true;
                render();
              }).catch(() => undefined);
              // Micro refusé : rien n'a été monté, on revient tout de suite. Sinon l'enregistrement dure 12 s
              // (le clonage finit en arrière-plan, le badge « Voice ready » arrive tout seul).
              if (!side.childElementCount) back();
              else window.setTimeout(back, 12500);
            }),
          );
        box.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('button, input')) return;
          picking = p;
          regrid = true;
          render();
        });
      }
    } else {
      box.append(el('div', 'fighter-panel-empty', human(p) ? 'Pick a fighter' : 'AI picks…'));
    }
    return box;
  }

  function render() {
    const who = picks[0] && picks[1] ? null : picking;
    title.replaceChildren();
    if (who == null) title.append('Fighters ready!');
    else {
      title.append(el('span', `ptoken p${who + 1}`, `P${who + 1}`), ' choose your fighter');
    }
    // Une même case peut porter plusieurs persos (Snap yourself : un perso photo par joueur).
    const parCase = new Map<HTMLDivElement, PlayerId[]>();
    for (const [id, t] of tiles) {
      const joueurs = parCase.get(t) ?? [];
      ([0, 1] as PlayerId[]).forEach((p) => { if (picks[p]?.id === id) joueurs.push(p); });
      parCase.set(t, joueurs);
    }
    for (const [t, joueurs] of parCase) {
      t.querySelector('.fighter-tokens')!.replaceChildren(
        ...joueurs.sort().map((p) => el('span', `ptoken small p${p + 1}`, human(p) ? `P${p + 1}` : 'AI')),
      );
    }
    panels.replaceChildren(panel(0), panel(1));
    ready.disabled = !(picks[0] && picks[1]) || picks.some(enCuisson);
    // Lot LWAIT : le bouton dit ce qu'on attend (on ne part jamais sans sa tête).
    const attendus = ([0, 1] as PlayerId[]).filter((k) => enCuisson(picks[k]));
    const hesite = attendus.find((k) => decision[k]);
    ready.textContent =
      hesite != null ? `P${hesite + 1}: retry or use a default head`
      : attendus.length === 2 ? 'Waiting for both heads…'
      : attendus.length === 1 ? `Waiting for P${attendus[0] + 1}'s head…`
      : 'Ready to fight!';
    ready.classList.toggle('lwait-wait', attendus.length > 0);
    const cuisson = forges.some(Boolean);
    tip.hidden = !cuisson;
    if (cuisson && !tipStop) tipStop = mountTips(tip);
    else if (!cuisson && tipStop) { tipStop(); tipStop = null; }
    const montrer = !!(picks[0] && picks[1]) && !picks.some(enCuisson) && picks.some((f) => !!f && scanned.has(f.id)) && !regrid;
    const ids = montrer ? `${picks[0]!.id}|${picks[1]!.id}` : '';
    if (ids !== vitrineIds) {
      vitrine?.dispose();
      vitrine = null;
      stage.replaceChildren();
      vitrineIds = ids;
      if (montrer) {
        vitrine = mountVitrine([picks[0]!, picks[1]!]);
        if (vitrine) stage.append(vitrine.root);
      }
    }
    stage.hidden = !(montrer && vitrine);
    ready.classList.toggle('go', !ready.disabled);
  }

  function choose(f: FighterDef) {
    picks[picking] = f;
    regrid = false;
    if (vsAI && picking === 0 && !picks[1]) {
      const others = FIGHTER_PRESETS.filter((x) => x.id !== f.id);
      picks[1] = others[Math.floor(Math.random() * others.length)];
    }
    const next = ([0, 1] as PlayerId[]).find((p) => !picks[p] && human(p));
    if (next != null) picking = next;
    render();
  }

  for (const f of FIGHTER_PRESETS) {
    const t = tile(f, () => choose(f));
    tiles.set(f.id, t);
    grid.append(t);
  }
  const snap = el('div', 'fighter-tile snap-tile');
  snap.tabIndex = 0;
  const icon = el('div', 'snap-icon');
  icon.innerHTML = CAMERA_SVG;
  snap.append(icon, el('span', 'fighter-tile-name', 'Snap yourself'), el('span', 'fighter-tokens'));
  /** Photo du joueur p, puis son écran d'attente dans SON encart : le tour passe tout de suite à l'autre joueur (2 scans
   * en parallèle). */
  async function snapFor(p: PlayerId): Promise<void> {
    grid.hidden = true;
    side.hidden = false;
    const blob = await snapPhoto(side);
    side.hidden = true;
    grid.hidden = false;
    clear(side);
    if (!blob) return;
    void lancerScan(p, blob);
  }

  /** Lot LWAIT : chaque étape RÉELLE du scan avance l'écran d'attente ; le perso n'est « prêt » que quand sa grosse tête
   * est affichée sur le perso 3D. Échec ou 30 s sans tête : le joueur choisit (Retry ou tête par défaut) ; une tête
   * qui arrive pendant qu'il hésite est prise tout de suite. */
  async function lancerScan(p: PlayerId, blob: Blob): Promise<void> {
    forges[p]?.dispose();
    decision[p] = false;
    const forge = mountHeadForge({ photoUrl: URL.createObjectURL(blob), player: p });
    forges[p] = forge;
    getRuntimeCtx()?.bus.emit('ui:click', { kind: 'shutter' }); // le déclic de l'appareil
    const forging: FighterDef = { id: `${FORGING}${p}-${Date.now()}`, name: 'Forging…', model: 'knight', hpMax: 100, power: 3, agility: 3 };
    let courant: FighterDef = forging;
    let report: Awaited<ReturnType<typeof scanFighterReport>> | null = null;
    tiles.set(forging.id, snap);
    picking = p;
    choose(forging);
    const actif = () => forges[p] === forge && picks[p] === courant;
    /** Le perso de cet essai (texte arrivé, ou tête arrivée sans texte) remplace la forge dans l'état. */
    const adopter = (f: FighterDef) => {
      if (!actif() || courant === f) return;
      tiles.delete(courant.id);
      pending.delete(courant.id);
      courant = f;
      picks[p] = f;
      pending.add(f.id);
      scanned.add(f.id);
      tiles.set(f.id, snap);
      render();
    };
    let teteEnCours = false;
    const surTete = async (f: FighterDef) => {
      if (teteEnCours) return;
      teteEnCours = true;
      adopter(f);
      if (!actif()) return;
      decision[p] = false;
      forge.clearFail();
      render();
      const ok = await forge.head(f);
      if (!actif()) return;
      if (ok === false) {
        teteEnCours = false;
        echec("Your head didn't stick to the body.", false);
        return;
      }
      // Tête affichée sur le perso 3D (ou, sans WebGL ici, en 2D) : on peut partir. Le tampon reste un instant.
      pending.delete(f.id);
      render();
      window.setTimeout(() => {
        if (forges[p] !== forge) return;
        forge.dispose();
        forges[p] = null;
        render();
      }, durees.bandeau + durees.glisse);
    };
    /** Échec : message clair et 2 choix ; rien ne part tout seul. */
    const echec = (message: string, nouvellePhoto: boolean) => {
      if (!actif()) return;
      decision[p] = true;
      forge.fail(message, [
        [nouvellePhoto ? 'New photo' : 'Retry', () => (nouvellePhoto ? void snapFor(p) : void lancerScan(p, blob))],
        ['Use a default head', () => teteParDefaut()],
      ]);
      render();
    };
    /** Le perso sans grosse tête (tête KayKit) ; une copie, pour qu'une tête tardive ne le change plus. */
    const teteParDefaut = () => {
      if (!actif()) return;
      const base = courant === forging ? report?.fighter ?? courant : courant;
      const f: FighterDef = {
        ...base,
        id: `${base.id}-default`,
        portraitUrl: undefined,
        look: base.look ? { ...base.look, faceUrl: undefined, backUrl: undefined } : undefined,
      };
      forge.dispose();
      forges[p] = null;
      decision[p] = false;
      tiles.delete(courant.id);
      pending.delete(courant.id);
      courant = f;
      picks[p] = f;
      scanned.add(f.id);
      tiles.set(f.id, snap);
      render();
    };
    report = await scanFighterReport(blob, {
      attenteMs: ATTENTE_TETE_MS,
      onProgress: (e) => {
        if (!actif()) return;
        if (e.step === 'traits') forge.traits(e.preview);
        else if (e.step === 'text') {
          adopter(e.fighter);
          forge.text(e.fighter);
        } else if (e.step === 'sheet') forge.sheet(e.url);
        else void surTete(e.fighter);
      },
    });
    if (!actif() || teteEnCours) return;
    if (!report.issue) {
      // Même photo déjà réussie (cache) : aucune étape n'est passée, on construit directement.
      forge.text(report.fighter);
      void surTete(report.fighter);
      return;
    }
    const [message, nouvellePhoto] = ECHEC[report.issue];
    echec(message, nouvellePhoto);
  }

  snap.addEventListener('click', () => void snapFor(picking));
  grid.append(snap);
  render();

  // Lot LE2E : portrait arrivé après le délai sur un perso choisi → encart et vitrine le montrent.
  const offPortrait = getRuntimeCtx()?.bus.on('fighter:portrait', ({ fighterId }) => {
    const p = ([0, 1] as PlayerId[]).find((k) => picks[k]?.id === fighterId);
    if (p == null || !root.isConnected) return;
    vitrineIds = '';
    render();
  });

  return new Promise((resolve) => {
    ready.addEventListener('click', () => {
      if (!picks[0] || !picks[1] || picks.some(enCuisson)) return;
      vitrine?.dispose();
      vitrine = null;
      offPortrait?.();
      for (const f of forges) f?.dispose();
      tipStop?.();
      resolve([picks[0], picks[1]]);
    });
  });
}
