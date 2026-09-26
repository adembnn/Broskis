import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');

if (!fs.existsSync(envPath)) {
  console.error('.env introuvable');
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim()))
);

const API_KEY = env.GRADIUM_API_KEY;
if (!API_KEY) {
  console.error('GRADIUM_API_KEY non définie');
  process.exit(1);
}

// Importer localement les handlers
import cloneHandler from '../api/voice-clone.ts';
import linesHandler from '../api/voice-lines.ts';
import ttsHandler from '../api/tts.ts';

async function run() {
  console.log('1. Génération de 12s de parole source avec une voix du catalogue (Marcus)...');
  const t0 = performance.now();
  const sourceText = "I am the greatest Broski of all time! Nobody touches my snacks! Bring it on, you little toaster! Victory is MINE! Ha ha ha! ".repeat(2);
  
  const sourceRes = await ttsHandler({ body: { text: sourceText, voiceId: 'r2sIQdqqoqgRJuXw' }, env });
  if (sourceRes.status !== 200 || !sourceRes.bytes) throw new Error('Echec source TTS');
  
  const audioBase64 = Buffer.from(sourceRes.bytes).toString('base64');
  
  console.log('2. Clonage de la voix...');
  const t1 = performance.now();
  const cloneRes = await cloneHandler({ body: { action: 'clone', audioBase64, mime: 'audio/wav', playerId: 1 }, env });
  if (cloneRes.status !== 200) throw new Error(`Echec clonage: ${JSON.stringify(cloneRes.json)}`);
  
  const voiceId = cloneRes.json.voiceId;
  const t2 = performance.now();
  console.log(`=> Voix clonée: ${voiceId} en ${(t2 - t1).toFixed(0)} ms`);

  console.log('3. Génération des 8 répliques avec la voix clonée...');
  const lines = [
    { id: 'taunt_turn_1', text: 'THAT IS ALL YOU GOT?!' },
    { id: 'taunt_turn_2', text: 'BROSKI POWEEER!' },
    { id: 'hit_heavy', text: 'NOT MY FAAACE!' },
    { id: 'parry_perfect', text: 'NICE TRYYY!' },
    { id: 'ringout_scream', text: 'NOOOOOOOOOOO!' },
    { id: 'ko', text: 'UGH!' },
    { id: 'victory', text: 'I TOLD YOU SO!' },
    { id: 'low_hp', text: 'THIS IS FINE!' }
  ];

  const linesRes = await linesHandler({ body: { voiceId, lines }, env });
  if (linesRes.status !== 200) throw new Error(`Echec lignes: ${JSON.stringify(linesRes.json)}`);
  
  const results = linesRes.json.results;
  const t3 = performance.now();
  console.log(`=> 8 répliques générées en ${(t3 - t2).toFixed(0)} ms`);

  const outDir = path.resolve(__dirname, '../reports/tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const firstBuf = Buffer.from(results['taunt_turn_2'], 'base64');
  const outFile = path.resolve(outDir, 'clone_test.wav');
  fs.writeFileSync(outFile, firstBuf);
  console.log(`=> Sauvegardé 'BROSKI POWEEER!' dans ${outFile}`);

  console.log('4. Suppression du clone...');
  const delRes = await cloneHandler({ body: { action: 'delete', voiceId }, env });
  console.log(`=> Clone supprimé: status ${delRes.status}`);

  console.log('\n--- TEMPS MESURÉS ---');
  console.log(`Clonage : ${(t2 - t1).toFixed(0)} ms`);
  console.log(`Génération (8 lignes, max 2 //) : ${(t3 - t2).toFixed(0)} ms`);
  console.log(`Total depuis audio brut : ${(t3 - t1).toFixed(0)} ms`);
}

run().catch(console.error);
