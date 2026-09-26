// Lot LLOAD : vérifie le flux de /api/scan-object (1 appel Gemini Flash) et mesure quand le nom de l'arme devient
// lisible, comparé à la réponse complète. Usage : node tools/lload/flux.mjs [photo.jpg] [url-du-serveur]
import { readFileSync } from 'node:fs';

const photo = process.argv[2] ?? 'public/assets/presets/banana.jpg';
const base = process.argv[3] ?? 'http://localhost:5343';
const post = async (body) => (await fetch(`${base}/api/scan-object`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);
const { jobId } = await post({ imageBase64: readFileSync(photo).toString('base64'), mimeType: 'image/jpeg', stream: true });
console.log(`${ms()} ms : tâche ${jobId}`);
let premierNom = null;
for (;;) {
  const p = await post({ jobId });
  if (p.error && !p.done) { console.log('erreur', p.error); break; }
  const nom = /"weaponName"\s*:\s*"([^"]*)/.exec(p.text ?? '')?.[1];
  if (nom && premierNom === null) { premierNom = ms(); console.log(`${premierNom} ms : premier morceau du nom « ${nom} »`); }
  console.log(`${ms()} ms : ${p.text?.length ?? 0} caractères${p.done ? ' (fini)' : ''}`);
  if (p.done) { console.log('résultat :', JSON.stringify(p.result).slice(0, 200)); break; }
}
