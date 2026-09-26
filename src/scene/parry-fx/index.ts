import * as THREE from 'three';
import { palette } from '../../art/tokens';
import type { Ctx, PlayerId } from '../../core/types';
import { getFighterObject } from '../api';

interface ParryRing {
  mesh: THREE.Mesh;
  targetScale: number;
  tImpact: number;
  duration: number;
  defender: PlayerId;
}

interface RedOutline {
  mesh: THREE.Mesh;
  expire: number;
}

interface Spark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  expire: number;
}

interface Pulse {
  mesh: THREE.Mesh;
  expire: number;
  start: number;
}

export function installParryFx(ctx: Ctx): void {
  const rings: ParryRing[] = [];
  const outlines: RedOutline[] = [];
  const sparks: Spark[] = [];
  const pulses: Pulse[] = [];

  const ringGeo = new THREE.RingGeometry(0.9, 1.0, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: palette.joueur, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  
  const bandGeo = new THREE.RingGeometry(0.95, 1.05, 32); // thickness = perfect window conceptually represented by fixed width here
  const bandMat = new THREE.MeshBasicMaterial({ color: palette.danger, transparent: true, opacity: 0.9, side: THREE.DoubleSide });

  const sparkGeo = new THREE.PlaneGeometry(0.2, 0.2);
  const sparkMat = new THREE.MeshBasicMaterial({ color: palette.lumiere, transparent: true });

  const pulseGeo = new THREE.RingGeometry(0.8, 1.0, 32);
  const pulseMat = new THREE.MeshBasicMaterial({ color: palette.lumiere, transparent: true, opacity: 0.5, side: THREE.DoubleSide });

  ctx.bus.on('parry:window', ({ defender, tImpact }) => {
    const obj = getFighterObject(defender);
    if (!obj) return;
    
    // Zoom and desaturation
    if (ctx.three.canvas) {
      ctx.three.canvas.style.transition = 'filter 0.2s';
      ctx.three.canvas.style.filter = 'saturate(0.3)';
      setTimeout(() => {
        ctx.three.canvas.style.filter = 'saturate(1)';
      }, tImpact - performance.now());
    }

    const ring = new THREE.Mesh(ringGeo, ringMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    obj.add(ring);
    
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.rotation.x = -Math.PI / 2;
    band.position.y = 0.05;
    obj.add(band);

    rings.push({
      mesh: ring,
      targetScale: 1.0,
      tImpact,
      duration: tImpact - performance.now(),
      defender
    });
  });

  ctx.bus.on('parry:cue', ({ attacker }) => {
    const obj = getFighterObject(attacker);
    if (!obj) return;
    
    // Liseré rouge sur l'attaquant au lâcher
    const outlineMat = new THREE.MeshBasicMaterial({ color: palette.danger, transparent: true, opacity: 0.5, wireframe: true });
    const outlineGeo = new THREE.CylinderGeometry(1.2, 1.2, 3, 16); // Approximating the fighter bounds
    const outline = new THREE.Mesh(outlineGeo, outlineMat);
    outline.position.y = 1.5;
    obj.add(outline);
    
    outlines.push({ mesh: outline, expire: performance.now() + 100 });
  });

  ctx.bus.on('parry:result', ({ player, grade }) => {
    const obj = getFighterObject(player);
    // Cleanup rings for this player
    for (let i = rings.length - 1; i >= 0; i--) {
      if (rings[i].defender === player) {
        const r = rings.splice(i, 1)[0];
        if (r.mesh.parent) r.mesh.parent.remove(r.mesh);
      }
    }
    
    if (grade === 'perfect' && obj) {
      // Étincelles dorées
      for (let i = 0; i < 20; i++) {
        const spark = new THREE.Mesh(sparkGeo, sparkMat);
        spark.position.set(0, 1.5, 0);
        obj.add(spark);
        
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          Math.random() * 5,
          (Math.random() - 0.5) * 5
        );
        
        sparks.push({ mesh: spark, vel, expire: performance.now() + 600 });
      }
      // Gel de 120ms is already handled by camera/index.ts -> hitstop
    }
  });

  ctx.bus.on('feint', ({ player }) => {
    const obj = getFighterObject(player);
    if (!obj) return;
    
    // Anneau pulse sur l'objet (attaquant) toutes les 400ms
    const pulse = new THREE.Mesh(pulseGeo, pulseMat.clone());
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.2;
    obj.add(pulse);
    
    const start = performance.now();
    pulses.push({ mesh: pulse, start, expire: start + 300 });
  });

  ctx.loop.addSystem('parry-fx', (dt) => {
    const now = performance.now();
    
    // Update pulses
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      if (now > p.expire) {
        pulses.splice(i, 1);
        if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      } else {
        const k = (now - p.start) / 300;
        p.mesh.scale.setScalar(1 + k * 1.5);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
      }
    }
    
    // Update approach rings
    for (const r of rings) {
      const elapsed = r.duration - (r.tImpact - now);
      const k = Math.max(0, Math.min(1, elapsed / r.duration));
      const scale = THREE.MathUtils.lerp(3.0, 1.0, k);
      r.mesh.scale.setScalar(scale);
    }
    
    // Update red outlines
    for (let i = outlines.length - 1; i >= 0; i--) {
      if (now > outlines[i].expire) {
        const o = outlines.splice(i, 1)[0];
        if (o.mesh.parent) o.mesh.parent.remove(o.mesh);
      }
    }
    
    // Update sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      if (now > s.expire) {
        sparks.splice(i, 1);
        if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
      } else {
        s.mesh.position.addScaledVector(s.vel, dt);
        s.vel.y -= 9.8 * dt; // Gravity
      }
    }
  }, 100);
}
