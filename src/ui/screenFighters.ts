// Choix des 2 combattants façon Smash (lot LUX) : grille de portraits (4 persos + « Snap yourself »), jetons P1/P2
// posés sur la case choisie, un grand encart par joueur en bas (portrait, nom, réplique, bouton « Use my voice »
// du lot LW2). Contre l'IA, la machine prend un perso au hasard. Un seul appel à l'action : READY TO FIGHT!
import type { FighterDef, PlayerId } from '../core/types';
import { promptVoiceClone } from '../ia/voice';
import { scanFighter } from '../ia/fighter';
import { mountCapture } from './capture';
import { button, clear, el, menuScreen } from './dom';
import { mountForge } from './forge';
import { CAMERA_SVG } from './icons';
import { fighterPortrait } from './portraits';
import { FIGHTER_PRESETS } from './presets';

/** Photo d'une personne → combattant (lot LP), avec forge pendant l'attente, puis Confirmer / Refaire. */
async function snapYourself(area: HTMLElement, label: string): Promise<FighterDef | null> {
  clear(area);
  const capture = mountCapture('Show your face to the camera, or drop in a photo.');
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
  clear(area);
  const forge = mountForge(`Gemini is turning ${label} into a fighter…`);
  area.append(forge.root);
  const fighter = await scanFighter(shot.blob);
  return new Promise((resolve) => {
    clear(area);
    const wrap = el('div', 'fighter-confirm');
    wrap.append(fighterPortrait(fighter), el('h3', 'b-title', fighter.name));
    if (fighter.catchphrase) wrap.append(el('p', 'fighter-quote', `"${fighter.catchphrase}"`));
    const row = el('div', 'confirm-row');
    row.append(
      button('Confirm', 'b-btn', () => resolve(fighter)),
      button('Retry', 'b-btn small alt', () => {
        snapYourself(area, label).then(resolve);
      }),
    );
    wrap.append(row);
    area.append(wrap);
  });
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
  card.append(head, grid, side, panels, foot);
  screenLayer.append(root);

  const picks: [FighterDef | null, FighterDef | null] = [null, null];
  let picking: PlayerId = 0;
  const human = (p: PlayerId) => !(vsAI && p === 1);
  const tiles = new Map<string, HTMLDivElement>();
  const voiceReady: [boolean, boolean] = [false, false];

  function panel(p: PlayerId): HTMLDivElement {
    const f = picks[p];
    const box = el('div', `fighter-panel p${p + 1}${picking === p && !f ? ' picking' : ''}`);
    box.append(el('span', `ptoken p${p + 1}`, human(p) ? `P${p + 1}` : 'AI'));
    if (f) {
      box.append(fighterPortrait(f, p));
      const text = el('div', 'fighter-panel-text');
      text.append(el('strong', 'fighter-panel-name', f.name));
      if (f.catchphrase) text.append(el('span', 'fighter-quote', `"${f.catchphrase}"`));
      box.append(text);
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
          if ((e.target as HTMLElement).closest('button')) return;
          picking = p;
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
    for (const [id, t] of tiles) {
      const tokens = t.querySelector('.fighter-tokens')!;
      tokens.replaceChildren();
      ([0, 1] as PlayerId[]).forEach((p) => {
        if (picks[p]?.id === id) tokens.append(el('span', `ptoken small p${p + 1}`, human(p) ? `P${p + 1}` : 'AI'));
      });
    }
    panels.replaceChildren(panel(0), panel(1));
    ready.disabled = !(picks[0] && picks[1]);
    ready.classList.toggle('go', !ready.disabled);
  }

  function choose(f: FighterDef) {
    picks[picking] = f;
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
  snap.addEventListener('click', () => {
    const p = picking;
    grid.hidden = true;
    side.hidden = false;
    void snapYourself(side, `Player ${p + 1}`).then((f) => {
      side.hidden = true;
      grid.hidden = false;
      clear(side);
      if (!f) return;
      picking = p;
      tiles.set(f.id, snap);
      choose(f);
    });
  });
  grid.append(snap);
  render();

  return new Promise((resolve) => {
    ready.addEventListener('click', () => {
      if (picks[0] && picks[1]) resolve([picks[0], picks[1]]);
    });
  });
}
