// Lot LU — interface. install(ctx) assemble tous les écrans : titre → perso → arsenal → présentation → map → HUD
// → fin. Chaque écran vit dans son propre fichier (src/ui/screen*.ts) ; celui-ci ne fait qu'enchaîner les phases,
// comme src/main.ts le fait pour les lots. Ne JAMAIS `await` la partie longue ici : `install` doit rendre la main
// tout de suite, sinon ctx.loop.start() (appelé après tous les install() dans main.ts) ne serait jamais atteint.
import { MOVE_BUDGET } from '../core/state';
import type { Ctx, FighterDef, Install, MapId, PlayerId, Weapon } from '../core/types';
import { clear, el } from './dom';
import { runEndScreen } from './endscreen';
import { mountHud } from './hud';
import { createMatchLog } from './matchLog';
import { runArsenal } from './screenArsenal';
import { runFighterSelect } from './screenFighters';
import { runMapSelect } from './screenMap';
import { runReveal } from './screenReveal';
import { mountTitle } from './screenTitle';
import { installSnapTime } from './snapTime';
import { injectGoogleFonts, injectStyles } from './theme';
import { installParryHud } from './parry-hud';

interface Picks {
  fighters: [FighterDef, FighterDef];
  weapons: [Weapon[], Weapon[]];
  map: MapId;
}

/** hooks.startMatch (src/core/hooks.ts, lot L0) ne pose pas fighters/weapons dans state.players : on le fait ici. */
function applyPicksToState(ctx: Ctx, picks: Picks): void {
  ctx.state.mapId = picks.map;
  for (const player of [0, 1] as PlayerId[]) {
    const ps = ctx.state.players[player];
    ps.fighter = picks.fighters[player];
    ps.hp = ps.fighter.hpMax;
    // Clone à cooldown 0 : une revanche avec les mêmes armes ne doit pas hériter du cooldown du match précédent.
    ps.weapons = picks.weapons[player].map((w) => ({ ...w, cooldown: 0 }));
    ps.selected = 0;
    ps.alive = true;
    ps.parryStreak = 0;
    ps.jumpUsed = false;
    ps.moveLeft = MOVE_BUDGET;
  }
}

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
  installParryHud(ctx, hud.root);

  ctx.bus.on('match:start', () => clear(screenLayer));

  async function runPreMatch(): Promise<Picks> {
    ctx.bus.emit('phase:change', { from: ctx.state.phase, to: 'fighter-select' });
    const fighters = await runFighterSelect(screenLayer);

    ctx.bus.emit('phase:change', { from: 'fighter-select', to: 'arsenal' });
    const arsenal = await runArsenal(screenLayer);

    ctx.bus.emit('phase:change', { from: 'arsenal', to: 'reveal' });
    await runReveal(ctx, screenLayer, arsenal);

    ctx.bus.emit('phase:change', { from: 'reveal', to: 'map-select' });
    const map = await runMapSelect(screenLayer);
    clear(screenLayer);
    return { fighters, weapons: arsenal.weapons, map };
  }

  let globalVsAI = false;
  let globalDifficulty: 'easy' | 'medium' | 'hard' | 'hardcore' = 'medium';

  async function playMatch(picks: Picks): Promise<void> {
    applyPicksToState(ctx, picks);
    ctx.hooks.startMatch({ fighters: picks.fighters, weapons: picks.weapons, map: picks.map, vsAI: globalVsAI, difficulty: globalDifficulty });
    const action = await runEndScreen(ctx, screenLayer, matchLog);
    if (action === 'rematch') return playMatch(picks);
    return preMatchLoop();
  }

  async function preMatchLoop(): Promise<void> {
    return playMatch(await runPreMatch());
  }

  async function boot() {
    const titleOpts = await mountTitle(screenLayer);
    if (titleOpts && titleOpts.vsAI) {
      globalVsAI = titleOpts.vsAI;
      if (titleOpts.difficulty) globalDifficulty = titleOpts.difficulty;
    } else {
      globalVsAI = false;
    }
    await preMatchLoop();
  }

  void boot();
};
