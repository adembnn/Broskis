import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type RAPIER from '@dimforge/rapier3d-compat';

let enabled = false;
let group: THREE.Group | null = null;
const meshes = new Map<number, THREE.Mesh>();

const geos = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 8, 8),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8)
};

const mats = {
  ground: new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: true, depthTest: false, transparent: true, opacity: 0.6 }),
  platform: new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, depthTest: false, transparent: true, opacity: 0.8 }),
  cover: new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, depthTest: false, transparent: true, opacity: 0.8 }),
  trigger: new THREE.MeshBasicMaterial({ color: 0xffa500, wireframe: true, depthTest: false, transparent: true, opacity: 0.8 }),
  player: new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, depthTest: false, transparent: true, opacity: 0.8 })
};

function getMaterial(c: RAPIER.Collider): THREE.Material {
  const body = c.parent();
  const ud = body?.userData as any;
  if (ud?.kind === 'player') return mats.player;
  if (ud?.kind === 'oneway' || ud?.oneWay) return mats.platform;
  
  const rt = (window as any).__getMapRuntime?.();
  if (rt) {
    if (rt.triggerByCollider?.has(c.handle)) {
      const propId = rt.triggerByCollider.get(c.handle);
      const prop = rt.props?.get(propId);
      if (prop && prop.kind === 'decor') return mats.cover;
      if (prop) return mats.trigger;
    }
  }
  return mats.ground;
}

export function installDebugColliders(ctx: Ctx): void {
  ctx.hooks.debugColliders = (on: boolean) => {
    enabled = on;
    if (!enabled && group) {
      group.removeFromParent();
      group = null;
      meshes.clear();
    }
    if (enabled && !group) {
      group = new THREE.Group();
      group.renderOrder = 999;
      ctx.three.scene.add(group);
    }
  };

  ctx.loop.addSystem('debug-colliders', () => {
    if (!enabled || !group) return;
    
    const active = new Set<number>();
    
    ctx.physics.world.forEachCollider((c) => {
      active.add(c.handle);
      let m = meshes.get(c.handle);
      
      const anyC = c as any;
      const shapeType = anyC.shapeType ? anyC.shapeType() : -1;
      
      if (!m) {
        let geo: THREE.BufferGeometry = geos.box;
        let scale = [1, 1, 1];
        
        if (shapeType === 1 && anyC.halfExtents) { // Cuboid
          const he = anyC.halfExtents();
          scale = [he.x * 2, he.y * 2, he.z * 2];
        } else if (shapeType === 0 && anyC.radius) { // Ball
          geo = geos.sphere;
          const r = anyC.radius();
          scale = [r, r, r];
        } else if (shapeType === 8 && anyC.radius && anyC.halfHeight) { // Cylinder
          geo = geos.cylinder;
          const r = anyC.radius();
          const h = anyC.halfHeight();
          scale = [r, h * 2, r];
        } else {
          // Fallback to AABB (absent de cette version de rapier3d-compat pour certaines formes : on ignore)
          if (typeof anyC.computeAabb !== 'function') return;
          const aabb = anyC.computeAabb();
          scale = [aabb.max.x - aabb.min.x, aabb.max.y - aabb.min.y, aabb.max.z - aabb.min.z];
        }
        
        m = new THREE.Mesh(geo, getMaterial(c));
        m.scale.set(scale[0], scale[1], scale[2]);
        group!.add(m);
        meshes.set(c.handle, m);
      }
      
      if (shapeType !== 1 && shapeType !== 0 && shapeType !== 8) {
         if (typeof anyC.computeAabb !== 'function') return;
         const aabb = anyC.computeAabb();
         m.position.set((aabb.min.x + aabb.max.x)/2, (aabb.min.y + aabb.max.y)/2, (aabb.min.z + aabb.max.z)/2);
         m.quaternion.identity();
      } else {
         const t = c.translation();
         const r = c.rotation();
         m.position.set(t.x, t.y, t.z);
         m.quaternion.set(r.x, r.y, r.z, r.w);
      }
    });
    
    // Remove stale
    for (const [handle, m] of meshes.entries()) {
      if (!active.has(handle)) {
        m.removeFromParent();
        meshes.delete(handle);
      }
    }
  }, 100);
}
