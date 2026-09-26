// Lot LSKY : génère les panoramas 360° peints (équirectangulaires) de chaque arène avec Gemini image.
// Plusieurs essais par map, écrits en brut dans captures/sky-raw/<map>-<n>.png : on choisit le meilleur en
// regardant, puis `python tools/sky/finish-pano.py <brut> <map>` raccorde la couture, recadre en 2:1 et sort
// public/assets/sky/<map>.webp.
// Usage : node tools/sky/generate-panos.mjs [--maps archipel,galion,cuisine] [--n 3]
// Clé : GEMINI_API_KEY (environnement, sinon .env du dossier courant). Jamais affichée.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MAPS = opt('--maps', 'archipel,galion,cuisine').split(',');
const N = Number(opt('--n', '3'));
const OUT = opt('--out', 'captures/sky-raw');
const MODELE = 'gemini-3-pro-image'; // = GEMINI_IMAGE_MODEL (api/_models.ts)
mkdirSync(OUT, { recursive: true });

// .env du dossier courant, sinon d'un dossier parent (un worktree vit dans <dépôt>/.claude/worktrees/…).
const fichierEnv = ['.env', '../.env', '../../.env', '../../../.env'].find((p) => existsSync(p));
if (!process.env.GEMINI_API_KEY && fichierEnv) {
  for (const l of readFileSync(fichierEnv, 'utf8').split(/\r?\n/)) {
    const i = l.indexOf('='); if (i < 1 || l.trim().startsWith('#')) continue;
    const k = l.slice(0, i).trim(); if (!(k in process.env)) process.env[k] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
if (!process.env.GEMINI_API_KEY) { console.log('GEMINI_API_KEY absente.'); process.exit(1); }

const COMMUN = [
  'A seamless 360-degree equirectangular panorama (spherical projection, like a video game skybox), full wraparound.',
  'The horizon line sits EXACTLY at the vertical middle of the image. The left edge and the right edge must connect seamlessly.',
  'Top 15% of the image: simple, almost uniform sky with no objects (it becomes the zenith). Bottom 15%: simple, almost uniform surface (it becomes the nadir).',
  'Style: hand-painted stylized game background art, like the stage backgrounds of Super Smash Bros. Ultimate or Brawlhalla: bold readable shapes, painterly brush strokes, rich but controlled palette, strong atmospheric perspective, clear value layering from foreground to far distance.',
  'NOT photorealistic, NOT a 3D render, NO text, NO logos, NO characters, NO people, NO frame, NO border, NO vignette, NO lens flare.',
  'The central part of the image (the area around the middle column) is the main vista behind the arena: put the most interesting silhouettes there, but keep the exact middle band calm so fighters stay readable in front of it.',
];
const PROMPTS = {
  archipel: [
    'Scene: a sea of fluffy clouds at golden hour, apricot and peach sunset glow low on the horizon, soft teal-to-lavender sky higher up.',
    'Distant floating islands with hanging rocks underneath drift above the cloud sea at various distances, some with medieval castles, a windmill, a church spire, small villages, pine trees, as soft silhouettes that fade with distance.',
    'Tiny waterfalls spill from some islands into the clouds. A few birds. The cloud sea fills the lower half, catching warm light.',
  ],
  galion: [
    'Scene: a raging stormy ocean under a dramatic verdigris / sea-green and slate storm sky, heavy rolling clouds, a few bright lightning bolts in the distance, shafts of pale light breaking through.',
    'A distant pirate fleet: three or four tall-masted galleons with torn sails as dark silhouettes on the horizon at different distances, one far lighthouse on a rocky islet, huge waves with white foam crests.',
    'The lower half is the churning dark teal ocean with foam patterns, getting simpler toward the bottom.',
  ],
  cuisine: [
    'Scene: the inside of a warm, cozy real home kitchen seen from the height of a countertop, as if you were a tiny toy standing on the kitchen island: everything is GIANT.',
    'All around: cream and terracotta tiled walls, wooden wall shelves with jars, spice pots and copper pans, a huge bright window with daylight and plants on the sill (in the middle of the view), a giant stove with a steaming pot, a big fridge, hanging utensils, cabinets.',
    'Upper part: the ceiling with warm pendant lamps fading to a simple warm ceiling at the top. Lower part: the countertop and the tiled floor far below, simple toward the bottom. Warm afternoon light.',
  ],
};

async function generer(map, n) {
  const texte = [...COMMUN, ...PROMPTS[map]].join('\n');
  const t0 = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: texte }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '21:9', imageSize: '4K' } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error('pas d\'image : ' + JSON.stringify(j.candidates?.[0]?.finishReason));
  const f = `${OUT}/${map}-${n}.png`;
  writeFileSync(f, Buffer.from(part.inlineData.data, 'base64'));
  console.log(`${f} (${Math.round((Date.now() - t0) / 1000)} s)`);
}

const taches = [];
for (const map of MAPS) for (let n = 1; n <= N; n++) {
  taches.push(generer(map, n).catch((e) => console.log(map, n, 'échec :', String(e).slice(0, 300))));
}
await Promise.all(taches);
