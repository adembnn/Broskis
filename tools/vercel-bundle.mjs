// Après `vercel build --prod` : réécrit chaque fonction .vercel/output/functions/api/<nom>.func/api/<nom>.js en
// UN seul fichier (Rolldown), car Vercel transpile les .ts fichier par fichier en ESM et les imports relatifs
// sans extension (`./_types`, `../src/core/types`…) plantent au chargement (ERR_MODULE_NOT_FOUND, vu à 20h10).
// Les paquets npm (ex. @google/genai) restent externes : ils sont déjà copiés dans le node_modules de la fonction.
// Usage : npx vercel build --prod --yes && node tools/vercel-bundle.mjs && npx vercel deploy --prebuilt --prod --yes
import { rolldown } from 'rolldown';
import { readdirSync, existsSync } from 'node:fs';
import { builtinModules } from 'node:module';

const FUNCS = '.vercel/output/functions/api';
const external = (id) => builtinModules.includes(id) || id.startsWith('node:') || !(id.startsWith('.') || id.startsWith('/') || /^[A-Za-z]:/.test(id));
for (const dir of readdirSync(FUNCS).filter((d) => d.endsWith('.func'))) {
  const name = dir.replace(/\.func$/, '');
  const src = `api/${name}.ts`;
  if (!existsSync(src)) continue;
  const bundle = await rolldown({ input: src, platform: 'node', external });
  await bundle.write({ file: `${FUNCS}/${dir}/api/${name}.js`, format: 'esm' });
  await bundle.close();
  console.log('ok', name);
}
