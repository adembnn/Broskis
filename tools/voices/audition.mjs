import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let envPath = path.join(ROOT, '.env');
if (!fs.existsSync(envPath)) envPath = path.join(ROOT, '..', '..', '..', '.env');

function loadEnv(envPath) {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const ENV = loadEnv(envPath);
const GRADIUM_API_KEY = ENV.GRADIUM_API_KEY;
const GEMINI_API_KEY = ENV.GEMINI_API_KEY;

if (!GRADIUM_API_KEY || !GEMINI_API_KEY) {
  console.error("Missing API keys!");
  process.exit(1);
}

const TEST_PHRASE = "RAAAH! YOU CALL THAT A HIT?!";

const ORIGINAL = {
  rogue: { id: "vox_emb_K094e8x6A3ZzaRdx", config: { temp: 1.3, padding_bonus: -2 } },
};

const PROMPTS = {
  barbarian: "A gigantic barbarian warlord BELLOWING a battle cry at the top of his lungs, monstrous deep chest voice, raspy, growling between words, spit flying, berserker rage, laughing like a maniac, cartoon Viking",
  knight: "An over-the-top heroic knight SCREAMING a charge into battle, booming theatrical British voice cracking with excitement, absolutely fired up, fast, cartoon hero",
  mage: "A hyperactive cartoon old wizard SCREECHING with glee, high-pitched, crackly, frantic, maniacal cackles, completely unhinged",
  rogue: "A cocky cartoon trickster YELLING taunts, fast, bratty, mocking laughter, arrogant and extremely loud",
};

async function generateCandidates(prompt) {
  const res = await fetch("https://api.gradium.ai/api/voice-generator/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": GRADIUM_API_KEY },
    body: JSON.stringify({ prompt, language: "en", n_samples: 4 })
  });
  const json = await res.json();
  if (!json.embeddings) throw new Error("No embeddings in response: " + JSON.stringify(json));
  
  const ids = json.embeddings.map(e => e.embedding_id);
  const readyIds = [];
  
  for (const id of ids) {
    while (true) {
      const pRes = await fetch(`https://api.gradium.ai/api/voice-generator/embeddings?embedding_id=${id}`, {
        headers: { "x-api-key": GRADIUM_API_KEY }
      });
      const pJson = await pRes.json();
      if (pJson.embeddings && pJson.embeddings[0] && pJson.embeddings[0].ready) {
        readyIds.push(id);
        break;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return readyIds;
}

async function generateTTS(voice_id, config) {
  let attempt = 0;
  while (true) {
    const res = await fetch("https://api.gradium.ai/api/post/speech/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": GRADIUM_API_KEY },
      body: JSON.stringify({
        text: TEST_PHRASE,
        voice_id,
        output_format: "wav",
        only_audio: true,
        model_name: "gradium-tts-beta",
        json_config: config
      })
    });
    if (res.status === 429 || (res.status === 400 && (await res.clone().text()).includes("Concurrency limit"))) {
      attempt++;
      if (attempt > 10) throw new Error(`TTS failed ${res.status}: ` + await res.text());
      console.log(`Concurrency limit hit, waiting ${attempt * 2}s...`);
      await new Promise(r => setTimeout(r, attempt * 2000));
      continue;
    }
    if (!res.ok) throw new Error(`TTS failed ${res.status}: ` + await res.text());
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  }
}

async function askGemini(role, files) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;
  
  const parts = [{
    text: `Listen to these 5 voice lines. We are casting a character: ${role}.
The line is: "${TEST_PHRASE}"
Candidates are audio clips 1 to 5.
Rank them from best to worst based on:
1. Energy and scream level (must be very high).
2. Character believability.
3. No robotic tone.
4. Understandable articulation.

Output ONLY a JSON object: { "winner": <index 1-5>, "reason": "short explanation" }`
  }];
  
  for (const [idx, b64] of files.entries()) {
    parts.push({ text: `Audio ${idx + 1}:` });
    parts.push({ inlineData: { mimeType: "audio/wav", data: b64 } });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
    })
  });
  
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}

async function main() {
  const finalConfigs = {};
  for (const [role, orig] of Object.entries(ORIGINAL)) {
    console.log(`\nTesting ${role}...`);
    
    // Config used for testing Candidates
    const testConfig = { temp: 1.4, padding_bonus: -2.0 }; // pushing it as per instructions
    
    console.log(`Generating candidates for ${role}...`);
    const candidates = await generateCandidates(PROMPTS[role]);
    
    const idsToTest = [...candidates, orig.id];
    console.log(`Got IDs: ${idsToTest.join(', ')}`);
    
    const audios = [];
    for (const [idx, id] of idsToTest.entries()) {
      console.log(`Generating TTS for ${id} (idx ${idx+1})...`);
      const cfg = (id === orig.id) ? orig.config : testConfig;
      const b64 = await generateTTS(id, cfg);
      audios.push(b64);
    }
    
    console.log(`Asking Gemini to judge ${role}...`);
    const judgment = await askGemini(role, audios);
    console.log(`Judgment for ${role}:`, judgment);
    
    const winnerIdx = judgment.winner - 1;
    const winnerId = idsToTest[winnerIdx];
    const winnerConfig = (winnerId === orig.id) ? orig.config : testConfig;
    
    finalConfigs[role] = { id: winnerId, config: winnerConfig };
  }
  
  console.log("\nFINAL CONFIGS:");
  console.log(JSON.stringify(finalConfigs, null, 2));
}

main().catch(console.error);