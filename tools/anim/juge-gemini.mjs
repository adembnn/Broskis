// Juge vidéo Gemini (lot LE, plan/lots/LE-eval-animation.md) : envoie chaque vidéo de scénario
// (captures/anim/video/<scénario>.webm) au modèle ci-dessous avec une grille de correction, et récupère un
// verdict JSON contraint. Écrit captures/anim/gemini-verdict.json. Lancé par anim-eval.mjs (sauf --no-gemini),
// ou directement : node tools/anim/juge-gemini.mjs
const MODELE = 'gemini-3.1-pro-preview'; // le meilleur modèle disponible (consigne du lot LE) — ne pas changer sans consigne.
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`;
const TAILLE_MAX = 20 * 1024 * 1024; // 20 Mo : au-delà, l'envoi en ligne (inlineData) n'est pas fait.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';

const OUT = 'captures/anim';
const OUT_VIDEO = `${OUT}/video`;

// ---- Clé API : lue dans process.env.GEMINI_API_KEY, remplie en analysant .env à la racine (sans paquet dotenv). ----
// Ce script s'exécute côté outillage (jamais envoyé au navigateur) : c'est ICI, et seulement ici, qu'on touche .env.
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
  console.log('Clé GEMINI_API_KEY absente (ni variable d\'environnement, ni .env à la racine — voir .env.example).');
  console.log('Juge vidéo Gemini ignoré : dépose la clé dans .env puis relance `npm run anim` sans --no-gemini.');
  process.exit(0);
}

// ---- Grille de correction : les 8 critères de l'agent animateur-exigeant + les 12 principes de l'animation. ----
const CRITERES_8 = [
  ['anticipation', 'Anticipation et continuité du mouvement (jamais un arrêt net, jamais une trajectoire en ligne droite au lieu d\'un arc).'],
  ['arcsPoids', 'Arcs et poids : transfert du poids d\'un pied/appui à l\'autre, inertie qui continue après l\'action.'],
  ['synchroLacher', 'Synchronisation lâcher / main / projectile : le projectile naît exactement dans la main, à l\'image du lâcher.'],
  ['contactSol', 'Contact au sol : pas de glissement des pieds posés, IK crédible, aucune pénétration dans le sol.'],
  ['regard', 'Regard et intention : tête et torse orientés vers la cible/l\'action, le défenseur suit des yeux le projectile.'],
  ['reactions', 'Réactions : direction et intensité cohérentes avec le coup reçu, relevé après recul, KO lisible.'],
  ['idle', 'Vie à l\'arrêt : idle jamais figé (respiration, transfert de poids, gestes), humeur selon les PV.'],
  ['environnement', 'Adaptation à l\'environnement : déséquilibre au bord du vide, réaction au pont qui gîte ou à une explosion.'],
];
const PRINCIPES_12 = [
  'Écrasement et étirement (à volume constant)', 'Anticipation', 'Mise en scène (lisibilité de l\'action)',
  'Image par image ou pose à pose', 'Continuité et chevauchement du mouvement', 'Accéléré/ralenti en entrée et sortie',
  'Arcs (aucune trajectoire articulaire en ligne droite)', 'Action secondaire', 'Timing (poids et intention par la vitesse)',
  'Exagération (lisible, façon Smash Bros)', 'Solidité du volume (pas d\'auto-intersection, pas de glissement de poids irréaliste)',
  'Charisme / attrait de la pose',
];

function construireGrille(scenario) {
  return [
    `Tu es un directeur de l'animation exigeant (studio de jeu de combat façon Smash Bros).`,
    `Scénario filmé : « ${scenario.name} »${scenario.player != null ? ` — joueur ${scenario.player}` : ''}${scenario.camera ? ` — caméra ${scenario.camera}` : ' — caméra réelle du jeu (non forcée)'}.`,
    scenario.note ? `Contexte du scénario : ${scenario.note}` : null,
    '',
    'Note chacun de ces 8 critères sur 10, avec le pire moment observé (temps en ms depuis le début de la vidéo) :',
    ...CRITERES_8.map(([cle, texte], i) => `${i + 1}. [${cle}] ${texte}`),
    '',
    'Garde aussi en tête les 12 principes classiques de l\'animation en les croisant avec ce que tu vois :',
    ...PRINCIPES_12.map((p, i) => `${i + 1}. ${p}`),
    '',
    'Exigence du studio : « des mouvements les plus naturels possibles, le bras qui bouge vraiment, un corps expressif',
    'qui s\'adapte à son environnement, rien de statique ». Sois impitoyable : un mouvement statique ou une trajectoire',
    'en ligne droite doit faire baisser la note du critère concerné.',
    '',
    'Réponds UNIQUEMENT avec le JSON contraint par le schéma fourni : scenario (reprends le nom donné ci-dessus),',
    'notes (les 8 clés ci-dessus, chacune sur 10), note (moyenne globale sur 10), et pires (2 à 5 pires instants,',
    'avec le temps en ms et le problème observé en une phrase).',
  ].filter(Boolean).join('\n');
}

const CLES_NOTES = CRITERES_8.map(([cle]) => cle);
const SCHEMA_REPONSE = {
  type: 'OBJECT',
  properties: {
    scenario: { type: 'STRING' },
    notes: {
      type: 'OBJECT',
      properties: Object.fromEntries(CLES_NOTES.map((cle) => [cle, { type: 'NUMBER' }])),
      required: CLES_NOTES,
    },
    note: { type: 'NUMBER' },
    pires: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { t: { type: 'NUMBER' }, probleme: { type: 'STRING' } },
        required: ['t', 'probleme'],
      },
    },
  },
  required: ['scenario', 'notes', 'note', 'pires'],
};

// ---- Scénarios (pour enrichir la grille avec joueur/caméra/note) : optionnel, jamais bloquant. ----
function chargerScenarios() {
  try { return JSON.parse(readFileSync('tools/anim/scenarios.json', 'utf8')); } catch { return []; }
}

function extraireJson(texte) {
  const nettoye = texte.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  return JSON.parse(nettoye);
}

async function jugerVideo(chemin, scenario) {
  const taille = statSync(chemin).size;
  if (taille > TAILLE_MAX) {
    return { scenario: scenario.name, erreur: `vidéo trop lourde pour l'envoi en ligne (${(taille / 1e6).toFixed(1)} Mo > 20 Mo)` };
  }
  const data = readFileSync(chemin).toString('base64');
  const corps = {
    contents: [{ parts: [{ inlineData: { mimeType: 'video/webm', data } }, { text: construireGrille(scenario) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA_REPONSE },
  };
  let reponse;
  try {
    reponse = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(corps),
    });
  } catch (e) {
    return { scenario: scenario.name, erreur: `requête impossible : ${e.message}` };
  }
  if (!reponse.ok) {
    const corpsErreur = await reponse.text().catch(() => '');
    return { scenario: scenario.name, erreur: `HTTP ${reponse.status} : ${corpsErreur.slice(0, 300)}` };
  }
  const enveloppe = await reponse.json().catch((e) => ({ erreurParsing: e.message }));
  const texte = enveloppe?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
  try {
    const verdict = extraireJson(texte);
    verdict.scenario = scenario.name; // on impose le vrai nom, au cas où le modèle l'aurait reformulé.
    return verdict;
  } catch (e) {
    return { scenario: scenario.name, erreur: `réponse Gemini illisible (${e.message}) : ${texte.slice(0, 300) || JSON.stringify(enveloppe).slice(0, 300)}` };
  }
}

async function main() {
  if (!existsSync(OUT_VIDEO)) {
    console.log(`Aucune vidéo dans ${OUT_VIDEO} : lance d'abord \`npm run anim\`.`);
    return;
  }
  const fichiers = readdirSync(OUT_VIDEO).filter((f) => f.endsWith('.webm')).sort();
  if (!fichiers.length) {
    console.log(`Aucune vidéo (.webm) dans ${OUT_VIDEO} : lance d'abord \`npm run anim\`.`);
    return;
  }
  const scenariosParNom = new Map(chargerScenarios().map((s) => [s.name, s]));

  console.log(`Juge Gemini (${MODELE}) sur ${fichiers.length} vidéo(s)…`);
  const verdicts = [];
  for (const fichier of fichiers) {
    const nom = fichier.replace(/\.webm$/, '');
    const scenario = scenariosParNom.get(nom) ?? { name: nom };
    process.stdout.write(`  ${nom}… `);
    // Séquentiel (pas Promise.all) : on évite de saturer l'API avec 14 vidéos en parallèle, et la console reste lisible.
    // eslint-disable-next-line no-await-in-loop
    const verdict = await jugerVideo(`${OUT_VIDEO}/${fichier}`, scenario);
    verdicts.push(verdict);
    console.log(verdict.erreur ? `échec (${verdict.erreur})` : `${verdict.note}/10`);
  }

  const notes = verdicts.map((v) => v.note).filter((n) => typeof n === 'number' && !Number.isNaN(n));
  const moyenne = notes.length ? +(notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(2) : null;

  writeFileSync(`${OUT}/gemini-verdict.json`, JSON.stringify({
    modele: MODELE,
    genereLe: new Date().toISOString(),
    moyenne,
    verdicts,
  }, null, 2));

  console.log(`\nMoyenne Gemini : ${moyenne ?? 'n/a'}/10 (${notes.length}/${verdicts.length} vidéos notées).`);
  console.log(`Détail : ${OUT}/gemini-verdict.json`);
}

try {
  await main();
} catch (e) {
  // Le juge Gemini ne doit jamais faire planter le banc d'évaluation : on log et on sort proprement.
  console.log(`Juge Gemini : échec inattendu (${e.message}).`);
  process.exit(0);
}
