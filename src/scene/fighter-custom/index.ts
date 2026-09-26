import * as THREE from 'three';
import type { FighterLook } from '../../core/types';
import { makeSticker } from '../sticker/index';

// --- Repris de kaykit.js (recoloration fine par bande de teinte) ---
const shimmerTime = { value: 0 };

function onBeforeCompileToon(shader: any, mat: THREE.Material) {
  const u = mat.userData.u;
  Object.assign(shader.uniforms, u, { uTime: shimmerTime });
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform vec3 uRecFrom; uniform vec3 uRecTo; uniform vec3 uRec2From; uniform vec3 uTintK; uniform vec3 uTint; uniform vec3 uShimmer; uniform float uTime;
      vec3 kk_rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
        vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10;
        return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
      vec3 kk_hsv2rgb(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
      float kk_band(float h, vec3 b){ float d=abs(fract(h-b.x+0.5)-0.5); return 1.0-smoothstep(b.y*0.7,b.y,d); }`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 hsv = kk_rgb2hsv(diffuseColor.rgb);
        float sat = smoothstep(0.12, 0.3, hsv.y);
        float w = max(kk_band(hsv.x, uRecFrom) * step(0.001, uRecFrom.y), kk_band(hsv.x, uRec2From) * step(0.001, uRec2From.y)) * sat;
        vec3 dst = kk_hsv2rgb(vec3(uRecTo.x, clamp(hsv.y * uRecTo.y, 0., 1.), clamp(hsv.z * uRecTo.z, 0., 1.)));
        diffuseColor.rgb = mix(diffuseColor.rgb, dst, w);
        diffuseColor.rgb = mix(diffuseColor.rgb, uTint * (0.25 + 0.95 * max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b)), uTintK.x);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299,0.587,0.114))), uTintK.y);
      }`);
}

const _c = new THREE.Color();
function applyLookToMaterial(mat: THREE.Material, look: any) {
  if (!mat.userData.u) {
    mat.userData.u = {
      uRecFrom: { value: new THREE.Vector3(0, 0, 0) }, uRec2From: { value: new THREE.Vector3(0, 0, 0) },
      uRecTo: { value: new THREE.Vector3(0, 1, 1) }, uTint: { value: new THREE.Color(1, 1, 1) }, uTintK: { value: new THREE.Vector3(0, 0, 0) },
      uShimmer: { value: new THREE.Color(0, 0, 0) },
    };
    mat.onBeforeCompile = (shader) => onBeforeCompileToon(shader, mat);
    mat.needsUpdate = true;
  }
  
  const u = mat.userData.u;
  const rc = look.recolor;
  if (rc) {
    _c.set(rc.to); const hsl = { h: 0, s: 0, l: 0 }; _c.getHSL(hsl);
    u.uRecFrom.value.set(rc.from[0], rc.from[1], 0);
    u.uRec2From.value.set(rc.from2?.[0] || 0, rc.from2?.[1] || 0, 0);
    u.uRecTo.value.set(hsl.h, rc.sat ?? 1, rc.val ?? 1);
  } else { 
    u.uRecFrom.value.set(0, 0, 0); 
    u.uRec2From.value.set(0, 0, 0); 
  }
  
  if (look.tint) { 
    u.uTint.value.set(look.tint); 
    u.uTintK.value.x = look.tintK ?? 0.5; 
  } else {
    u.uTintK.value.x = 0;
  }
  u.uTintK.value.y = look.desat || 0;
}
// -----------------------------------------------------------

function findHeadBone(root: THREE.Object3D): THREE.Object3D | null {
  let head: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (obj.name.toLowerCase() === 'head') head = obj;
  });
  return head;
}

/** Applique la tenue, les accessoires et le visage sticker d'un perso photo sur un corps KayKit chargé. */
export async function applyFighterLook(root: THREE.Object3D, look: FighterLook): Promise<void> {
  // 1. Recoloration avec applyLook
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material as THREE.Material;
    if (Array.isArray(mat)) return;
    
    const isTorso = /_Body$/.test(mesh.name);
    const isHead = /_Head$/.test(mesh.name);
    
    let tint = undefined;
    let tintK = 0;
    
    // Simplification : on teinte globalement la pièce d'armure/vêtement
    if (isTorso) {
      tint = look.primary;
      tintK = 0.8;
    } else if (isHead && look.hair) {
      tint = look.hair;
      tintK = 0.8;
    } else {
      tint = look.secondary;
      tintK = 0.6;
    }

    applyLookToMaterial(mat, { tint, tintK });
  });

  // 2. Visage sticker collé comme un masque (via LS)
  const headBone = findHeadBone(root);
  if (headBone && look.faceUrl) {
    try {
      const faceSticker = await makeSticker(look.faceUrl, { height: 0.45, depth: 0.02 });
      
      // Positionner le masque devant le visage
      faceSticker.position.set(0, 0.1, 0.25);
      
      // On fixe l'accessoire à l'os de la tête
      headBone.add(faceSticker);
    } catch (err) {
      console.error('[fighter-custom] makeSticker error:', err);
    }
  }
}
