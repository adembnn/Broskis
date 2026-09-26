// Assemble un combattant : container (position/orientation) > squashWrapper (échelle animée) > modèle KayKit.
import * as THREE from 'three';
import { applyFighterLook } from '../fighter-custom';
import type { FighterDef, PlayerId, Ctx } from '../../core/types';
import { LOCAL_TOKENS } from '../localTokens';
import { setVinylRenderOrder } from '../render/toon';
import { FighterAnimator } from './animator';
import { instantiateFighterModel, loadMovementClips, type VinylMeshEntry } from './loader';

export interface FighterRig {
  container: THREE.Group;
  squashWrapper: THREE.Group;
  root: THREE.Object3D;
  animator: FighterAnimator;
  handSlotR: THREE.Object3D | null;
  handSlotL: THREE.Object3D | null;
  vinylMeshes: VinylMeshEntry[];
  moving: boolean;
  lastMoveAt: number;
  facing: number;
  /** Locomotion (fighters/index.ts) : dernière position cible, vitesses lissées, état en l'air. */
  prevTarget: THREE.Vector3;
  velXZ: THREE.Vector2;
  velY: number;
  airborne: boolean;
  groundedFor: number;
  minVelY: number;
}

/** Règle 2 (DA) : intercale les combattants du plus loin au plus proche (`rank` 0/1), sinon la marge vinyle
 * du perso de devant est mangée par le corps de celui de derrière. */
export function applyVinylRank(rig: FighterRig, rank: number): void {
  for (const { mesh, shells } of rig.vinylMeshes) setVinylRenderOrder(mesh, shells, rank);
}

const DEFAULT_MODELS: FighterDef['model'][] = ['barbarian', 'mage'];

export function defaultFighter(player: 0 | 1): FighterDef {
  return {
    id: `fallback-${player}`,
    name: player === 0 ? 'Player One' : 'Player Two',
    model: DEFAULT_MODELS[player],
    hpMax: 100,
    power: 3,
    agility: 3,
  };
}

export async function buildFighterRig(fighter: FighterDef, player: PlayerId, ctx: Ctx): Promise<FighterRig> {
  const [{ root, animations: own, vinylMeshes }, movement] = await Promise.all([
    instantiateFighterModel(fighter, player),
    loadMovementClips(),
  ]);
  // Un GLB vedette (LP2) peut ne pas avoir le squelette KayKit : on n'ajoute les clips du pack que s'il l'a.
  const animations = root.getObjectByName('hips') ? [...own, ...movement] : own;
  if (fighter.look) {
    try { await applyFighterLook(root, fighter.look); } catch (e) { console.error('[fighters] applyFighterLook', e); }
  }

  const squashWrapper = new THREE.Group();
  squashWrapper.add(root);
  const container = new THREE.Group();
  container.add(squashWrapper);
  container.name = `fighter-${fighter.id}`;

  const animator = new FighterAnimator(root, animations, LOCAL_TOKENS.fighterScale, player, ctx);
  animator.play(animator.has('idle') ? 'idle' : animations[0]?.name ?? 'idle');

  return {
    container,
    squashWrapper,
    root,
    animator,
    handSlotR: root.getObjectByName('handslot.r') ?? null,
    handSlotL: root.getObjectByName('handslot.l') ?? null,
    vinylMeshes,
    moving: false,
    lastMoveAt: -Infinity,
    facing: 0,
    prevTarget: new THREE.Vector3(),
    velXZ: new THREE.Vector2(),
    velY: 0,
    airborne: false,
    groundedFor: 0,
    minVelY: 0,
  };
}

/**
 * Détache le combattant de la scène pour une revanche. Ne dispose PAS géométrie/texture : SkeletonUtils.clone()
 * les partage avec le GLTF mis en cache (et les futurs clones) ; seuls les matériaux toon sont propres à cette
 * instance mais les mutualiser n'aiderait qu'un budget mémoire qu'on n'a pas atteint pendant un hackathon.
 */
export function disposeFighterRig(rig: FighterRig): void {
  rig.container.removeFromParent();
  rig.animator.mixer.stopAllAction();
  rig.animator.mixer.uncacheRoot(rig.root);
}
