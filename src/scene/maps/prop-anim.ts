import * as THREE from 'three';
import type { Ctx, Vec3 } from '../../core/types';
import { LOCAL_TOKENS } from './tokens';
import { __getMapRuntime } from './engine';

class Spring {
  x: number;
  target: number;
  constructor(x: number = 0, target: number = 0) {
    this.x = x;
    this.target = target;
  }
  v = 0;
  kick(v: number): void { this.v += v; }
  step(dt: number, k: number, c: number): void {
    const n = Math.min(24, Math.ceil(dt * 240));
    const h = n > 0 ? dt / n : 0;
    for (let i = 0; i < n; i++) {
      this.v += (-k * (this.x - this.target) - c * this.v) * h;
      this.x += this.v * h;
    }
  }
}

interface PropAnimState {
  squash: Spring;
  scaleX: Spring;
  scaleZ: Spring;
  tiltX: Spring;
  tiltZ: Spring;
  rotY: Spring;
  posX: Spring;
  posY: Spring;
  posZ: Spring;
  lastContact: number;
}

function getPropRadius(spec: any): number {
  const s = spec.scale ?? 1;
  const c = spec.collider;
  if (!c) return 1 * s;
  if (c.type === 'box') return Math.max(c.hx, c.hz) * s;
  if (c.type === 'cylinder') return c.radius * s;
  if (c.type === 'convex') {
    let mx = 0;
    for (const p of c.outline) mx = Math.max(mx, Math.hypot(p[0], p[1]));
    return mx * s;
  }
  return 1 * s;
}

export function install(ctx: Ctx) {
  let trembleArchipelRingUntil = 0;
  
  const animStates = new Map<string, PropAnimState>();
  const platStates = new Map<string, Spring>();

  const getState = (id: string) => {
    let s = animStates.get(id);
    if (!s) {
      s = {
        squash: new Spring(1, 1),
        scaleX: new Spring(1, 1),
        scaleZ: new Spring(1, 1),
        tiltX: new Spring(0, 0),
        tiltZ: new Spring(0, 0),
        rotY: new Spring(0, 0),
        posX: new Spring(0, 0),
        posY: new Spring(0, 0),
        posZ: new Spring(0, 0),
        lastContact: 0,
      };
      animStates.set(id, s);
    }
    return s;
  };

  ctx.bus.on('match:start', () => {
    animStates.clear();
    platStates.clear();
  });

  ctx.bus.on('map:warn', ({ kind }) => {
    if (kind === 'ring') {
      ctx.loop.later(2, () => {
        trembleArchipelRingUntil = ctx.loop.time + 1;
      });
    }
  });

  ctx.bus.on('prop:triggered', ({ propId, kind }) => {
    const map = __getMapRuntime();
    if (!map) return;
    const prop = map.props.get(propId);
    if (!prop || !prop.holder) return;

    const s = getState(propId);

    if (kind === 'explosive') {
      s.scaleX.target = 1.4;
      s.squash.target = 1.4;
      s.scaleZ.target = 1.4;
    } else if (kind === 'launcher') {
      // Grille-pain : plonge puis rebondit
      s.squash.x = 0.6;
      s.squash.target = 1;
    } else if (kind === 'cannon') {
      // Canon : recul
      const axis = prop.spec.cannonAxis ?? [1, 0, 0];
      const recul = new THREE.Vector3(-axis[0], -axis[1], -axis[2]).multiplyScalar(0.7);
      s.posX.x = recul.x;
      s.posY.x = recul.y;
      s.posZ.x = recul.z;
      s.posX.target = 0;
      s.posY.target = 0;
      s.posZ.target = 0;
    }
  });

  const animateHit = (pos: Vec3) => {
    const map = __getMapRuntime();
    if (!map) return;
    
    for (const prop of map.props.values()) {
      if (prop.dead && prop.kind !== 'decor') continue;
      
      const dx = prop.worldPos.x - pos[0], dz = prop.worldPos.z - pos[2];
      if (dx * dx + dz * dz < 4) {
        if (prop.kind === 'decor' || prop.kind === 'knockable') {
          const s = getState(prop.id);
          
          if (prop.id.includes('jar') || prop.id.includes('bocal')) {
             // Bocal : oscille
             s.tiltX.v += (Math.random() - 0.5) * 5;
             s.tiltZ.v += (Math.random() - 0.5) * 5;
          } else {
             // Tonneaux et caisses : écrasement 30 % + bascule 10° opposé + petite rotation
             s.squash.x = 1 - LOCAL_TOKENS.propAnim.squashHit; 
             const stretch = 1 + LOCAL_TOKENS.propAnim.squashHit; // conservation du volume visuel approx
             s.scaleX.x = stretch;
             s.scaleZ.x = stretch;
             
             const dist = Math.hypot(dx, dz);
             if (dist > 0.01) {
               const tiltAxis = new THREE.Vector3(dz, 0, -dx).normalize();
               const tiltRad = LOCAL_TOKENS.propAnim.tiltHitDeg * Math.PI / 180;
               s.tiltX.x += tiltAxis.x * tiltRad;
               s.tiltZ.x += tiltAxis.z * tiltRad;
             }
             
             const rotRad = LOCAL_TOKENS.propAnim.rotHitDeg * Math.PI / 180;
             s.rotY.x += (Math.random() - 0.5) * 2 * rotRad;
          }
        }
      }
    }
  };

  ctx.bus.on('weapon:impact', ({ pos }) => animateHit(pos));
  ctx.bus.on('hit', ({ pos }) => animateHit(pos));
  ctx.bus.on('projectile:bounce', ({ pos }) => animateHit(pos));

  const prevPlayerY: Record<number, number> = {};

  ctx.loop.addSystem('prop-anim', (dt) => {
    const map = __getMapRuntime();
    if (!map) return;
    const t = ctx.loop.time;
    
    const k = LOCAL_TOKENS.propAnim.stiffness;
    const c = LOCAL_TOKENS.propAnim.damping;

    // Contact des persos
    for (const prop of map.props.values()) {
      if (prop.dead && prop.kind !== 'decor') continue;
      // cibles : tonneau, caisse, bocal, flacon
      if (!prop.id.includes('barrel') && !prop.id.includes('crate') && !prop.id.includes('jar') && !prop.id.includes('bocal') && !prop.id.includes('tonneau') && !prop.id.includes('caisse') && !prop.id.includes('flacon')) continue;

      const s = getState(prop.id);
      if (t - s.lastContact < LOCAL_TOKENS.propAnim.contactCooldown) continue;

      const r = getPropRadius(prop.spec) + LOCAL_TOKENS.propAnim.contactRadiusPad;
      const r2 = r * r;

      for (const p of ctx.state.players) {
        if (!p.alive) continue;
        const dx = p.pos[0] - prop.worldPos.x;
        const dz = p.pos[2] - prop.worldPos.z;
        const dy = p.pos[1] - prop.worldPos.y;
        
        // joueur au sol et proche
        if (dy > -0.5 && dy < 1.5 && dx * dx + dz * dz < r2) {
          // bascule dans le sens de la course
          // on peut approximer la direction par yaw
          const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
          const tiltAxis = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize(); // produit vectoriel avec UP
          const tiltRad = LOCAL_TOKENS.propAnim.tiltContactDeg * Math.PI / 180;
          
          s.tiltX.x += tiltAxis.x * tiltRad;
          s.tiltZ.x += tiltAxis.z * tiltRad;
          s.lastContact = t;
          break; // au plus un contact par prop
        }
      }
    }

    // Mise à jour des ressorts de props
    for (const [id, s] of animStates.entries()) {
      s.squash.step(dt, k, c);
      s.scaleX.step(dt, k, c);
      s.scaleZ.step(dt, k, c);
      s.tiltX.step(dt, k, c);
      s.tiltZ.step(dt, k, c);
      s.rotY.step(dt, k, c);
      s.posX.step(dt, k, c);
      s.posY.step(dt, k, c);
      s.posZ.step(dt, k, c);

      const prop = map.props.get(id);
      if (prop && prop.holder) {
        // Appliquer position offset
        if (Math.abs(s.posX.x) > 1e-4 || Math.abs(s.posY.x) > 1e-4 || Math.abs(s.posZ.x) > 1e-4) {
          // On ajoute l'offset à la worldPos (qui vient de la physique pour les knockables)
          prop.holder.position.set(prop.worldPos.x + s.posX.x, prop.worldPos.y + s.posY.x, prop.worldPos.z + s.posZ.x);
        } else if (prop.kind === 'cannon') {
           prop.holder.position.set(prop.worldPos.x, prop.worldPos.y, prop.worldPos.z);
        }
        
        // Appliquer scale
        prop.holder.scale.set(s.scaleX.x, s.squash.x, s.scaleZ.x);
        
        // Appliquer rotation additive
        const isKnockable = prop.kind === 'knockable';
        // Si dynamique, holder.quaternion vient d'être mis à jour par engine.ts
        // S'il est statique, on utilise la base posée au chargement, mais engine ne la met pas à jour.
        // On applique l'offset.
        
        if (Math.abs(s.tiltX.x) > 1e-4 || Math.abs(s.tiltZ.x) > 1e-4 || Math.abs(s.rotY.x) > 1e-4) {
           const offsetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.tiltX.x, s.rotY.x, s.tiltZ.x, 'YXZ'));
           
           if (!isKnockable) {
              // On simule que la base statique avait un yaw donné par spec.yaw au chargement.
              // En fait prop.holder.rotation n'est pas overwritée, on doit la reseter et ajouter l'offset
              prop.holder.quaternion.setFromEuler(new THREE.Euler(0, prop.spec.yaw ?? 0, 0));
              prop.holder.quaternion.multiply(offsetQuat);
           } else {
              prop.holder.quaternion.multiply(offsetQuat);
           }
        } else if (!isKnockable) {
           prop.holder.quaternion.setFromEuler(new THREE.Euler(0, prop.spec.yaw ?? 0, 0));
        }
      }
    }

    // Galion : balancement
    if (map.def.id === 'galion') {
      const mat = ctx.three.scene.getObjectByName('mat');
      if (mat) {
        mat.rotation.x = Math.sin(t * 1.2) * 0.03;
        mat.rotation.z = Math.cos(t * 0.8) * 0.02;
      }
    }

    // Plateformes : atterrissage
    for (const p of ctx.state.players) {
      const py = p.pos[1];
      const prevY = prevPlayerY[p.id] ?? py;
      prevPlayerY[p.id] = py;

      for (const pf of map.platforms) {
        if (pf.above[p.id] && py <= pf.spec.top[1] + 0.05 && prevY > pf.spec.top[1] + 0.05) {
          let s = platStates.get(pf.spec.id);
          if (!s) {
            s = new Spring(0, 0);
            platStates.set(pf.spec.id, s);
          }
          s.x = -LOCAL_TOKENS.propAnim.platformDip;
        }
      }
    }

    for (const [id, s] of platStates.entries()) {
      s.step(dt, k, c);
      const root = ctx.three.scene.getObjectByName(`oneway-${id}`);
      const pf = map.platforms.find((p: any) => p.spec.id === id);
      if (root && pf) {
        root.position.y = pf.spec.top[1] + s.x;
      }
    }

    // Archipel : tremblement
    if (map.def.id === 'archipel') {
      if (t < trembleArchipelRingUntil) {
        for (const tile of map.tiles) {
          if (!tile.fallen && tile.ring === map.ringLevel) {
            const m4 = new THREE.Matrix4();
            const dx = (Math.random() - 0.5) * 0.04;
            const dz = (Math.random() - 0.5) * 0.04;
            m4.makeTranslation(tile.pos[0] + dx, tile.pos[1], tile.pos[2] + dz);
            if (map.tileMesh) {
              map.tileMesh.setMatrixAt(tile.index, m4);
              map.tileMesh.instanceMatrix.needsUpdate = true;
            }
          }
        }
      } else if (map.tileMesh && trembleArchipelRingUntil > 0 && t >= trembleArchipelRingUntil) {
        for (const tile of map.tiles) {
          if (!tile.fallen && tile.ring === map.ringLevel) {
            const m4 = new THREE.Matrix4();
            m4.makeTranslation(tile.pos[0], tile.pos[1], tile.pos[2]);
            map.tileMesh.setMatrixAt(tile.index, m4);
          }
        }
        map.tileMesh.instanceMatrix.needsUpdate = true;
        trembleArchipelRingUntil = 0;
      }
    }
  }, 250); // exécution à l'ordre 250, après engine.ts (qui est à 200, wait, "ctx.loop.addSystem('maps', ..., 200)")
}
