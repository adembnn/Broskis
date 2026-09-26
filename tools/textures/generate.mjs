import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GoogleGenAI, Modality } from '@google/genai';

function chargerEnvDepuisRacine() {
  const chemin = '.env';
  if (!existsSync(chemin)) return;
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const l = ligne.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i === -1) continue;
    const cle = l.slice(0, i).trim();
    const valeur = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (cle && !(cle in process.env)) process.env[cle] = valeur;
  }
}
chargerEnvDepuisRacine();

if (!process.env.GEMINI_API_KEY) {
  console.log('Clé GEMINI_API_KEY absente.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image';

const outDir = 'public/assets/textures';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const textures = {
  'hex-herbe': { usage: 'map (archipel)', prompt: 'Seamless tiling texture of stylized cartoon grass, painted style like Fall Guys or Smash Bros, flat vibrant green colors, no realistic shadows, top-down view, fully tileable, no edges, exactly square, 2D art.' },
  'hex-pierre': { usage: 'map (archipel), côtés des dalles', prompt: 'Seamless tiling texture of stylized cartoon grey stone blocks or rocky cliff side, painted style like Sea of Thieves, flat vibrant colors, no realistic shadows, fully tileable, flat lighting, exactly square, 2D art.' },
  'ruine-pierre': { usage: 'map (archipel)', prompt: 'Seamless tiling texture of stylized ancient stone ruins, painted style like Smash Bros, slightly mossy, flat vibrant colors, no photorealism, fully tileable, exactly square, 2D art.' },
  'pont-bois': { usage: 'map (galion)', prompt: 'Seamless tiling texture of stylized cartoon wooden ship deck planks, painted style like Sea of Thieves, warm brown wood, flat vibrant colors, fully tileable, top-down, exactly square, 2D art.' },
  'coque-bois': { usage: 'map (galion)', prompt: 'Seamless tiling texture of stylized cartoon painted wood hull for a pirate ship, horizontal planks, painted style, flat vibrant colors, fully tileable, exactly square, 2D art.' },
  'voile-toile': { usage: 'map (galion)', prompt: 'Seamless tiling texture of stylized cartoon worn sailcloth canvas, painted style, flat vibrant colors, off-white, no photorealism, fully tileable, exactly square, 2D art.' },
  'metal-canon': { usage: 'map (galion)', prompt: 'Seamless tiling texture of stylized cartoon dark cast iron metal for a cannon, painted style like Sea of Thieves, flat vibrant colors, no photorealism, fully tileable, exactly square, 2D art.' },
  'plan-travail-bois': { usage: 'map (cuisine)', prompt: 'Seamless tiling texture of stylized cartoon butcher block wood countertop, painted style, flat vibrant colors, warm tones, fully tileable, exactly square, 2D art.' },
  'carrelage-sol': { usage: 'map (cuisine)', prompt: 'Seamless tiling texture of stylized cartoon kitchen floor tiles, checkerboard or painted style, flat vibrant colors, fully tileable, exactly square, 2D art.' },
  'planche-decouper': { usage: 'map (cuisine)', prompt: 'Seamless tiling texture of stylized cartoon wooden cutting board surface, painted style, flat vibrant colors, fully tileable, exactly square, 2D art.' },
  'metal-inox': { usage: 'map (cuisine)', prompt: 'Seamless tiling texture of stylized cartoon brushed stainless steel metal, painted style, flat vibrant colors, no photorealism, fully tileable, exactly square, 2D art.' },
  'tonneau-bois': { usage: 'objet (communs)', prompt: 'Seamless tiling texture of stylized cartoon wooden barrel staves, painted style like Sea of Thieves, flat vibrant colors, fully tileable, exactly square, 2D art.' },
  'caisse-bois': { usage: 'objet (communs)', prompt: 'Seamless tiling texture of stylized cartoon wooden crate planks, painted style like Smash Bros, flat vibrant colors, fully tileable, exactly square, 2D art.' }
};

async function generate() {
  const jsonOut = {};
  for (const [name, info] of Object.entries(textures)) {
    console.log(`Génération de ${name}...`);
    try {
      const res = await ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: [
          {
            role: 'user',
            parts: [{ text: info.prompt }]
          }
        ],
        config: {
          responseModalities: [Modality.IMAGE]
        }
      });
      
      const candidate = res.candidates?.[0];
      const part = candidate?.content?.parts?.find(p => p.inlineData?.data);
      if (part && part.inlineData) {
        const base64Data = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png';
        const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
        const filename = `${name}.${ext}`;
        const filePath = `${outDir}/${filename}`;
        
        writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        console.log(`  -> ${filename} généré.`);
        
        jsonOut[name] = {
          file: filename,
          usage: info.usage
        };
      } else {
        console.error(`  -> Échec (pas d'image). Raison : ${candidate?.finishReason}`);
      }
    } catch (e) {
      console.error(`  -> Erreur: ${e.message}`);
    }
  }
  
  writeFileSync(`${outDir}/textures.json`, JSON.stringify(jsonOut, null, 2));
  console.log(`Index écrit dans ${outDir}/textures.json`);
}

generate();
