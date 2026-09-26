import type { Ctx } from '../../core/types';
import { DIFFICULTY_LEVELS, type DifficultyLevel } from '../difficulty';

const MAP_LEVEL: Record<string, DifficultyLevel> = {
  easy: 'Facile',
  medium: 'Moyen',
  hard: 'Difficile',
  hardcore: 'Hardcore'
};

function randomNormal(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng(); // converting [0,1) to (0,1)
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function installParryBot(ctx: Ctx): void {
  ctx.bus.on('parry:window', (evt) => {
    // Si l'IA n'est pas activée, ou que le défenseur n'est pas l'IA (P2 = 1)
    if (!ctx.state.vsAI || evt.defender !== 1) return;

    const diffKey = ctx.state.difficulty || 'medium';
    const level = MAP_LEVEL[diffKey];
    const settings = DIFFICULTY_LEVELS[level];

    // Chance de complètement rater
    if (ctx.rng() < settings.parryMissRate) {
      return; // Ne fait rien, le timer d'impact dans parry.ts s'en chargera
    }

    // Calcul du décalage (offsetMs) selon une loi normale
    const offsetMs = randomNormal(ctx.rng) * settings.parrySigmaMs;
    const now = performance.now();
    const delay = evt.tImpact - now;

    // Planifier l'appel au hook
    // hooks.parry(offsetMs) s'attend à recevoir l'offsetMs
    // Il faut appeler hooks.parry environ au moment de l'impact + offset,
    // mais dans Broskis, hooks.parry(offsetMs) valide le coup "maintenant" 
    // en considérant offsetMs comme le décalage. En fait, l'agent peut l'appeler avec l'offset
    // calculé. Attendons-nous un peu pour que ce soit réaliste visuellement ?
    // "programmé pour tomber à tImpact"
    const timeToHit = Math.max(0, delay + offsetMs);
    
    setTimeout(() => {
      // On s'assure qu'on est toujours dans le même match/tour si nécessaire
      // mais resetParryState nettoiera si le match recommence.
      ctx.hooks.parry(offsetMs);
    }, timeToHit);
  });
}
