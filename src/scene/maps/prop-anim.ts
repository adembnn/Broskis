import * as THREE from 'three';
import type { Ctx, Vec3 } from '../../core/types';
import { __getMapRuntime } from './engine';

export function install(ctx: Ctx) {
  let trembleArchipelRingUntil = 0;
  
  ctx.bus.on('map:warn', ({ kind }) => {
    if (kind === 'ring') {
      // Le préavis est de 3 secondes avant la chute (map:event)
      // On attend 2s puis on fait trembler pendant 1s
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

    if (kind === 'explosive') {
      // Gonflement 0,2 s avant l'explosion (il explose en l'air)
      ctx.loop.tween(0.2, (k) => {
        prop.holder.scale.setScalar(1 + k * 0.4);
      });
    } else if (kind === 'launcher') {
      // Grille-pain : ressort qui rebondit quand il lance
      ctx.loop.tween(0.1, (k) => {
        prop.holder.scale.y = 1 - k * 0.4;
      }).then(() => {
        ctx.loop.tween(0.3, (k) => {
          const elasticity = Math.sin(k * Math.PI * 3) * (1 - k);
          prop.holder.scale.y = 1 + elasticity * 0.5;
        });
      });
    } else if (kind === 'cannon') {
      // Canon du galion : recul
      const axis = prop.spec.cannonAxis ?? [1, 0, 0];
      const recul = new THREE.Vector3(-axis[0], -axis[1], -axis[2]).multiplyScalar(0.7);
      const basePos = prop.worldPos.clone();
      
      ctx.loop.tween(0.05, (k) => {
        prop.holder.position.copy(basePos).addScaledVector(recul, k);
      }).then(() => {
        ctx.loop.tween(0.4, (k) => {
          prop.holder.position.copy(basePos).addScaledVector(recul, 1 - k);
        });
      });
    }
  });

  const animateHit = (pos: Vec3) => {
    const map = __getMapRuntime();
    if (!map) return;
    
    for (const prop of map.props.values()) {
      // On n'anime que les objets qui sont encore "vivants" (ou les décors incassables)
      if (prop.dead && prop.kind !== 'decor') continue;
      
      const dx = prop.worldPos.x - pos[0], dz = prop.worldPos.z - pos[2];
      // Vérification de proximité (impact < 2m)
      if (dx * dx + dz * dz < 4) {
        if (prop.kind === 'decor' || prop.kind === 'knockable') {
          if (prop.id.includes('jar') || prop.id.includes('bocal')) {
             // Bocal : oscille
             const baseRotZ = prop.holder.rotation.z;
             ctx.loop.tween(0.4, (k) => {
               const angle = Math.sin(k * Math.PI * 5) * (1 - k) * 0.3;
               prop.holder.rotation.z = baseRotZ + angle;
             });
          } else {
             // Tonneaux et caisses : écrasement-étirement + petite rotation
             // Le rouleau roule tout seul grâce à Rapier/engine, on l'anime juste en scale
             const isKnockable = prop.kind === 'knockable';
             const baseRotY = prop.holder.rotation.y;
             ctx.loop.tween(0.15, (k) => {
               prop.holder.scale.set(1 + k * 0.2, 1 - k * 0.2, 1 + k * 0.2);
               // On évite de toucher à la rotation d'un objet dynamique (knockable) 
               // dont la rotation est mise à jour par la physique à chaque frame.
               if (!isKnockable) prop.holder.rotation.y = baseRotY + k * 0.15;
             }).then(() => {
               ctx.loop.tween(0.25, (k) => {
                 const inv = 1 - k;
                 prop.holder.scale.set(1 + inv * 0.2, 1 - inv * 0.2, 1 + inv * 0.2);
                 if (!isKnockable) prop.holder.rotation.y = baseRotY + inv * 0.15;
               });
             });
          }
        }
      }
    }
  };

  // Les props réagissent aux impacts
  ctx.bus.on('weapon:impact', ({ pos }) => animateHit(pos));
  ctx.bus.on('hit', ({ pos }) => animateHit(pos));
  ctx.bus.on('projectile:bounce', ({ pos }) => animateHit(pos));

  const prevPlayerY: Record<number, number> = {};

  ctx.loop.addSystem('prop-anim', () => {
    const map = __getMapRuntime();
    if (!map) return;
    const t = ctx.loop.time;

    // Balancement lent permanent (galion)
    if (map.def.id === 'galion') {
      const mat = ctx.three.scene.getObjectByName('mat');
      if (mat) {
        mat.rotation.x = Math.sin(t * 1.2) * 0.03;
        mat.rotation.z = Math.cos(t * 0.8) * 0.02;
      }
    }

    // Plateformes : enfoncement-rebond de 3 cm quand un joueur atterrit dessus
    for (const p of ctx.state.players) {
      const py = p.pos[1];
      const prevY = prevPlayerY[p.id] ?? py;
      prevPlayerY[p.id] = py;

      for (const pf of map.platforms) {
        if (pf.above[p.id] && py <= pf.spec.top[1] + 0.05 && prevY > pf.spec.top[1] + 0.05) {
          const root = ctx.three.scene.getObjectByName(`oneway-${pf.spec.id}`);
          if (root) {
            const baseY = pf.spec.top[1];
            ctx.loop.tween(0.1, (k) => {
              root.position.y = baseY - k * 0.03;
            }).then(() => {
              ctx.loop.tween(0.2, (k) => {
                root.position.y = baseY - 0.03 + k * 0.03;
              });
            });
          }
        }
      }
    }

    // Tremblement de l'archipel
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
        // Remise à l'état normal
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
  }, 250);
}
