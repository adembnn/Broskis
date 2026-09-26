// Monde physique Rapier (décor dynamique, chutes, contrôleur de personnage). Pas de fixe : on avance au rythme du temps de jeu.
import RAPIER from '@dimforge/rapier3d-compat';

export interface Physics {
  RAPIER: typeof RAPIER;
  world: RAPIER.World;
  step(dt: number): void;
}

export async function createPhysics(): Promise<Physics> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  return {
    RAPIER,
    world,
    step(dt) {
      if (dt <= 0) return;
      world.timestep = Math.min(dt, 1 / 30);
      world.step();
    },
  };
}
