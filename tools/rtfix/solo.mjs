// RTFIX : en solo (vs IA), les deux jeux de touches pilotent P1 et le clavier ne pilote jamais le bot (P2).
// `node tools/rtfix/solo.mjs` (Vite du dépôt sur 5365). Vrais événements clavier (page.keyboard).
// Avant : flèches / L / Maj droite pilotaient P2 (le bot) ; P1 ne répondait qu'à ZQSD / F / ESPACE.
import { attendre, journal, ouvrir } from './harnais.mjs';

const { page, errors, fermer } = await ouvrir();
const J = journal();

async function match(vsAI) {
  await page.evaluate((v) => window.gameHooks.startMatch({ map: 'archipel', vsAI: v, split: !v, seed: 7, stocks: 3 }), vsAI);
  await page.waitForFunction(() => window.gameState.phase === 'fight', null, { timeout: 90000 });
  await attendre(page, 200);
}

/** Maintient `key` 450 ms ; renvoie le déplacement horizontal de chaque joueur pendant ce temps. */
async function tenir(key) {
  const avant = await page.evaluate(() => window.ctx.state.players.map((p) => p.pos.slice()));
  await page.keyboard.down(key);
  await attendre(page, 450);
  await page.keyboard.up(key);
  const apres = await page.evaluate(() => window.ctx.state.players.map((p) => p.pos.slice()));
  return [0, 1].map((i) => Math.hypot(apres[i][0] - avant[i][0], apres[i][2] - avant[i][2]));
}

/** Appuie sur `key` ; renvoie les joueurs qui ont tiré (événement `fire`) dans les 600 ms. */
async function tir(key) {
  await page.evaluate(() => { window.__tirs = []; window.ctx.bus.on('fire', (e) => window.__tirs.push(e.player)); });
  await page.keyboard.down(key);
  await attendre(page, 120);
  await page.keyboard.up(key);
  await attendre(page, 500);
  return page.evaluate(() => [...new Set(window.__tirs)]);
}

try {
  // Duo : les flèches pilotent P2 (référence).
  await match(false);
  const duo = await tenir('ArrowUp');
  J.ok('duo : les flèches pilotent P2, pas P1', duo[1] > 0.8 && duo[0] < 0.05, `P1 ${duo[0].toFixed(2)} m, P2 ${duo[1].toFixed(2)} m`);

  // Solo : bot coupé pendant la mesure (sinon il bouge P2 lui-même) ; les flèches et L pilotent P1.
  await match(true);
  await page.evaluate(() => { window.ctx.state.vsAI = true; });
  const fleches = await tenir('ArrowUp');
  J.ok('solo : les flèches pilotent P1', fleches[0] > 0.8, `P1 ${fleches[0].toFixed(2)} m`);
  const zqsd = await tenir('KeyW');
  J.ok('solo : ZQSD pilote toujours P1', zqsd[0] > 0.8, `P1 ${zqsd[0].toFixed(2)} m`);
  const tireurs = await tir('KeyL');
  J.ok('solo : L fait tirer P1', tireurs.includes(0), `tireurs : [${tireurs}]`);
  // Maj droite (saut de P2 en duo) : c'est P1 qui saute, jamais le bot (fenêtre de 150 ms après l'appui).
  // Nouveau match : P1 au sol, sans éjection en cours.
  await match(true);
  await page.evaluate(() => { window.__sauts = []; window.ctx.bus.on('move:jump', (e) => window.__sauts.push(e.player)); });
  await page.keyboard.down('ShiftRight');
  await attendre(page, 150);
  await page.keyboard.up('ShiftRight');
  const sauts = await page.evaluate(() => window.__sauts.slice());
  J.ok('solo : Maj droite fait sauter P1, pas le bot', sauts.includes(0) && !sauts.includes(1), `sauts : [${sauts}]`);
} catch (e) {
  J.ok('script', false, String(e));
} finally {
  await fermer();
}
process.exit(J.fin(errors));
