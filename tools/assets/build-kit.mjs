// Reconstruit tout le kit d'arène en une commande :
//   1. Blender sans fenêtre génère les GLB bruts (tools/blender/arena_kit.py) dans un dossier temporaire ;
//   2. optimise.mjs les compresse (meshopt + quantification) dans public/assets/arena-kit/ ;
//   3. kit.json est réécrit (dimensions, ancre, surface de marche, collider conseillé, usage, triangles, Ko).
// Usage : node tools/assets/build-kit.mjs [--only nom1,nom2] [--blender "C:\...\blender.exe"]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { glbStats } from './glb-stats.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BLENDER = opt('--blender', 'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe');
const ONLY = opt('--only', '');
const RAW = join(tmpdir(), 'broskis-arena-kit');
const DEST = 'public/assets/arena-kit';
mkdirSync(RAW, { recursive: true });
mkdirSync(DEST, { recursive: true });
// dossier brut vidé (reconstruction complète) ou limité aux pièces demandées : jamais de GLB périmé recopié
const demandees = new Set(ONLY.split(',').filter(Boolean));
for (const f of readdirSync(RAW)) if (!demandees.size || demandees.has(f.replace(/\.glb$/, ''))) unlinkSync(join(RAW, f));

const b = spawnSync(BLENDER, ['-b', '--factory-startup', '-P', 'tools/blender/arena_kit.py', '--', '--out', RAW, ...(ONLY ? ['--only', ONLY] : [])], { encoding: 'utf8' });
const log = (b.stdout || '') + (b.stderr || '');
for (const l of log.split('\n')) if (l.includes('[arena_kit]') || /Error|Traceback/.test(l)) console.log(l.trim());
if (b.status !== 0 || /Traceback/.test(log)) { console.error('Blender a échoué'); process.exit(1); }

for (const f of readdirSync(RAW)) {
  if (!f.endsWith('.glb') || (demandees.size && !demandees.has(f.replace(/\.glb$/, '')))) continue;
  const o = spawnSync(process.execPath, ['tools/assets/optimise.mjs', join(RAW, f), DEST], { encoding: 'utf8', stdio: 'inherit' });
  if (o.status !== 0) process.exit(1);
}

// kit.json : fusion des métadonnées Blender (pieces.json) avec l'existant (pour les reconstructions partielles)
const neuves = JSON.parse(readFileSync(join(RAW, 'pieces.json'), 'utf8'));
const kitPath = join(DEST, 'kit.json');
const ancien = existsSync(kitPath) ? JSON.parse(readFileSync(kitPath, 'utf8')) : { pieces: [] };
const parNom = new Map(ancien.pieces.map((p) => [p.nom, p]));
for (const [nom, meta] of Object.entries(neuves)) parNom.set(nom, meta);
const ordre = ['plateau', 'plateforme', 'bord', 'couvert', 'fond'];
const pieces = [...parNom.values()]
  .filter((p) => existsSync(join(DEST, p.fichier)))
  .map((p) => { const s = glbStats(join(DEST, p.fichier)); return { ...p, triangles: s.triangles, ko: s.ko }; })
  .sort((a, c) => (ordre.indexOf(a.role) - ordre.indexOf(c.role)) || a.nom.localeCompare(c.nom));
const kit = {
  lot: 'LKIT',
  genere: new Date().toISOString().slice(0, 16),
  unites: 'mètres, Y vers le haut ; ancre = centre du dessus marchable à y = 0 (sauf mention « ancre » dans la pièce)',
  chargement: 'GLTFLoader.setMeshoptDecoder(MeshoptDecoder) (EXT_meshopt_compression + KHR_mesh_quantization, déjà géré par src/scene/maps/loader.ts)',
  matiere: { nom: 'arena_kit', type: 'MeshStandardMaterial', vertexColors: true, roughness: 0.85, metalness: 0, note: 'toute la couleur et l\'occlusion ambiante sont dans COLOR_0 ; ne pas re-teinter (grade {} ou saturation 1)' },
  regenerer: 'node tools/assets/build-kit.mjs',
  pieces,
};
writeFileSync(kitPath, JSON.stringify(kit, null, 1) + '\n');
console.log(`${kitPath} : ${pieces.length} pièces`);
