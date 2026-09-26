// Préparation (lot LSCAN) : UN seul appel Gemini estime la physique réelle de toutes les armes préréglées
// (public/assets/presets/presets.json) et des objets du cache de démo (public/demo-cache/objects/*.json), puis le
// code l'arbitre (src/ia/physics.ts : clampPhysics + deriveStats) et l'écrit dans ces fichiers.
// Usage : node tools/lscan/prefill-physics.mjs
import { GoogleGenAI, Type } from '@google/genai';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runnerImport } from 'vite';
import { loadEnv } from './env.mjs';

loadEnv();
const { module: P } = await runnerImport(resolve('src/ia/physics.ts'));

const PRESETS = 'public/assets/presets/presets.json';
const DEMO = 'public/demo-cache/objects';
const presets = JSON.parse(readFileSync(PRESETS, 'utf8'));
const demo = readdirSync(DEMO).filter((f) => f.endsWith('.json')).map((f) => ({ file: `${DEMO}/${f}`, w: JSON.parse(readFileSync(`${DEMO}/${f}`, 'utf8')) }));
const names = [...new Set([...presets.map((w) => w.object), ...demo.map((d) => d.w.object)])];

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const t0 = Date.now();
const res = await ai.models.generateContent({
  model: 'gemini-3.8-flash',
  contents: `For each object below, estimate the REAL physics of a typical real example of it: dominant material, overall shape (long, flat, round, box or irregular), height/width/depth in meters, mass in kg, bounciness (0 dead weight, 1 rubber ball), whether it breaks on impact, whether it holds a liquid, and your confidence. References: a soda can is 0.35 kg and 0.12 m tall; a smartphone 0.2 kg; a hardcover book 1 kg; a wooden chair 7 kg; an office chair 13 kg and 1.1 m tall.\nObjects:\n${names.map((n) => `- ${n}`).join('\n')}`,
  config: {
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          object: { type: Type.STRING },
          material: { type: Type.STRING, enum: [...P.MATERIALS] },
          shape: { type: Type.STRING, enum: [...P.SHAPES] },
          heightM: { type: Type.NUMBER },
          widthM: { type: Type.NUMBER },
          depthM: { type: Type.NUMBER },
          massKg: { type: Type.NUMBER },
          bounciness: { type: Type.NUMBER },
          fragile: { type: Type.BOOLEAN },
          liquid: { type: Type.BOOLEAN },
          physicsConfidence: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
        },
        required: ['object', 'material', 'shape', 'heightM', 'widthM', 'depthM', 'massKg', 'bounciness', 'fragile', 'liquid', 'physicsConfidence'],
      },
    },
  },
});
const rows = JSON.parse(res.text ?? '[]');
console.log(`Gemini : ${rows.length} objets en ${Date.now() - t0} ms`);
const byName = new Map(rows.map((r) => [String(r.object).toLowerCase(), r]));

/** Physique arbitrée + stats et trait déduits, écrits dans l'arme. */
function apply(w) {
  const raw = byName.get(w.object.toLowerCase()) ?? {};
  w.physics = P.clampPhysics(raw, w.category, w.object);
  const { stats, trait } = P.deriveStats(w.physics, w.category, w.trait);
  w.stats = stats;
  w.trait = trait;
  console.log(`${w.object.padEnd(24)} ${String(w.physics.massKg).padStart(6)} kg ${Math.max(...w.physics.sizeM).toFixed(2)} m ${w.physics.material.padEnd(8)} ${w.physics.shape.padEnd(9)} ${w.category.padEnd(9)} ${JSON.stringify(stats)} ${trait}`);
}

for (const w of presets) apply(w);
writeFileSync(PRESETS, `${JSON.stringify(presets, null, 2)}\n`);
for (const d of demo) {
  apply(d.w);
  writeFileSync(d.file, `${JSON.stringify(d.w, null, 2)}\n`);
}
