// Config Vite du test LE2E : celle du jeu (vraies API), sans rechargement à chaud ni surveillance des fichiers,
// pour qu'une modification du code pendant un test ne recharge pas la page au milieu du parcours.
import base from '../../vite.config.ts';

export default async (env) => {
  const c = typeof base === 'function' ? await base(env) : base;
  return { ...c, server: { ...(c.server ?? {}), hmr: false, watch: null } };
};
