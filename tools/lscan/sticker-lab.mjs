// Banc d'essai du prompt sticker (lot LSCAN) : même photo, plusieurs modèles image, en parallèle, avec temps.
// Usage : node tools/lscan/sticker-lab.mjs <modèle> slug...   (sortie : captures/lscan/lab/<modèle>-<slug>.<ext>)
import { GoogleGenAI, Modality } from '@google/genai';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEnv } from './env.mjs';

loadEnv();
const [model, ...slugs] = process.argv.slice(2);
const OUT = 'captures/lscan/lab';
mkdirSync(OUT, { recursive: true });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Doit rester identique au prompt de api/sticker.ts pendant les essais.
const PROMPT = readFileSync('api/sticker.ts', 'utf8').match(/return `(Make[\s\S]*?|Redraw[\s\S]*?)`;/)[1].replace(/\$\{CHROMA_KEY\}/g, '#FF00FF').replace(/\$\{category[\s\S]*?\}/, '');

await Promise.all(
  slugs.map(async (slug) => {
    const file = ['jpg', 'png'].map((e) => `captures/lscan/photos/${slug}.${e}`).find(existsSync);
    const t0 = Date.now();
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: readFileSync(file).toString('base64') } }] }],
      config: { responseModalities: [Modality.IMAGE] },
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) return console.log(`${slug} ${Date.now() - t0} ms : pas d'image (${res.candidates?.[0]?.finishReason})`);
    const ext = part.inlineData.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    writeFileSync(`${OUT}/${model}-${slug}.${ext}`, Buffer.from(part.inlineData.data, 'base64'));
    console.log(`${slug} ${Date.now() - t0} ms -> ${model}-${slug}.${ext}`);
  }),
);
