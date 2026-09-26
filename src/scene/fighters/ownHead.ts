// Lot LE2E : dans SA propre vue, la grosse tête du joueur (vue de dos, au centre de l'écran) cachait l'objet en main et
// son lancer. Pendant la charge et juste après le lâcher, elle rétrécit (×0,85) et devient translucide (0,6), dans sa
// vue seulement : l'adversaire la voit toujours pleine. Rien n'est touché hors de ces instants ; les matériaux
// d'origine (lot LFACE) ne sont jamais modifiés : on pose des copies translucides le temps de la vue concernée.
import * as THREE from 'three';
import type { Ctx, PlayerId } from '../../core/types';
import { RTVIEW } from '../camera/tokens';

const reglage = RTVIEW.teteSienne;

export function installOwnHeadFade(ctx: Ctx, head: (p: PlayerId) => THREE.Object3D | null): void {
  // « Le lancer » = du lâcher jusqu'à la fin du vol de SON objet (ralenti compris), plus apresTirMs.
  const lastFire: [number, number] = [-1e9, -1e9];
  const enVol: [Set<string>, Set<string>] = [new Set(), new Set()];
  ctx.bus.on('fire', ({ player }) => { lastFire[player] = performance.now(); });
  ctx.bus.on('projectile:spawn', ({ id, owner }) => { if (owner != null) enVol[owner].add(id); });
  ctx.bus.on('projectile:end', ({ id }) => {
    for (const p of [0, 1] as const) if (enVol[p].delete(id)) lastFire[p] = performance.now();
  });
  ctx.bus.on('match:start', () => { enVol[0].clear(); enVol[1].clear(); });
  const ghosts = new WeakMap<THREE.Material, THREE.Material>();
  const isGhost = new WeakSet<THREE.Material>();
  const ghostOf = (m: THREE.Material): THREE.Material => {
    let g = ghosts.get(m);
    if (!g) {
      g = m.clone();
      g.transparent = true;
      g.opacity = reglage.opacite * m.opacity;
      g.depthWrite = false;
      ghosts.set(m, g);
      isGhost.add(g);
    }
    return g;
  };

  ctx.three.onBeforeView((view) => {
    for (const p of [0, 1] as const) {
      const tete = head(p);
      if (!tete) continue;
      const ps = ctx.state.players[p];
      const actif = view.player === p && ((ps.charge ?? 0) > 0 || enVol[p].size > 0 || performance.now() - lastFire[p] < reglage.apresTirMs);
      tete.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Matériau « vrai » : le dernier posé par quelqu'un d'autre que nous (LFACE peut le remplacer à tout moment).
        const cur = mesh.material;
        const first = Array.isArray(cur) ? cur[0] : cur;
        if (first && !isGhost.has(first)) mesh.userData.le2eVrai = cur;
        const vrai = mesh.userData.le2eVrai as THREE.Material | THREE.Material[] | undefined;
        if (!vrai) return;
        mesh.material = actif ? (Array.isArray(vrai) ? vrai.map(ghostOf) : ghostOf(vrai)) : vrai;
      });
      // Échelle : sur le sticker de la tête (enfant du pivot), jamais sur le pivot que le ressort anime.
      const sticker = tete.children[0];
      if (!sticker || sticker.userData.le2ePop) continue;
      sticker.userData.le2eEchelle ??= sticker.scale.x;
      sticker.scale.setScalar((sticker.userData.le2eEchelle as number) * (actif ? reglage.echelle : 1));
    }
  });
}
