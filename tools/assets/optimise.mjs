// Optimise un dossier (ou un fichier) de GLB avec glTF-Transform, lancé par npx (jamais ajouté au package.json).
// Passe : dédoublonnage, soudure, quantification + compression meshopt (décodée par le jeu : MeshoptDecoder),
// textures ramenées à 512 px maximum. Pas de simplification (elle abîme les facettes voulues).
// Affiche avant/après : Ko, triangles, textures.
// Usage : node tools/assets/optimise.mjs <entrée .glb|dossier> <dossier de sortie> [--stats sortie.json] [--texture 512]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { glbStats } from './glb-stats.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [entree, sortie] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!entree || !sortie) {
  console.error('Usage : node tools/assets/optimise.mjs <entrée .glb|dossier> <dossier de sortie> [--stats f.json] [--texture 512]');
  process.exit(1);
}
const TEX = opt('--texture', '512');
mkdirSync(sortie, { recursive: true });
const fichiers = statSync(entree).isDirectory()
  ? readdirSync(entree).filter((f) => f.toLowerCase().endsWith('.glb')).map((f) => join(entree, f))
  : [entree];

const q = (s) => `"${resolve(s)}"`;
const lignes = [];
for (const f of fichiers) {
  const dest = join(sortie, basename(f));
  const avant = glbStats(f);
  const cmd = [
    'npx -y @gltf-transform/cli@4 optimize', q(f), q(dest),
    '--compress meshopt --simplify false --palette false --instance false --join-named false',
    `--texture-size ${TEX} --texture-compress auto`,
  ].join(' ');
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`ÉCHEC ${f}\n${r.stderr || r.stdout}`);
    process.exitCode = 1;
    continue;
  }
  const apres = glbStats(dest);
  lignes.push({ fichier: basename(f), avant, apres });
  console.log(`${basename(f).padEnd(28)} ${String(avant.ko).padStart(7)} Ko -> ${String(apres.ko).padStart(7)} Ko · ${String(apres.triangles).padStart(6)} tri · textures ${apres.textures} (max ${apres.textureMax || '-'} px)`);
}
const stats = opt('--stats');
if (stats) writeFileSync(stats, JSON.stringify(lignes, null, 1));
