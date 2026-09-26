import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { log } from '../dashboard/log.mjs';

const photo = process.argv[2];
const nom = process.argv[3];

if (!photo || !nom) {
  console.error('Usage: node tools/vedettes/build.mjs <photo_filename> <nom>');
  process.exit(1);
}

const inputPath = path.join('tools', 'vedettes', 'input', photo);
if (!fs.existsSync(inputPath)) {
  console.error(`Fichier introuvable : ${inputPath}`);
  process.exit(1);
}

const workDir = path.join('tools', 'vedettes', 'work', nom);
fs.mkdirSync(workDir, { recursive: true });

function runScript(scriptPath, args) {
  console.log(`\n--- Lancement de ${scriptPath} ---`);
  const res = spawnSync('node', [scriptPath, ...args], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`Erreur dans ${scriptPath} (code ${res.status})`);
    process.exit(res.status);
  }
}

// 1. Planche T-pose (Gemini)
runScript('tools/vedettes/turnaround.mjs', [photo, nom]);

// 2. Image -> 3D (Rodin / Hunyuan3D)
runScript('tools/vedettes/rodin.mjs', [nom]);

// 3. Rig sur le squelette KayKit (Blender)
console.log(`\n--- Lancement du Rig dans Blender ---`);
const blenderPath = "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe";
const rodinGlb = path.join('tools', 'vedettes', 'work', nom, 'rodin.glb');
const kaykitGlb = path.join('public', 'assets', 'characters', 'knight.glb');
const outGlb = path.join('public', 'assets', 'vedettes', `${nom}.glb`);

const blenderRes = spawnSync(blenderPath, [
  '-b', '-P', 'tools/vedettes/rig.py', '--',
  rodinGlb, kaykitGlb, outGlb
], { stdio: 'inherit' });

if (blenderRes.status !== 0) {
  log({ source: 'blender', kind: 'generation', title: 'Erreur rigging Blender' });
  console.error('Erreur lors du rigging avec Blender');
  process.exit(blenderRes.status);
} else {
  log({ source: 'blender', kind: 'generation', title: 'Rigging Blender réussi' });
}

// 4. Contrôle automatique (Playwright)
runScript('tools/vedettes/check.mjs', [nom]);

console.log(`\nVedette ${nom} générée avec succès ! GLB disponible dans ${outGlb}`);
