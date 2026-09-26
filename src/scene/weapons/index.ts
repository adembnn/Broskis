// Lot LATK1 · « l'arme, c'est l'objet » (plan/lots/LATK-attaques-defenses.md) : l'objet scanné se voit du début
// à la fin, dans la main, en vol, à l'impact (éclats à sa couleur), en mur quand c'est un bouclier. N'écoute que
// le bus et lit l'état (jamais d'écriture de règles : le code du gameplay arbitre).
import type { Ctx } from '../../core/types';
import { installBlast } from './blast';
import { installFlights } from './flight';
import { installHands } from './hand';
import { installShields } from './shield';

export function installWeapons(ctx: Ctx): void {
  const blast = installBlast(ctx);
  const hands = installHands(ctx);
  const shields = installShields(ctx, blast);
  const flights = installFlights(ctx, {
    blast,
    handPos: hands.handPos,
    shot: hands.shot,
    arrived: shields.arrived,
  });

  // Après les persos (200) et la caméra (300) : la main est à jour, la caméra aussi (traînées face caméra).
  ctx.loop.addSystem('latk-armes', (dt, real) => {
    hands.update(dt, real);
    flights.update(dt);
    shields.update(dt);
    blast.update(dt, real);
  }, 420);
}
