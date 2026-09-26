# Design system « Cartoon Taverne » : arène de duel de sorts (Three.js / WebGL)

> Cible : Three.js **r180+** (vanilla, `WebGLRenderer`, Vite), **60 fps sur GPU intégré de laptop** (Intel Iris Xe / UHD, Radeon Vega iGPU).
> Kit de code associé : [`toon-kit.js`](./toon-kit.js) (palette, rampe toon, contour inverted hull, particules poolées).
> Vérifié le 2026-09-25 contre les sources listées à la fin. Le kit a été rendu dans Chromium headless (WebGL/ANGLE) avec three 0.180 : **11 draw calls, 2 312 triangles, 0 erreur shader** pour une scène de test (sol, 2 duellistes, caisse, 6 tonneaux instanciés avec contour, 2 systèmes de particules).

---

## 1. Principes visuels

| Principe | Règle concrète | Pourquoi |
|---|---|---|
| **Ombrage en paliers** | 3 paliers (ombre / médian / lumière) via `MeshToonMaterial` + `gradientMap` N×1 en `NearestFilter`. 2 paliers pour les décors lointains, jamais plus de 4. | Des aplats nets se lisent de loin et coûtent le même prix qu'un Lambert. |
| **Palier sombre ≠ noir** | Le palier le plus bas de la rampe vaut **~35 %** (valeur 89/255), pas 0. | Le noir est réservé à l'encre des contours : la face à l'ombre garde sa teinte. |
| **Contours** | Contour « inverted hull » brun encre `#2B1D14` sur **personnages, projectiles lourds, props interactifs** uniquement. Décor de fond sans contour. | Hiérarchie de lecture : ce qui a un trait noir est jouable ou dangereux. |
| **Silhouette d'abord** | Chaque sorcier doit être reconnaissable **en noir plein à 64 px de haut** : chapeau/capuche surdimensionné, bâton asymétrique, cape en triangle. Test : `scene.overrideMaterial = new MeshBasicMaterial({color: 0x000000})`. | En duel, on lit la pose de l'adversaire (incantation, parade) à la silhouette. |
| **Formes exagérées** | Têtes à ~1/3 de la hauteur, mains et pieds 1,5×, props épais (planches de 20 cm), arêtes biseautées (bevel 1 segment) plutôt que des cubes nets. | Formes rondes = amical ; pointes = danger (réservées aux sorts offensifs). |
| **Squash & stretch** | Conserver le volume : `s.y = k`, `s.x = s.z = 1/√k`. Anticipation 80–120 ms (écrasement k≈0,8), release (étirement k≈1,25), retour ressort 150 ms. | Donne du poids sans animations squelettiques coûteuses. |
| **Couleurs lisibles** | Monde = terres chaudes désaturées (bois, pierre, parchemin). Sorts = couleurs saturées et claires. Le joueur et l'adversaire ont chacun une couleur d'équipe unique (tomate vs sarcelle). | Contraste de saturation : l'œil va aux sorts, pas au décor. |
| **Valeur > teinte** | Vérifier la scène en niveaux de gris : sol et murs en valeurs moyennes/sombres, personnages et sorts en valeurs extrêmes. | Accessibilité daltoniens + lisibilité en mouvement. |

### Squash & stretch (code)

```js
// k = 1 : neutre ; k < 1 : écrasé ; k > 1 : étiré. Volume conservé.
function squash(obj, k) {
  const side = 1 / Math.sqrt(k);
  obj.scale.set(side, k, side);
}
// ressort amorti vers 1 (appelé chaque frame)
function springScale(state, dt, stiffness = 180, damping = 12) {
  const a = -stiffness * (state.k - 1) - damping * state.v;
  state.v += a * dt; state.k += state.v * dt;
}
// À l'impact : state.k = 0.7 ; au lancer : state.k = 1.3 ; puis springScale + squash chaque frame.
```

---

## 2. Tokens

### 2.1 Palette monde : taverne chaude (10 couleurs)

| Token | Hex | Usage |
|---|---|---|
| `ink` | `#2B1D14` | Contours 3D, texte, bordures UI. Remplace le noir partout. |
| `woodDark` | `#5C3A21` | Poutres, fond de scène, couleur de brouillard, sol de l'hémisphère. |
| `wood` | `#8B5A2B` | Plancher de l'arène, tables. |
| `woodLight` | `#C68B4E` | Tonneaux, caisses, bois éclairé. |
| `stone` | `#8E8272` | Murs, cheminée, piliers. |
| `parchment` | `#F3E3C3` | Panneaux UI, ciel de la lumière hémisphérique, nappes. |
| `hearth` | `#F2A541` | Or, feu de cheminée, accent principal UI (boutons primaires). |
| `tomato` | `#D9483B` | Équipe joueur, PV, danger. |
| `moss` | `#6E8B3D` | Végétation, validation, buffs. |
| `teal` | `#2E7F7A` | Équipe adverse / mana : le contraste froid, **sans dégradé violet→bleu**. |

Règle UI : l'accent froid est la **sarcelle** `#2E7F7A`, posée à plat sur parchemin. Pas de violet, pas de bleu électrique, pas de dégradé entre les deux.

### 2.2 Couleurs d'éléments (sorts)

Chaque élément a 3 tons : **core** (cœur, le plus clair, jeune particule), **main** (teinte signature), **dark** (traîne, fin de vie, ombre portée du VFX).

| Élément | core | main | dark | Fusion | Forme signature |
|---|---|---|---|---|---|
| Feu | `#FFE066` | `#FF6A1F` | `#B3261E` | additive | gouttes qui montent (gravité négative) |
| Glace | `#F2FDFF` | `#7FD6F0` | `#2B7FA8` | additive | éclats anguleux, chute lente |
| Foudre | `#FFFFFF` | `#FFE94A` | `#E0A800` | additive | zigzags, vie très courte (80–150 ms) |
| Nature | `#E4FF9A` | `#6CC43A` | `#2F6B22` | normale | feuilles qui tournoient, gravité faible |
| Arcane | `#FFE3F2` | `#E0479E` | `#8A1F5C` | additive | anneaux et runes, magenta et non violet |
| Ombre | `#8C5AA8` | `#3A2340` | `#150C18` | **normale** | fumée qui gonfle, liseré `core` |
| Terre | `#F0C987` | `#B07A3F` | `#5E3A1A` | normale | cailloux, poussière |
| Sacré | `#FFFFFF` | `#FFF1B8` | `#E8B84A` | additive | rayons verticaux |

**Piège important** : une couleur sombre en fusion **additive** est invisible (elle ajoute presque 0). Ombre, Nature et Terre doivent utiliser `NormalBlending` (un second `ParticleBurstSystem({ blending: 'normal' })`). Pour l'ombre, garder quelques particules `core` pour qu'elle se détache du bois sombre.

### 2.3 Tokens techniques

```js
export const tokens = {
  outline: { character: 0.05, prop: 0.035, projectile: 0.03 }, // unités monde, caméra à ~10–14 m
  toonSteps: { hero: 3, prop: 3, background: 2 },
  timing: { hitstopLight: 0.05, hitstopHeavy: 0.1, anticipation: 0.1, squashReturn: 0.15 }, // s
  shake: { light: 0.25, heavy: 0.6, decayPerSec: 1.8, maxOffset: 0.35, maxRollDeg: 3 },
};
```

---

## 3. Recette de rendu

### 3.1 Renderer

```js
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({
  antialias: true,                  // MSAA natif : bien moins cher qu'un FXAA en post, et lisse les contours inverted hull
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // plafond 1.5 (retina iGPU = 4× les pixels à 2.0)
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;   // défaut, rappel
renderer.toneMapping = THREE.NoToneMapping;          // voir 3.6
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;        // PCFSoftShadowMap est déprécié depuis r186 (retombe sur PCF)
```

**Pixel ratio adaptatif** (filet de sécurité iGPU) :

```js
let pr = Math.min(devicePixelRatio, 1.5), acc = 0, n = 0;
function adaptPixelRatio(dt) {          // appeler chaque frame avec le dt réel
  acc += dt; n++;
  if (n < 60) return;
  const avg = acc / n; acc = 0; n = 0;
  if (avg > 1 / 50 && pr > 1)           pr = Math.max(1, pr - 0.25);                        // < 50 fps : on baisse
  else if (avg < 1 / 58 && pr < Math.min(devicePixelRatio, 1.5)) pr = Math.min(pr + 0.25, 1.5); // marge : on remonte
  else return;
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
  particles.resize(renderer, camera);   // la taille des points dépend du drawing buffer
}
```

### 3.2 Matériau toon et rampe 3 paliers

```js
function makeGradientMap(steps = 3, min = 0.35) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round((min + (1 - min) * i / (steps - 1)) * 255); // 3 → [89, 172, 255]
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;  // exigé par la doc MeshToonMaterial.gradientMap
  tex.magFilter = THREE.NearestFilter;  // (DataTexture est déjà en Nearest par défaut, mais on l'explicite)
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;                           // PARTAGER une seule instance pour toute la scène
}
const GRADIENT_3 = makeGradientMap(3);
const mat = new THREE.MeshToonMaterial({ color: '#C68B4E', gradientMap: GRADIENT_3 });
```

Ce qu'il faut savoir sur le shader (`lights_toon_pars_fragment` en r180) :
- Seules les **lumières directes** (directionnelle, point, spot) passent par la rampe : `getGradientIrradiance(normal, lightDir)` lit la texture en `dot(N,L)*0.5+0.5`.
- La **lumière hémisphérique/ambiante** s'ajoute en *indirect diffuse*, **lisse, sans paliers**. Si elle est trop forte, elle délave les bandes. Il faut garder la directionnelle dominante (ratio ~3:1).
- Les ombres portées multiplient la couleur de la lumière directe avant la rampe, donc elles tombent aussi en aplats nets.

### 3.3 Contours : comparatif

| Option | Principe | Coût | Rendu | Verdict iGPU |
|---|---|---|---|---|
| **A. Inverted hull manuel** (`addOutline` du kit, même idée que `<Outlines>` de drei) | Enfant partageant la géométrie, `MeshBasicMaterial` `BackSide`, sommets poussés le long d'une normale lissée dans le vertex shader | **+1 draw call et +N triangles par mesh contouré**, 0 passe plein écran, 0 render target. Pixel shader trivial. | Silhouette uniquement (pas de traits internes). Épaisseur en unités monde. Marche avec skinning et instancing. | **Recommandé.** Coût prévisible et proportionnel à ce qui est contouré. |
| **B. `OutlineEffect`** (addon officiel, `examples/jsm/effects/OutlineEffect.js`) | Même inverted hull, mais re-rend **toute la scène une 2e fois** en échangeant les matériaux (`renderOutline()`) | **~2× draw calls et 2× triangles de toute la scène**, y compris le décor. Paramètres par matériau via `material.userData.outlineParameters` (`thickness` 0.003 par défaut, `color`, `alpha`, `visible`). | Épaisseur calculée en espace écran (constante à l'écran). | OK pour un prototype. Il faut mettre `visible:false` sur tout le décor, sinon on double la scène. |
| **C. Post-process edge detection** (Sobel sur profondeur + normales : `OutlinePass`, pmndrs `postprocessing`, tuto d'Omar Shehata) | Passe normale/profondeur supplémentaire puis filtre plein écran | Coût **en pixels** : 1 re-rendu de scène (normales) + passes plein écran. `OutlinePass` fait en plus : depth des non-sélectionnés, masque, downsample ½, détection d'arêtes, **2 flous séparables** (½ et ¼ res). Désactive le MSAA natif du canvas (render targets). | Traits internes et silhouettes, épaisseur écran constante, aucun travail sur les assets. | À éviter sur iGPU à 60 fps en 1080p+. `OutlinePass` sert surtout aux halos de sélection. |

**Défaut de l'inverted hull** (Ben Golus, *The Quest for Very Wide Outlines*) : sur les arêtes dures (normales splittées, flat shading), la coque se déchire et laisse des trous. Le kit corrige ça avec `computeOutlineNormals()`, qui crée un attribut `outlineNormal` en moyennant les normales des sommets à la même position. Les normales d'éclairage ne sont pas touchées. Un seul passage CPU, au chargement.

Code essentiel (voir `toon-kit.js` pour SkinnedMesh / InstancedMesh) :

```js
const outlineMat = new THREE.MeshBasicMaterial({ color: '#2B1D14', side: THREE.BackSide });
outlineMat.userData.thickness = { value: 0.05 };
outlineMat.onBeforeCompile = function (shader) {
  shader.uniforms.uOutlineThickness = this.userData.thickness;
  shader.vertexShader = 'attribute vec3 outlineNormal;\nuniform float uOutlineThickness;\n' +
    shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed += outlineNormal * uOutlineThickness;');
};
const outline = new THREE.Mesh(mesh.geometry, outlineMat); // géométrie PARTAGÉE
outline.castShadow = false; outline.raycast = () => {};
mesh.add(outline);
```

Réglages : 0,05 m pour un perso de 1,8 m vu à 10–14 m ≈ 2–3 px en 1080p. Sous ~1,5 px, le trait scintille, donc le supprimer (LOD) sur les objets lointains. `MeshBasicMaterial` gère le brouillard, donc les contours s'estompent avec la scène.

### 3.4 Éclairage

```js
// 1) Hémisphère : remplissage chaud, lisse (ne passe PAS par la rampe)
const hemi = new THREE.HemisphereLight('#F3E3C3' /* parchment */, '#5C3A21' /* woodDark */, 0.6);
// 2) Une seule directionnelle : la "lumière de cheminée/lustre", porte les paliers et l'ombre
const sun = new THREE.DirectionalLight('#FFE2B0', 2.2);
sun.position.set(5, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);          // 1024 suffit si le frustum colle à l'arène ; 2048 = plafond desktop
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 25 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;                // évite l'acné sur les aplats toon
scene.add(hemi, sun, sun.target);
```

| Objet | `castShadow` | `receiveShadow` |
|---|---|---|
| Duellistes (corps seulement, pas les contours) | oui | non (les paliers suffisent) |
| Gros props (tonneaux, piliers) | oui, ou ombre bakée dans une texture de sol | non |
| Sol de l'arène | non | **oui** (seul receveur) |
| Projectiles, particules, anneaux, contours | **non** | non |
| Décor hors arène | non | non |

- **Torches / foyer** : ne pas ajouter de `PointLight` par torche. Chaque lumière ajoute du calcul à *tous* les fragments toon, et une ombre de point light = 6 rendus. Mieux vaut un mesh `hearth` en `MeshBasicMaterial` avec un sprite additif qui pulse. Maximum une `PointLight` sans ombre pour le flash d'un sort (intensité animée, créée une fois au démarrage et jamais ajoutée/retirée, sinon le shader se recompile).
- **Ombres des projectiles** : un blob (disque `ink` à 35 % d'opacité, `depthWrite:false`) sous l'objet, c'est plus cartoon et quasi gratuit.
- Si les décors sont statiques et les persos ont des blobs, on peut aller jusqu'à `renderer.shadowMap.autoUpdate = false` + `needsUpdate = true` à la demande.

### 3.5 Brouillard

```js
scene.background = new THREE.Color('#5C3A21');
scene.fog = new THREE.Fog('#5C3A21', 18, 40);   // linéaire : même couleur que le fond, commence après l'arène
```
Le `Fog` linéaire coûte quelques instructions par fragment. Il fond le décor lointain dans le fond et permet de réduire `camera.far` (60) ainsi que le contenu du décor.

### 3.6 Tone mapping

**Choix : `NoToneMapping`** (le défaut du renderer).
- Les tokens hex doivent sortir **tels quels** à l'écran. ACES Filmic et AgX désaturent et décalent les teintes (les oranges tirent vers le jaune, les verts saturés s'éteignent), ce qui casse une palette dessinée à la main.
- Une surexposition des sorts additifs vers le blanc est ici *souhaitée* : c'est le « flash » cartoon.
- Alternative : `THREE.NeutralToneMapping` (Khronos PBR Neutral) si les empilements additifs cramment trop. Il préserve teinte et saturation des tons moyens et ne compresse que les hautes lumières. Le coût est nul dans les deux cas (appliqué dans le shader de chaque matériau, sans passe supplémentaire).
- Les `ShaderMaterial` custom doivent inclure `#include <tonemapping_fragment>` et `#include <colorspace_fragment>` en fin de fragment, sinon leurs couleurs ne correspondent pas au reste (le kit le fait).

---

## 4. Recette VFX économique

### 4.1 Budgets (frame complète, 1080p, pixelRatio ≤ 1,5)

| Poste | Budget | Note |
|---|---|---|
| Draw calls | **≤ 120 cible, 150 max** (`renderer.info.render.calls`) | Un mesh contouré compte double. |
| Triangles | **≤ 250 k** (≤ 150 k hors contours) | Les contours doublent les tris des objets contourés. |
| Particules vivantes | **≤ 2 000** au total, en **2–3 `Points`** (1 par mode de fusion) | 1 draw call par système, quel que soit le nombre de particules. |
| Taille de point | ≤ 64 px (`uMaxSize`) | Limite fragment (overdraw additif) et `gl_PointSize` max des iGPU. |
| Overdraw additif | < ~4 couches sur 20 % de l'écran | Le vrai goulot des iGPU est le fill-rate, pas le nombre de particules. |
| Shadow map | 1 × 1024² | Plus de 2048 est inutile en vue d'arène. |
| Lumières | 1 hémisphère + 1 directionnelle (+ 1 point sans ombre, permanente) | |
| Textures | ≤ 1024² pour les persos, ≤ 512² pour les props, atlas palette 256×256 | Puissances de 2, KTX2/Basis si possible. |
| Programmes shader | < 20 (`renderer.info.programs.length`) | Précompiler avec `renderer.compile(scene, camera)` au chargement. |

Répartition type : décor fusionné (6–10) + 2 duellistes (≈ 3 sous-mesh + 3 contours = 12) + props instanciés (≈ 10) + projectiles instanciés (2–4) + anneaux (≤ 8) + particules (3) + UI 3D (≤ 5) + ombre (autant de calls que de casters) = **~60–80 calls**, ce qui laisse de la marge.

### 4.2 Particules : `ParticleBurstSystem` (kit)

- Un `THREE.Points` + `ShaderMaterial`, buffers `Float32Array` alloués **une fois** (`maxParticles`).
- Les vivantes sont compactées dans `[0, alive)` par swap-remove. `setDrawRange(0, alive)` + `addUpdateRange(0, alive*itemSize)` : on ne dessine et n'uploade que ce qui vit. `visible = false` quand le système est vide (0 draw call).
- Taille en unités monde, convertie en pixels par `uScale = hauteurDrawingBuffer / (2·tan(fov/2))`. Appeler `resize()` à chaque resize ou changement de pixel ratio.
- Disque à bord net plus cœur blanc tant que la particule est jeune : c'est cartoon et ça ne demande aucune texture.

```js
import { ParticleBurstSystem, palette } from './toon-kit.js';
const fxAdd = new ParticleBurstSystem({ maxParticles: 1500 });                     // feu, glace, foudre, arcane, sacré
const fxNorm = new ParticleBurstSystem({ maxParticles: 500, blending: 'normal' }); // ombre, nature, terre
fxAdd.resize(renderer, camera); fxNorm.resize(renderer, camera);
scene.add(fxAdd.points, fxNorm.points);

const F = palette.element.fire;
fxAdd.burst(hitPoint, { count: 40, color: [F.core, F.main, F.main, F.dark], speed: [3, 7],
  life: [0.25, 0.6], size: [0.15, 0.4], gravity: -3 /* monte */, drag: 4 });
const I = palette.element.ice;
fxAdd.burst(hitPoint, { count: 24, color: [I.core, I.main], direction: normal, spread: 0.5, gravity: 9 });
// boucle : fxAdd.update(gameDt); fxNorm.update(gameDt);
```

Nombre de particules par événement : impact léger 16–24, impact lourd 40–60, traîne de projectile 2–4 par frame (sinon le coût monte avec le nombre de projectiles), mort/KO 120 une seule fois.

### 4.3 Sprites additifs (flashs, étoiles d'impact)

`THREE.Sprite` = **1 draw call par sprite**. À réserver aux 2–4 flashs simultanés maximum, à puiser dans un pool, avec texture 64×64 dessinée à plat (étoile 4 branches, pas de flou gaussien).

```js
const flashTex = new THREE.TextureLoader().load('/fx/star4.png'); // 64×64, bords nets
const flashMat = new THREE.SpriteMaterial({ map: flashTex, color: '#FFE066', blending: THREE.AdditiveBlending,
  depthWrite: false, transparent: true });
const flashes = Array.from({ length: 4 }, () => { const s = new THREE.Sprite(flashMat.clone()); s.visible = false; scene.add(s); return s; });
// spawn : s.position.copy(p); s.scale.setScalar(0.2); s.userData.t = 0; s.visible = true;
// update : t += dt/0.12 ; scale = 0.2 + 1.6*easeOutBack(t) ; material.opacity = 1 - t ; visible = t < 1
```
Au-delà de 4 flashs, passer à un `InstancedMesh` de quads orientés caméra (1 draw call pour tous).

### 4.4 Anneau d'onde de choc

```js
const ringGeo = new THREE.RingGeometry(0.85, 1, 48, 1).rotateX(-Math.PI / 2); // à plat au sol
const rings = Array.from({ length: 6 }, () => {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: '#FFE066', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.visible = false; m.renderOrder = 5; scene.add(m); return m;
});
function shockwave(pos, color, radius = 3, dur = 0.35) {
  const r = rings.find(r => !r.visible) ?? rings[0];   // pool, recycle le plus ancien
  r.position.copy(pos).setY(0.02); r.material.color.set(color);
  r.userData = { t: 0, dur, radius }; r.visible = true;
}
function updateRings(dt) {
  for (const r of rings) if (r.visible) {
    const u = (r.userData.t += dt) / r.userData.dur;
    if (u >= 1) { r.visible = false; continue; }
    const e = 1 - Math.pow(1 - u, 3);                  // easeOutCubic : départ rapide
    r.scale.setScalar(0.2 + e * r.userData.radius);
    r.material.opacity = 1 - u * u;
  }
}
```
Variante « épaisse » cartoon : 2 anneaux décalés de 60 ms (`main`, puis `core` plus fin).

### 4.5 Hitstop

Geler le temps du *gameplay* 50–100 ms à l'impact. Le rendu, l'UI et la caméra continuent de tourner.

```js
let hitstop = 0;
export const hit = (heavy) => { hitstop = Math.max(hitstop, heavy ? 0.1 : 0.05); };
function frame(realDt) {
  const gameDt = hitstop > 0 ? 0 : realDt;
  hitstop = Math.max(0, hitstop - realDt);
  world.update(gameDt); fxAdd.update(gameDt); fxNorm.update(gameDt); updateRings(gameDt);
  camShake.update(realDt);                            // la secousse, elle, vit en temps réel
  renderer.render(scene, camera);
}
```
Pendant le gel, appliquer un squash (k = 0,8) sur la victime et un flash blanc du matériau : `material.emissive.set('#FFFFFF')` pendant 1 à 2 frames. `MeshToonMaterial` supporte `emissive`, ce qui évite toute recompilation.

### 4.6 Secousse caméra (modèle « trauma »)

```js
const camShake = {
  trauma: 0, t: 0, base: new THREE.Vector3(),
  add(a) { this.trauma = Math.min(1, this.trauma + a); },
  update(dt) {
    this.t += dt; this.trauma = Math.max(0, this.trauma - 1.8 * dt);
    const s = this.trauma * this.trauma;              // quadratique : les petits chocs restent doux
    const n = (f, o) => Math.sin(this.t * f + o) * Math.sin(this.t * f * 0.37 + o * 2.1); // bruit pseudo-continu
    camera.position.set(this.base.x + 0.35 * s * n(47, 1), this.base.y + 0.35 * s * n(53, 7), this.base.z);
    camera.rotation.z = THREE.MathUtils.degToRad(3) * s * n(41, 3);
  },
};
// impact léger : camShake.add(0.25) ; lourd : camShake.add(0.6). Prévoir une option "réduire les secousses".
```

---

## 5. UI / HUD cartoon, sans « AI-slop »

### Interdits
- Glow, `box-shadow` flou coloré, néon, glassmorphism (`backdrop-filter: blur`).
- Dégradés violet→bleu ou « aurora » ; en fait **aucun dégradé décoratif**.
- Emojis en guise d'icônes, coins 24 px partout, texte gris clair sur fond sombre.

### Règles
- **Aplats + trait** : fonds `parchment`, bordure `3px solid var(--ink)`, **ombre dure décalée sans flou** (`0 4px 0 var(--ink)`), rayon 10–12 px. C'est le même langage que les contours 3D.
- **Barres de PV/mana segmentées** (1 segment = 10 PV), remplissage plat, et une « barre fantôme » `hearth` qui rattrape la vraie valeur avec 300 ms de retard.
- **Nombres de dégâts** : chiffres en police display, contour via `paint-order: stroke`, apparition par squash (scale 1,4 → 1 en 120 ms) puis montée. Couleur = élément `main`, contour `ink`.
- **Icônes de sorts** : pastilles rondes de couleur élément + pictogramme `ink` en 2 tons. Le cooldown est un secteur plein `ink` à 55 % (conic-gradient autorisé ici : c'est un indicateur, pas une décoration).
- Contraste texte ≥ 4.5:1 (`ink` sur `parchment` ≈ 13:1).

### Paires de polices (Google Fonts, vérifiées disponibles)

| Paire | Titres / chiffres | Texte / labels | Caractère | Fallbacks |
|---|---|---|---|---|
| **A (recommandée)** | **Lilita One** 400 | **Nunito** 600/800 | Chunky, rond, très lisible en petit | `"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif` |
| **B (plus BD)** | **Luckiest Guy** 400 (titres, dégâts, « K.O. ! ») | **Baloo 2** 500/700 | Style comics, énergique | `Impact, "Arial Black", sans-serif` / `"Segoe UI", system-ui, sans-serif` |

Luckiest Guy n'a que des capitales et fatigue vite à la lecture : à réserver aux mots courts.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@600;800&display=swap" rel="stylesheet">
```

```css
:root {
  --ink:#2B1D14; --wood-dark:#5C3A21; --wood:#8B5A2B; --wood-light:#C68B4E; --stone:#8E8272;
  --parchment:#F3E3C3; --hearth:#F2A541; --tomato:#D9483B; --moss:#6E8B3D; --teal:#2E7F7A;
  --font-display:"Lilita One","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif;
  --font-body:"Nunito","Segoe UI",system-ui,sans-serif;
  --stroke:3px; --radius:12px; --drop:0 4px 0 var(--ink);
}
.panel { background:var(--parchment); color:var(--ink); border:var(--stroke) solid var(--ink);
  border-radius:var(--radius); box-shadow:var(--drop); font:600 16px/1.3 var(--font-body); }
.btn { font:400 22px var(--font-display); letter-spacing:.02em; background:var(--hearth); color:var(--ink);
  border:var(--stroke) solid var(--ink); border-radius:var(--radius); box-shadow:var(--drop); padding:.4em 1em; }
.btn:active { transform:translateY(3px); box-shadow:0 1px 0 var(--ink); }   /* "s'enfonce", pas de glow */
.btn--alt { background:var(--teal); color:var(--parchment); }
.hp { height:18px; border:var(--stroke) solid var(--ink); border-radius:6px; background:var(--wood-dark); overflow:hidden; }
.hp > i { display:block; height:100%; background:var(--tomato);
  background-image:repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), var(--ink) calc(10% - 2px) 10%); }
.dmg { font:400 34px var(--font-display); color:var(--tomato); -webkit-text-stroke:6px var(--ink);
  paint-order:stroke fill; }
```
(Le `repeating-linear-gradient` de `.hp` trace des séparateurs nets à la façon d'une règle graduée. Ce n'est pas un dégradé.)

Le HUD est en **DOM/CSS par-dessus le canvas** : 0 draw call WebGL et texte net. Pour les éléments qui changent chaque frame, animer `transform` et `opacity` uniquement, sans toucher `width`/`top`, sinon le navigateur refait le layout.

---

## 6. Checklist performance

**Draw calls et géométrie**
- [ ] Afficher `renderer.info.render.calls / triangles / points` dans un overlay debug (touche F3). Bloquer toute PR qui dépasse 150 calls.
- [ ] **`InstancedMesh`** pour tout ce qui se répète avec la même géométrie (tonneaux, chopes, bancs, bougies, projectiles d'un même sort). Le contour du kit partage `instanceMatrix`.
- [ ] **`BatchedMesh`** pour de nombreux objets *différents* partageant un matériau (props variés).
- [ ] **Fusion statique** du décor : `BufferGeometryUtils.mergeGeometries()` par matériau, une fois au chargement. Le décor fusionné n'a pas de contour.
- [ ] **Atlas palette** (technique de Bruno Simon) : une texture 256×256 de cases de couleur + UV pointant dans la bonne case. Tout le décor devient 1 matériau, donc 1 draw call après fusion. Avec `MeshToonMaterial({ map: paletteTex, gradientMap })`, `map.colorSpace = SRGBColorSpace` et `NearestFilter`.
- [ ] Supprimer les faces cachées (dessous des tables, arrière des murs) dans Blender. Personnage ≤ 8 k tris, prop ≤ 1 k.
- [ ] `frustumCulled` laissé à `true` sauf pour les `Points` dynamiques. `camera.far` serré (brouillard).

**Shaders et matériaux**
- [ ] Réutiliser **une** gradient map, **un** matériau par couleur (cache), les matériaux de contour partagés (le kit met tout en cache).
- [ ] `renderer.compile(scene, camera)` pendant l'écran de chargement, pour éviter les saccades à la première apparition d'un sort.
- [ ] Ne jamais ajouter ou retirer de lumière en cours de partie (recompilation de tous les matériaux) : jouer sur `intensity`.
- [ ] Ne pas changer `transparent`, `fog`, `vertexColors` ou `side` à chaud : ça recompile le shader. Pour masquer, utiliser `visible`, et `opacity` pour faire un fondu.

**Textures**
- [ ] Puissances de 2, ≤ 1024² (persos), ≤ 512² (props), 64² (VFX). KTX2/Basis (ETC1S pour la couleur) via `KTX2Loader`.
- [ ] Aplats cartoon = textures minuscules, voire aucune (couleur du matériau + atlas palette).
- [ ] `NearestFilter` sur atlas palette et rampes. `anisotropy` seulement sur le sol (4 max).

**Mémoire et cycle de vie**
- [ ] Pools pour projectiles, anneaux, sprites, nombres de dégâts, particules : **aucune allocation dans la boucle** (`new Vector3` hors boucle, réutiliser des temporaires).
- [ ] À la sortie d'une arène : `geometry.dispose()`, `material.dispose()`, **`texture.dispose()` séparément** (disposer d'un matériau ne libère pas ses textures), `renderTarget.dispose()`, `disposeToonKit()`, `particles.dispose()`.
- [ ] Surveiller `renderer.info.memory.geometries/textures` entre deux rounds : ces valeurs doivent revenir au même niveau.
- [ ] Avec Vite HMR : `import.meta.hot?.dispose(() => { disposeToonKit(); renderer.dispose(); })`.

**Frame**
- [ ] `pixelRatio ≤ 1.5` + ajustement adaptatif (section 3.1). MSAA natif (`antialias:true`) plutôt que FXAA/SMAA en post.
- [ ] Aucun `EffectComposer` par défaut. Si un post-process devient indispensable, utiliser pmndrs `postprocessing` (fusionne les effets en une passe) et couper le MSAA du canvas.
- [ ] Ombres : 1 directionnelle 1024², frustum ajusté à l'arène, casters limités (tableau 3.4).
- [ ] `dt` borné (`Math.min(dt, 1/30)`) pour que la physique et les particules ne sautent pas après un onglet en arrière-plan.
- [ ] Tester sur le vrai iGPU, sur secteur **et sur batterie** (le navigateur peut choisir le GPU basse consommation), en 1080p plein écran.

---

## Sources vérifiées (fetch le 2026-09-25)

- three.js docs `MeshToonMaterial.gradientMap` : exigence `NearestFilter` min/mag, `NoColorSpace`. https://threejs.org/docs/pages/MeshToonMaterial.html
- three.js source r180 : `gradientmap_pars_fragment`, `lights_toon_pars_fragment` (rampe sur lumière directe seulement), `DataTexture` (Nearest par défaut), `constants.js` (`PCFSoftShadowMap` déprécié r186, `NeutralToneMapping`, `AgXToneMapping`). https://github.com/mrdoob/three.js/tree/dev/src
- Exemple officiel `webgl_materials_toon.html` : `DataTexture(colors, n, 1, RedFormat)` + `OutlineEffect`. https://github.com/mrdoob/three.js/blob/dev/examples/webgl_materials_toon.html
- `OutlineEffect.js` : double rendu de la scène, `userData.outlineParameters`, épaisseur par défaut 0.003. https://github.com/mrdoob/three.js/blob/dev/examples/jsm/effects/OutlineEffect.js
- `OutlinePass.js` : masque, downsample, détection d'arêtes, 2 flous. https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/OutlinePass.js
- pmndrs drei `<Outlines>` : BackSide, extrusion le long des normales, `toCreasedNormals`, option screenspace. https://github.com/pmndrs/drei/blob/master/src/core/Outlines.tsx
- pmndrs `postprocessing` : fusion des effets en passes minimales. https://github.com/pmndrs/postprocessing
- Omar Shehata, « How to render full outlines as a post process » (forum three.js). https://discourse.threejs.org/t/how-to-render-full-outlines-as-a-post-process-tutorial/22674
- Ben Golus, « The Quest for Very Wide Outlines » : limites de l'inverted hull (arêtes dures, trous). https://bgolus.medium.com/the-quest-for-very-wide-outlines-ba82ed442cd9
- three.js docs `WebGLRenderer` (`shadowMap`, `toneMapping` défaut, `info.render`) et `BatchedMesh`. https://threejs.org/docs/pages/WebGLRenderer.html · https://threejs.org/docs/pages/BatchedMesh.html
- three.js manual, « How to dispose of objects ». https://threejs.org/manual/en/how-to-dispose-of-objects.html
- Discover three.js, « Tips and Tricks » (draw calls, pixel ratio, POT, MSAA vs FXAA). https://discoverthreejs.com/tips-and-tricks/
- Bruno Simon, étude de cas du portfolio 2025 (instancing massif, géométries fusionnées, atlas palette, textures compressées, tiers mobile). https://www.awwwards.com/brunos-portfolio-case-study.html
