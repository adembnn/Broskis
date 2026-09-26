// Adversaire IA temps réel (lot RTBOT) : P2 est joué par le bot quand `state.vsAI` (écran-titre → vs AI), UNIQUEMENT
// par les entrées. Réflexe local à 20 Hz (bot.ts) + Gemini stratège toutes les 8 s (strategist.ts, /api/ai-move).
// `window.__bot` : état du bot et mesures (tests), humain simulé des tests (`simHuman(true)`).
import type { Install } from '../../core/types';
import { RealtimeBot } from './bot';
import type { Stance } from './levels';
import { SimHuman } from './sim-human';
import { installStrategist, type StrategistStats } from './strategist';

declare global {
  interface Window {
    __bot?: {
      info(): Record<string, unknown> & { gemini: StrategistStats };
      /** Tests : P1 joué par un humain simulé (script simple). */
      simHuman(on?: boolean, seed?: number): void;
      /** Tests : force une posture (Gemini la remplacera à sa prochaine réponse). */
      setStance(stance: Stance): void;
      /** Tests : coupe Gemini (mesure du maintien de la posture sans réponse). */
      offline(on: boolean): void;
    };
  }
}

export const install: Install = (ctx) => {
  const bot = new RealtimeBot(ctx, 1);
  const strategist = installStrategist(ctx, bot);
  let sim: SimHuman | null = null;
  // Avant la lecture des entrées du gameplay (système « gameplay-input », ordre 40) : même image.
  ctx.loop.addSystem('ai-bot', () => {
    bot.step();
    sim?.step();
  }, 39);

  window.__bot = {
    info: () => ({ ...bot.debug(), gemini: strategist.stats }),
    simHuman: (on = true, seed = 7) => { sim = on ? new SimHuman(ctx, 0, undefined, seed) : null; },
    setStance: (stance) => bot.setPlan(stance, null),
    offline: (on) => { strategist.offline = on; },
  };
};
