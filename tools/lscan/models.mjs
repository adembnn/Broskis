// Liste les modèles image/flash disponibles pour la clé (sans jamais l'afficher).
import { GoogleGenAI } from '@google/genai';
import { loadEnv } from './env.mjs';

loadEnv();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const pager = await ai.models.list({ config: { pageSize: 200 } });
for await (const m of pager) {
  if (/image|banana|flash/i.test(m.name)) console.log(m.name, '|', m.displayName);
}
