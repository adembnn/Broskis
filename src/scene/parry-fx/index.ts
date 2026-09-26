import * as THREE from 'three';
import { palette } from '../../art/tokens';
import type { Ctx } from '../../core/types';

export function installParryFx(ctx: Ctx): void {
  const { scene, camera, canvas } = ctx.three;
  
  // Materials
  const approachMat = new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide
  });
  const perfectMat = new THREE.MeshBasicMaterial({
    color: palette.lumiere, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide
  });
  const redAlertMat = new THREE.MeshBasicMaterial({
    color: palette.danger, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide
  });
  const sparkMat = new THREE.MeshBasicMaterial({
    color: palette.lumiere, transparent: true, opacity: 1.0, depthWrite: false
  });

  // State
  let activeRing: { mesh: THREE.Mesh, tEnd: number, startR: number, endR: number, tStart: number } | null = null;
  let staticBand: THREE.Mesh | null = null;
  let zoomTween: { tEnd: number, tStart: number, startZoom: number, endZoom: number, isReturning: boolean } | null = null;
  let activeRedBorder: { mesh: THREE.Mesh, tEnd: number } | null = null;
  
  const sparks: { mesh: THREE.Mesh, vel: THREE.Vector3, tEnd: number }[] = [];

  // Helper to create a flat ring on the floor
  function createRing(innerR: number, outerR: number, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.RingGeometry(innerR, outerR, 32);
    geo.rotateX(-Math.PI / 2); // face up
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.05; // slightly above floor
    return mesh;
  }

  // Desaturation
  function setDesaturation(val: number) {
    canvas.style.filter = `saturate(${1 - val * 0.8})`; // 0 to 0.8 desat
  }

  ctx.bus.on('parry:window', ({ tImpact, perfectMs }) => {
    // This gives the accurate perfectMs to size the golden band.
    // However, the incoming approach ring animation was already started by projectile:incoming.
    // We just update the golden band's thickness based on perfectMs.
    if (staticBand && activeRing) {
      const now = performance.now();
      const etaMs = tImpact - now;
      const speed = (activeRing.startR - activeRing.endR) / etaMs;
      const thickness = speed * perfectMs;
      
      const newGeo = new THREE.RingGeometry(activeRing.endR, activeRing.endR + thickness, 32);
      newGeo.rotateX(-Math.PI / 2);
      staticBand.geometry.dispose();
      staticBand.geometry = newGeo;
    }
  });

  ctx.bus.on('projectile:incoming', ({ target, etaMs }) => {
    if (activeRing) {
      scene.remove(activeRing.mesh);
      if (staticBand) scene.remove(staticBand);
    }
    
    const targetPos = ctx.state.players[target].pos;
    const endR = 1.0;
    const startR = 3.0 * endR;
    
    // Create approach ring
    const mesh = createRing(startR - 0.1, startR, approachMat);
    mesh.position.set(targetPos[0], 0.05, targetPos[2]);
    scene.add(mesh);
    
    const now = performance.now();
    activeRing = { mesh, tStart: now, tEnd: now + etaMs, startR, endR };
    
    // Create static golden band (placeholder thickness until parry:window refines it)
    staticBand = createRing(endR, endR + 0.3, perfectMat);
    staticBand.position.set(targetPos[0], 0.04, targetPos[2]);
    scene.add(staticBand);

    // Zoom & Desaturate
    zoomTween = { tStart: now, tEnd: now + etaMs, startZoom: camera.zoom, endZoom: 1.3, isReturning: false };
    setDesaturation(1);
  });

  ctx.bus.on('fire', ({ player }) => {
    // Reflet au lâcher et liseré rouge de 100ms sur l'attaquant
    const attackerPos = ctx.state.players[player].pos;
    
    // Red alert border
    const border = createRing(1.2, 1.4, redAlertMat);
    border.position.set(attackerPos[0], 0.1, attackerPos[2]);
    scene.add(border);
    activeRedBorder = { mesh: border, tEnd: performance.now() + 100 };
    
    // Simple ✦ star flash (two crossed planes)
    const starGeo = new THREE.PlaneGeometry(2, 0.2);
    const starGeo2 = new THREE.PlaneGeometry(0.2, 2);
    const starMat = new THREE.MeshBasicMaterial({ color: palette.lumiere, transparent: true, opacity: 1, side: THREE.DoubleSide });
    const star1 = new THREE.Mesh(starGeo, starMat);
    const star2 = new THREE.Mesh(starGeo2, starMat);
    star1.position.set(attackerPos[0], 1.5, attackerPos[2]);
    star2.position.set(attackerPos[0], 1.5, attackerPos[2]);
    
    // Face camera
    const v = new THREE.Vector3().subVectors(camera.position, star1.position);
    const angle = Math.atan2(v.x, v.z);
    star1.rotation.y = angle;
    star2.rotation.y = angle;
    star1.rotation.z = Math.PI / 4;
    star2.rotation.z = Math.PI / 4;
    
    scene.add(star1);
    scene.add(star2);
    
    // Animate star scale out over 200ms
    const startT = performance.now();
    const updateStar = () => {
      const p = (performance.now() - startT) / 200;
      if (p >= 1) {
        scene.remove(star1, star2);
        starGeo.dispose();
        starGeo2.dispose();
        starMat.dispose();
      } else {
        const s = 1 - p;
        star1.scale.setScalar(s);
        star2.scale.setScalar(s);
        star1.position.y += 0.05; // float up
        star2.position.y += 0.05;
        requestAnimationFrame(updateStar);
      }
    };
    requestAnimationFrame(updateStar);
  });

  ctx.bus.on('parry:result', ({ grade, player }) => {
    // Cleanup approach visuals immediately
    if (activeRing) {
      scene.remove(activeRing.mesh);
      activeRing.mesh.geometry.dispose();
      activeRing = null;
    }
    if (staticBand) {
      scene.remove(staticBand);
      staticBand.geometry.dispose();
      staticBand = null;
    }
    
    // Reset Zoom & Desaturation smoothly
    const now = performance.now();
    zoomTween = { tStart: now, tEnd: now + 300, startZoom: camera.zoom, endZoom: 1.0, isReturning: true };
    setDesaturation(0);
    
    if (grade === 'perfect') {
      const pos = ctx.state.players[player].pos;
      const geo = new THREE.PlaneGeometry(0.3, 0.3);
      for (let i = 0; i < 15; i++) {
        const spark = new THREE.Mesh(geo, sparkMat);
        spark.position.set(pos[0], 1.0, pos[2]);
        // Random velocity
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const speed = 4 + Math.random() * 4;
        const vel = new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta)
        ).multiplyScalar(speed);
        
        scene.add(spark);
        sparks.push({ mesh: spark, vel, tEnd: now + 400 + Math.random() * 200 });
      }
    }
  });

  ctx.loop.addSystem('parry-fx', (dt) => {
    const now = performance.now();
    
    // Approach Ring
    if (activeRing) {
      if (now >= activeRing.tEnd) {
        scene.remove(activeRing.mesh);
        activeRing.mesh.geometry.dispose();
        activeRing = null;
      } else {
        const p = (now - activeRing.tStart) / (activeRing.tEnd - activeRing.tStart);
        const currentR = activeRing.startR + (activeRing.endR - activeRing.startR) * p;
        
        const geo = new THREE.RingGeometry(currentR - 0.1, currentR, 32);
        geo.rotateX(-Math.PI / 2);
        activeRing.mesh.geometry.dispose();
        activeRing.mesh.geometry = geo;
      }
    }
    
    // Red Alert Border
    if (activeRedBorder) {
      if (now >= activeRedBorder.tEnd) {
        scene.remove(activeRedBorder.mesh);
        activeRedBorder.mesh.geometry.dispose();
        activeRedBorder = null;
      }
    }
    
    // Zoom Animation
    if (zoomTween) {
      if (now >= zoomTween.tEnd) {
        camera.zoom = zoomTween.endZoom;
        camera.updateProjectionMatrix();
        zoomTween = null;
      } else {
        // ease out cubic
        const p = (now - zoomTween.tStart) / (zoomTween.tEnd - zoomTween.tStart);
        const ease = 1 - Math.pow(1 - p, 3);
        camera.zoom = zoomTween.startZoom + (zoomTween.endZoom - zoomTween.startZoom) * ease;
        camera.updateProjectionMatrix();
      }
    }
    
    // Sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      if (now >= s.tEnd) {
        scene.remove(s.mesh);
        sparks.splice(i, 1);
      } else {
        s.mesh.position.addScaledVector(s.vel, dt);
        s.vel.y -= 9.8 * dt; // gravity
        // billboard
        s.mesh.lookAt(camera.position);
        s.mesh.scale.setScalar((s.tEnd - now) / 600); // shrink
      }
    }
  });
}
