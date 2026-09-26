// Génère des photos « webcam » réalistes des objets de démo (demo/OBJETS.md) pour tester le parcours
// photo -> arme sans objet physique sous la main (lot LSCAN). Sortie : captures/lscan/photos/<slug>.png
// Usage : node tools/lscan/photos.mjs [slug ...]
import { GoogleGenAI, Modality } from '@google/genai';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadEnv } from './env.mjs';

loadEnv();
const OUT = 'captures/lscan/photos';
mkdirSync(OUT, { recursive: true });

export const OBJETS = {
  'coffee-mug': 'a red ceramic coffee mug held up by a hand',
  banana: 'a ripe yellow banana lying on a wooden desk next to a laptop',
  'plush-toy': 'a small brown teddy bear plush toy held up by a hand',
  headphones: 'a pair of black over-ear headphones lying on a desk',
  sneaker: 'a white and blue running sneaker held up by a hand',
  'hardcover-book': 'a thick hardcover book with a plain green cover held up by a hand',
  'water-bottle': 'an opaque orange reusable plastic water bottle standing on a desk',
  smartphone: 'a smartphone with its screen off, held up by a hand',
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const wanted = process.argv.slice(2);
const slugs = wanted.length ? wanted : Object.keys(OBJETS);

await Promise.all(
  slugs.map(async (slug) => {
    const t0 = Date.now();
    const res = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: `A casual, slightly imperfect laptop-webcam photo (landscape) of ${OBJETS[slug]}, in a busy bright hackathon venue, background softly out of focus with tables and people. Realistic photo, natural light, no text, no logos.`,
      config: { responseModalities: [Modality.IMAGE] },
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) return console.log(`[FAIL] ${slug} (${Date.now() - t0} ms)`);
    const ext = part.inlineData.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    writeFileSync(`${OUT}/${slug}.${ext}`, Buffer.from(part.inlineData.data, 'base64'));
    console.log(`[OK] ${slug}.${ext} ${Date.now() - t0} ms`);
  }),
);
