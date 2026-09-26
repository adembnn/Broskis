import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VOICES_DIR = path.join(ROOT, 'public', 'assets', 'voices');
const MANIFEST_PATH = path.join(VOICES_DIR, 'manifest.json');

let envPath = path.join(ROOT, '.env');
if (!fs.existsSync(envPath)) envPath = path.join(ROOT, '..', '..', '..', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const gradiumKeyMatch = envText.match(/^GRADIUM_API_KEY=(.+)$/m);
const GRADIUM_API_KEY = gradiumKeyMatch ? gradiumKeyMatch[1].replace(/["']/g, '') : process.env.GRADIUM_API_KEY;

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

let totalSize = 0;
let totalFiles = 0;

const fighters = ['barbarian', 'knight', 'mage', 'rogue'];
const sampleFiles = []; // Pick 5 files to STT

for (const role of fighters) {
  for (const [event, entries] of Object.entries(manifest[role] || {})) {
    for (const entry of entries) {
      const p = path.join(VOICES_DIR, entry.file);
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        totalSize += stat.size;
        totalFiles++;
        
        if (sampleFiles.length < 5) {
          sampleFiles.push({ file: entry.file, text: entry.text, path: p });
        }
      }
    }
  }
}

// Average duration
// Gradium is 48kHz, 16bit, mono -> 96000 bytes/sec
const avgSize = totalSize / totalFiles;
const avgDuration = avgSize / 96000;

console.log(`Total files (fighters): ${totalFiles}`);
console.log(`Average duration: ${avgDuration.toFixed(2)} seconds`);

async function runSTT() {
  console.log("\nRunning STT on 5 samples:");
  for (const sample of sampleFiles) {
    const audioData = fs.readFileSync(sample.path);
    const res = await fetch('https://api.gradium.ai/api/post/speech/asr?language=en', {
      method: 'POST',
      headers: { 'x-api-key': GRADIUM_API_KEY, 'Content-Type': 'audio/wav' },
      body: audioData
    });
    if (!res.ok) {
      console.error(`STT failed for ${sample.file}: ${res.status} - ${await res.text()}`);
      continue;
    }
    const json = await res.json();
    console.log(`- File: ${sample.file}`);
    console.log(`  Expected: ${sample.text}`);
    console.log(`  Gradium STT: ${json.text}`);
  }
}

runSTT().catch(console.error);