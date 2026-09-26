// Paquet de déploiement Vercel (Build Output API v3) : le jeu statique (vite build) + chaque api/*.ts
// empaqueté en fonction Node autonome (dépendances incluses, adaptateur tools/vercel/adapt.ts).
// Seul .vercel/output est envoyé : ni .env, ni copies de travail, ni captures.
// Usage : node tools/vercel/build-output.mjs, puis npx vercel deploy --prebuilt [--prod]
import { rolldown } from 'rolldown';
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = join(ROOT, '.vercel', 'output');
const ENTRIES = join(ROOT, '.vercel', 'entries');
rmSync(OUT, { recursive: true, force: true });
rmSync(ENTRIES, { recursive: true, force: true });
mkdirSync(ENTRIES, { recursive: true });

execSync(`npx vite build --outDir "${join(OUT, 'static')}" --emptyOutDir`, { cwd: ROOT, stdio: 'inherit' });

const names = readdirSync(join(ROOT, 'api'))
  .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
  .map((f) => f.slice(0, -3));

for (const name of names) {
  const entry = join(ENTRIES, `${name}.ts`);
  writeFileSync(entry, `import h from '../../api/${name}.ts';\nimport { adapt } from '../../tools/vercel/adapt.ts';\nexport default adapt(h);\n`);
  const dir = join(OUT, 'functions', 'api', `${name}.func`);
  mkdirSync(dir, { recursive: true });
  const bundle = await rolldown({ input: entry, platform: 'node', logLevel: 'warn' });
  await bundle.write({ dir, format: 'cjs', exports: 'auto', entryFileNames: 'index.cjs', chunkFileNames: '[name]-[hash].cjs' });
  await bundle.close();
  writeFileSync(join(dir, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs22.x',
    handler: 'index.cjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: true,
    maxDuration: 60,
  }, null, 2));
  console.log(`fonction api/${name} prête`);
}

writeFileSync(join(OUT, 'config.json'), JSON.stringify({ version: 3 }, null, 2));
console.log(`Paquet prêt : ${OUT} (${names.length} fonctions)`);
