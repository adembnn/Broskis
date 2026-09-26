import * as THREE from 'three';
import { joueurs } from '../../../art/tokens.js';
import type { Ctx } from '../../../core/types';
import { ParticleBurstSystem } from '../particles';
import { registry, excludeFromOcclusion } from '../../registry';

export function installSmashFx(ctx: Ctx): void {
  const { scene, camera, renderer } = ctx.three;

  // 1. Particle Systems
  const fxAdd = new ParticleBurstSystem(200, 'additive');
  const fxNorm = new ParticleBurstSystem(200, 'normal');
  scene.add(fxAdd.points, fxNorm.points);
  excludeFromOcclusion(fxAdd.points);
  excludeFromOcclusion(fxNorm.points);
  fxAdd.resize(renderer, camera);
  fxNorm.resize(renderer, camera);
  window.addEventListener('resize', () => { fxAdd.resize(renderer, camera); fxNorm.resize(renderer, camera); });

  // 2. Zoom KO & GAME Flash (Overlay)
  const overlayGeo = new THREE.PlaneGeometry(2, 2);
  const overlayMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uOpacity: { value: 0 },
      uRadialLines: { value: 0 },
      uVignette: { value: 0 },
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uRadialLines;
      uniform float uVignette;
      uniform float uTime;
      varying vec2 vUv;

      float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
      }

      void main() {
        vec2 center = vec2(0.5);
        vec2 uv = vUv - center;
        float dist = length(uv);
        
        float alpha = uOpacity;
        vec3 finalColor = uColor;

        if (uRadialLines > 0.0) {
          float angle = atan(uv.y, uv.x);
          float line = step(0.9, fract(angle * 10.0 + uTime * 20.0 + rand(vec2(angle))*0.5));
          float radialAlpha = line * uRadialLines * smoothstep(0.2, 0.8, dist);
          alpha = max(alpha, radialAlpha);
        }

        if (uVignette > 0.0) {
          float vig = smoothstep(0.4, 1.0, dist) * uVignette;
          alpha = max(alpha, vig);
          finalColor = mix(finalColor, vec3(1.0, 0.0, 0.0), vig);
        }

        gl_FragColor = vec4(finalColor, alpha);
        
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const overlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
  overlayMesh.frustumCulled = false;
  overlayMesh.renderOrder = 999;
  scene.add(overlayMesh);
  excludeFromOcclusion(overlayMesh);

  let overlayState = { opacity: 0, color: new THREE.Color(), radialLines: 0, vignette: 0, fadeOutTime: 0 };
  let bgDarken = 0;

  function flash(colorStr: string, opacity: number, duration: number, vignette: number = 0, radialLines: number = 0) {
    overlayState.color.set(colorStr);
    overlayState.opacity = opacity;
    overlayState.vignette = vignette;
    overlayState.radialLines = radialLines;
    overlayState.fadeOutTime = duration;
  }

  // 3. Launch Tracking
  interface LaunchedPlayer {
    active: boolean;
    v: number;
    spinSpeed: number;
    lastPos: THREE.Vector3;
    timer: number;
  }
  const launched: [LaunchedPlayer, LaunchedPlayer] = [
    { active: false, v: 0, spinSpeed: 0, lastPos: new THREE.Vector3(), timer: 0 },
    { active: false, v: 0, spinSpeed: 0, lastPos: new THREE.Vector3(), timer: 0 }
  ];

  ctx.bus.on('hit', (ev) => {
    if (ev.launch) {
      const pId = ev.target;
      const speed = Math.hypot(ev.launch[0], ev.launch[1], ev.launch[2]);
      if (speed > 1) {
        launched[pId].active = true;
        launched[pId].v = speed;
        launched[pId].spinSpeed = speed > 12 ? speed : 0;
        launched[pId].lastPos.set(...ctx.state.players[pId].pos);
        launched[pId].timer = 0;
      }
    }

    if (ev.willKo) {
      ctx.bus.emit('slowmo', { factor: 0.001, ms: 120 });
      setTimeout(() => {
        ctx.bus.emit('slowmo', { factor: 0.2, ms: 600 });
        ctx.bus.emit('camera:cue', { shot: 'impact', target: ev.target });
        flash('#000000', 0, 0.6, 1.0, 1.0);
      }, 120);
    }
  });

  // 4. Explosion de sortie (stock:lost)
  ctx.bus.on('stock:lost', ({ player, exitPos, side }) => {
    const pColor = player === 0 ? joueurs.p1.principal : joueurs.p2.principal;
    launched[player].active = false;
    const rig = registry.fighterRoots[player];
    if (rig) rig.rotation.x = 0;

    if (side === 'side' || side === 'bottom') {
      const pos = new THREE.Vector3(...exitPos);
      const dir = pos.clone().negate().normalize();
      fxAdd.burst(pos, { count: 30, color: [pColor, '#ffffff'], speed: [5, 15], life: [0.5, 1.0], size: [0.5, 1.5], direction: dir, spread: 0.5 });
      registry.shake?.add(0.6);
      flash(pColor, 0.5, 0.2);
    } else if (side === 'top') {
      if (rig) {
        starKOs.push({ obj: rig, timer: 1.0 });
      }
    }
  });
  
  const starKOs: { obj: THREE.Object3D, timer: number }[] = [];

  // 5. Réapparition (respawn)
  const respawnPlatforms: THREE.Mesh[] = [];
  ctx.bus.on('respawn', ({ player, pos }) => {
    const rig = registry.fighterRoots[player];
    if (rig) {
      rig.scale.setScalar(1);
      rig.rotation.x = 0;
    }

    const pColor = player === 0 ? joueurs.p1.principal : joueurs.p2.principal;
    const platGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 16);
    const platMat = new THREE.MeshBasicMaterial({ color: pColor, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    const plat = new THREE.Mesh(platGeo, platMat);
    plat.position.set(...pos);
    plat.position.y += 0.05;
    scene.add(plat);
    excludeFromOcclusion(plat);
    
    const haloGeo = new THREE.SphereGeometry(1.2, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({ color: pColor, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: true });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(...pos);
    halo.position.y += 1.0;
    scene.add(halo);
    excludeFromOcclusion(halo);
    
    respawnPlatforms.push(plat);
    respawnPlatforms.push(halo);
    
    setTimeout(() => {
      plat.removeFromParent();
      halo.removeFromParent();
      const idx1 = respawnPlatforms.indexOf(plat);
      if(idx1 > -1) respawnPlatforms.splice(idx1, 1);
      const idx2 = respawnPlatforms.indexOf(halo);
      if(idx2 > -1) respawnPlatforms.splice(idx2, 1);
    }, 2000);
  });

  // 6. Ledge grab
  ctx.bus.on('ledge:grab', ({ player }) => {
    const hand = registry.handSlots[player];
    if (hand) {
      const pos = new THREE.Vector3();
      hand.getWorldPosition(pos);
      fxNorm.burst(pos, { count: 10, color: '#ffffff', speed: [0.5, 1.5], life: [0.2, 0.4], size: [0.1, 0.2] });
      flash('#ffffff', 0.2, 0.1);
    }
  });

  // 7. BRO SMASH
  ctx.bus.on('super:fire', ({ player }) => {
    bgDarken = 0.8;
    const pColor = player === 0 ? joueurs.p1.principal : joueurs.p2.principal;
    
    const pos = ctx.state.players[player].pos;
    const p = new THREE.Vector3(...pos);
    fxAdd.burst(p, { count: 40, color: [pColor, '#ffffff'], speed: [2, 6], life: [0.2, 0.6], size: [0.2, 0.5], spread: 2.0 });
    
    const ringGeo = new THREE.TorusGeometry(1, 0.1, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: pColor, transparent: true, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(p);
    ring.position.y += 0.1;
    scene.add(ring);
    excludeFromOcclusion(ring);
    
    const startTime = performance.now();
    const animRing = () => {
      const t = (performance.now() - startTime) / 800;
      if (t > 1) {
        ring.removeFromParent();
        ringGeo.dispose();
        ringMat.dispose();
        return;
      }
      ring.scale.setScalar(1 + t * 4);
      ringMat.opacity = 1 - t;
      requestAnimationFrame(animRing);
    };
    requestAnimationFrame(animRing);
  });

  // 8. GAME!
  ctx.bus.on('match:banner', ({ kind }) => {
    if (kind === 'game') {
      ctx.bus.emit('slowmo', { factor: 0.001, ms: 500 });
      flash('#ffffff', 1.0, 0.8);
    }
  });

  // --- Loop ---
  ctx.loop.addSystem('smash-fx', (dt) => {
    const time = performance.now() / 1000;
    
    // Position overlay strictly in front of the camera
    overlayMesh.position.copy(camera.position);
    overlayMesh.quaternion.copy(camera.quaternion);
    overlayMesh.translateZ(-0.5); // 0.5 units in front
    
    if (overlayState.fadeOutTime > 0) {
      overlayState.opacity = Math.max(0, overlayState.opacity - (dt / overlayState.fadeOutTime));
      overlayState.radialLines = Math.max(0, overlayState.radialLines - (dt / overlayState.fadeOutTime));
      overlayState.vignette = Math.max(0, overlayState.vignette - (dt / overlayState.fadeOutTime));
      if (overlayState.opacity <= 0 && overlayState.radialLines <= 0 && overlayState.vignette <= 0) {
        overlayState.fadeOutTime = 0;
      }
    }
    
    if (bgDarken > 0) {
      bgDarken = Math.max(0, bgDarken - dt);
      overlayMat.uniforms.uOpacity.value = Math.max(overlayState.opacity, bgDarken * 0.7);
      overlayMat.uniforms.uColor.value.copy(bgDarken > overlayState.opacity ? new THREE.Color(0,0,0) : overlayState.color);
    } else {
      overlayMat.uniforms.uOpacity.value = overlayState.opacity;
      overlayMat.uniforms.uColor.value.copy(overlayState.color);
    }
    
    overlayMat.uniforms.uRadialLines.value = overlayState.radialLines;
    overlayMat.uniforms.uVignette.value = overlayState.vignette;
    overlayMat.uniforms.uTime.value = time;
    
    for (const p of [0, 1] as const) {
      const l = launched[p];
      if (l.active) {
        const pPosVec = new THREE.Vector3(...ctx.state.players[p].pos);
        const dist = l.lastPos.distanceTo(pPosVec);
        let currentSpeed = 0;
        if (dt > 0) currentSpeed = dist / dt;
        
        const speed = Math.max(l.v, currentSpeed);
        
        if (speed > 1) {
          const count = Math.min(20, Math.max(1, Math.floor(speed * 0.5)));
          fxNorm.burst(pPosVec, { count, color: '#aaaaaa', speed: [0.5, 2], life: [0.2, 0.5], size: [0.3, 0.6] });
        }
        
        const rig = registry.fighterRoots[p];
        if (l.spinSpeed > 12 && rig) {
          rig.rotation.x += l.spinSpeed * dt * 0.5;
          fxAdd.burst(pPosVec, { count: 3, color: '#ffffaa', speed: [2, 5], life: [0.1, 0.3], size: [0.1, 0.3] });
        }
        
        l.lastPos.copy(pPosVec);
        l.timer += dt;
        l.v = Math.max(0, l.v - dt * 20);
        
        if (speed < 1 || pPosVec.y <= 0.05 || ctx.state.players[p].onLedge) {
          l.active = false;
          if (rig) rig.rotation.x = 0;
        }
      }
    }
    
    for (let i = starKOs.length - 1; i >= 0; i--) {
      const ko = starKOs[i];
      ko.timer -= dt;
      if (ko.timer <= 0) {
        const pos = new THREE.Vector3();
        ko.obj.getWorldPosition(pos);
        fxAdd.burst(pos, { count: 20, color: '#ffffff', speed: [3, 8], life: [0.3, 0.6], size: [0.5, 1.0] });
        ko.obj.scale.setScalar(0.001);
        starKOs.splice(i, 1);
      } else {
        const s = Math.max(0.001, ko.timer);
        ko.obj.scale.setScalar(s);
        ko.obj.position.y += dt * 15;
      }
    }
    
    respawnPlatforms.forEach((plat, idx) => {
      if (idx % 2 === 1) {
        plat.visible = Math.floor(time * 10) % 2 === 0;
      }
    });

    fxAdd.update(dt);
    fxNorm.update(dt);
  }, 410);
}
