import type { Install } from '../../core/types';
import { installParryBot } from './parry-bot';
import { installBrain } from './brain';
import { installTauntBubble } from './taunt-bubble';

export const install: Install = (ctx) => {
  installParryBot(ctx);
  installBrain(ctx);
  installTauntBubble(ctx);
};
