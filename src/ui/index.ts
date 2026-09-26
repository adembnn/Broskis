// Lot LU/LUX — interface. install(ctx) assemble tout : titre → persos → arsenal → présentation → map → match (HUD,
// aide, tutoriel) → fin → revanche ou menu. Chaque écran vit dans son propre fichier ; celui-ci ne fait qu'enchaîner.
// Ne JAMAIS `await` la partie longue ici : `install` doit rendre la main tout de suite, sinon ctx.loop.start()
// (appelé après tous les install() dans main.ts) ne serait jamais atteint.
import { durees } from '../art/tokens.js';
import type { Install, StartMatchOptions, Weapon } from '../core/types';
import { clear, el } from './dom';
import { showEndScreen } from './endscreen';
import { mountHud } from './hud';
import { createMatchLog } from './matchLog';
import { preloadPortraits } from './portraits';
import { FIGHTER_PRESETS, presetsReady } from './presets';
import { installScandexCollector } from './scandex/store';
import { runArsenal } from './screenArsenal';
import { runFighterSelect } from './screenFighters';
import { runMapSelect } from './screenMap';
import { runReveal } from './screenReveal';
import { mountTitle } from './screenTitle';
import { installSnapTime } from './snapTime';
import { installStickers, preloadPresetStickers } from './sticker2d';
import { injectGoogleFonts, injectStyles } from './theme';
import { installTutorial } from './tutorial';

type Difficulty = NonNullable<StartMatchOptions['difficulty']>;

/** Armes neuves (recharge 0) : une revanche ne doit pas hériter des recharges du match précédent. */
const freshWeapons = (list: Weapon[]): Weapon[] => list.map((w) => ({ ...w, stats: { ...w.stats }, cooldown: 0 }));

/** Laisse « GAME! » (bandeau + ralenti) se lire avant de couvrir la scène avec l'écran de fin. */
const END_DELAY_MS = durees.dramatique + 500;

export const install: Install = (ctx) => {
  injectGoogleFonts();
  injectStyles(ctx.three.uiRoot);

  const root = el('div', 'broskis-ui');
  const screenLayer = el('div', 'screen-layer');

  // Créés une seule fois pour toute la session : le HUD doit déjà écouter le bus avant le tout premier
  // ctx.hooks.startMatch (qui émet turn:start en synchrone), et matchLog se réinitialise seul à chaque match:start.
  const matchLog = createMatchLog(ctx);
  const hud = mountHud(ctx);
  root.append(hud.root, screenLayer);
  ctx.three.uiRoot.append(root);
  installSnapTime(ctx, screenLayer);
  installTutorial(ctx, hud.root);
  installStickers(ctx); // stickers arrivés en route → recopiés sur les armes du match
  void presetsReady.then(preloadPresetStickers);
  void preloadPortraits(FIGHTER_PRESETS);
  installScandexCollector(ctx); // Lot LW (Scandex) : enregistre chaque scan:result dans localStorage.

  let settings: { vsAI: boolean; difficulty: Difficulty } = { vsAI: false, difficulty: 'medium' };
  // Dernier match lancé, QUEL QUE SOIT le point d'entrée (parcours, hooks, labo) : la revanche le rejoue tel quel.
  let last: StartMatchOptions | null = null;
  let endPending = false;

  ctx.bus.on('match:start', () => {
    clear(screenLayer);
    endPending = false;
    const [a, b] = ctx.state.players;
    if (!a.fighter || !b.fighter) return;
    last = {
      fighters: [a.fighter, b.fighter],
      weapons: [freshWeapons(a.weapons), freshWeapons(b.weapons)],
      map: ctx.state.mapId,
      vsAI: ctx.state.vsAI,
      difficulty: ctx.state.difficulty,
    };
  });

  ctx.bus.on('match:end', ({ winner }) => {
    if (endPending) return;
    endPending = true;
    window.setTimeout(async () => {
      if (!endPending) return; // un nouveau match a démarré entre-temps (hooks, labo)
      if (ctx.state.phase !== 'end') ctx.bus.emit('phase:change', { from: ctx.state.phase, to: 'end' });
      const action = await showEndScreen(ctx, screenLayer, matchLog, winner);
      endPending = false;
      if (action === 'rematch' && last) startMatch(last);
      else if (action === 'menu') void toTitle();
    }, END_DELAY_MS);
  });

  function startMatch(opts: StartMatchOptions): void {
    const weapons = opts.weapons && ([freshWeapons(opts.weapons[0]), freshWeapons(opts.weapons[1])] as [Weapon[], Weapon[]]);
    ctx.hooks.startMatch({ ...opts, weapons });
  }

  async function toTitle(): Promise<void> {
    if (ctx.state.phase !== 'title') ctx.bus.emit('phase:change', { from: ctx.state.phase, to: 'title' });
    const titleOpts = await mountTitle(screenLayer);
    settings = { vsAI: !!titleOpts?.vsAI, difficulty: titleOpts?.difficulty ?? settings.difficulty };

    ctx.bus.emit('phase:change', { from: ctx.state.phase, to: 'fighter-select' });
    const fighters = await runFighterSelect(screenLayer, settings.vsAI);

    ctx.bus.emit('phase:change', { from: 'fighter-select', to: 'arsenal' });
    const arsenal = await runArsenal(screenLayer);

    ctx.bus.emit('phase:change', { from: 'arsenal', to: 'reveal' });
    await runReveal(ctx, screenLayer, arsenal);

    ctx.bus.emit('phase:change', { from: 'reveal', to: 'map-select' });
    const map = await runMapSelect(screenLayer);
    clear(screenLayer);
    startMatch({ fighters, weapons: arsenal.weapons, map, vsAI: settings.vsAI, difficulty: settings.difficulty });
  }

  void toTitle();
};
