// Page de rapport du banc de scan (lot LBENCH) : une seule page HTML autonome (images WebP intégrées), en français,
// publiable telle quelle. Aucune photo d'origine (elles montrent la main d'Adem) : seulement ce que le jeu produit.
import { writeFileSync } from 'node:fs';

const STATS_FR = {
  blaster: ['puissance', 'tirs', 'précision'],
  grenade: ['puissance', 'rayon', 'rebond'],
  throwable: ['puissance', 'vitesse', 'recul'],
  shield: ['garde', 'taille', 'renvoi'],
};
const CATEGORIE_FR = { blaster: 'blaster (tir rapide)', grenade: 'grenade (rebondit, explose)', throwable: 'lancer lourd', shield: 'bouclier' };
const CRITERES = [
  ['reconnaissable', 'Reconnaissable'],
  ['style', 'Style KayKit'],
  ['detourage', 'Détourage'],
  ['jouable', 'Jouable'],
  ['physique', 'Physique'],
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fr = (n, d = 1) => (typeof n === 'number' ? n.toFixed(d).replace('.', ',') : '—');
const sec = (ms) => (typeof ms === 'number' ? `${fr(ms / 1000, 1)} s` : '—');
const niveau = (n) => (typeof n !== 'number' ? 'nul' : n >= 8 ? 'bon' : n >= 6 ? 'moyen' : 'faible');
const val = (v) => (typeof v === 'boolean' ? (v ? 'oui' : 'non') : typeof v === 'number' ? fr(v, v < 1 ? 3 : 2) : esc(v));

function img(src, alt, classe = '') {
  return src ? `<figure class="${classe}"><img src="${src}" alt="${esc(alt)}" loading="lazy"><figcaption>${esc(alt)}</figcaption></figure>`
    : `<figure class="${classe} vide"><div>pas d'image</div><figcaption>${esc(alt)}</figcaption></figure>`;
}

function carteObjet(o) {
  const s = o.scan;
  const j = o.juge && !o.juge.erreur ? o.juge : null;
  const noms = STATS_FR[s?.category] ?? ['a', 'b', 'c'];
  const reglesPhys = o.regles.filter((r) => r.groupe === 'physique');
  const reglesImg = o.regles.filter((r) => r.groupe === 'image');
  const ligne = (r) => `<tr class="${r.ok ? 'ok' : 'ko'}"><td>${esc(r.libelle)}</td><td>${val(r.trouve)}</td><td>${esc(r.attendu)}</td><td class="etat">${r.ok ? '✓' : '✗'}</td></tr>`;
  const t = o.reglages;
  return `
<section class="objet" id="${esc(o.id)}">
  <header>
    <div>
      <h2>${esc(o.attendu.objet)}</h2>
      <p class="sous">${s ? `Le jeu y voit : <b>${esc(s.object)}</b> → « ${esc(s.weaponName)} », ${esc(CATEGORIE_FR[s.category] ?? s.category)}, trait ${esc(s.trait)}` : `<span class="alerte">Scan en échec : ${esc(o.erreurScan)}</span>`}</p>
    </div>
    <div class="note ${niveau(o.note)}"><span>${fr(o.note)}</span><small>/10</small>${o.injouable ? '<em>injouable</em>' : ''}</div>
  </header>
  <div class="galerie">
    ${img(o.images?.detoure, 'Sticker détouré (damier = transparent)', 'carre')}
    ${img(o.images?.face, 'Objet 3D, face', 'carre')}
    ${img(o.images?.troisQuarts, 'Trois-quarts', 'carre')}
    ${img(o.images?.profil, 'Profil (épaisseur)', 'carre')}
  </div>
  <div class="galerie large">
    ${img(o.images?.perso, `Taille réelle à côté du perso (${o.scan?.physics ? `${fr(Math.max(...o.scan.physics.sizeM), 2)} m` : 'taille inconnue : 0,5 m en main'})`)}
    ${img(o.images?.vol, 'En vol, vu de l’épaule du lanceur')}
  </div>
  <div class="colonnes">
    <div>
      <h3>Physique trouvée / attendue</h3>
      <table><thead><tr><th>Critère</th><th>Trouvé</th><th>Attendu</th><th></th></tr></thead><tbody>${reglesPhys.map(ligne).join('')}</tbody></table>
      <h3>Image</h3>
      <table><tbody>${reglesImg.map(ligne).join('')}</tbody></table>
      ${o.stickerRaison ? `<p class="alerte">Pas de sticker : ${o.stickerRaison === 'error' && o.temps.sticker > 24_000 ? `délai de 25 s du serveur dépassé (${sec(o.temps.sticker)}) ; le jeu montre alors une forme de secours` : esc(o.stickerRaison)}</p>` : ''}
    </div>
    <div>
      <h3>Stats dérivées</h3>
      ${s ? `<p class="stats">${noms.map((n, i) => `<span><b>${esc(n)}</b> ${s.stats?.[['a', 'b', 'c'][i]] ?? '—'}</span>`).join('')}</p>` : '<p>—</p>'}
      ${t ? `<p class="stats petit"><span>dégâts ×${fr(t.damage, 2)}</span><span>recul ×${fr(t.knockback, 2)}</span><span>vitesse ×${fr(t.speed, 2)}</span><span>portée ×${fr(t.range, 2)}</span><span>recharge ${fr(t.cooldownS, 1)} s</span><span>rebond ${fr(t.bounce, 2)}</span>${t.shatterRadiusM ? `<span>éclats ${fr(t.shatterRadiusM, 1)} m</span>` : ''}${t.splash ? '<span>giclée</span>' : ''}<span>vol : ${esc(t.spin)}</span></p>` : '<p class="discret">Réglages de jeu : en attente de src/ia/physics.ts (lot LSCAN).</p>'}
      <h3>Juge (Gemini 3.1 Pro)</h3>
      ${j ? `
      <div class="criteres">${CRITERES.map(([k, l]) => `<div class="${niveau(o.criteres?.[k])}"><small>${l}</small><b>${fr(o.criteres?.[k])}</b></div>`).join('')}</div>
      <p><b>Il voit :</b> ${esc(j.objetVu)} · <b>note du juge :</b> ${fr(j.note)}/10</p>
      <p>${esc(j.justification)}</p>
      ${j.defauts?.length ? `<ul>${j.defauts.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
      <p class="piste"><b>Piste :</b> ${esc(j.piste)}</p>` : `<p class="alerte">${o.juge?.erreur ? `Juge en échec : ${esc(o.juge.erreur)}` : 'Pas de juge sur ce passage.'}</p>`}
      <h3>Temps</h3>
      <p class="stats petit"><span>réduction ${sec(o.temps.redim)}</span><span>stats ${sec(o.temps.scan)}</span><span>sticker ${sec(o.temps.sticker)}</span><span>extrusion ${sec(o.temps.extrusion)}</span><span>rendu du banc ${sec(o.temps.rendu3d)}</span><span>juge ${sec(o.temps.juge)}</span></p>
    </div>
  </div>
</section>`;
}

function tableJournal(journal, objets) {
  const its = journal.iterations;
  if (!its.length) return '<p class="discret">Premier passage partiel : pas encore de journal.</p>';
  const ids = objets.map((o) => o.id);
  const tete = its.map((it) => `<th title="${esc(it.horodatage)}">n° ${it.n}${it.reprise ? '*' : ''}</th>`).join('');
  const lignes = ids.map((id) => `<tr><td>${esc(id)}</td>${its.map((it) => `<td class="${niveau(it.notes[id])}">${fr(it.notes[id])}</td>`).join('')}</tr>`).join('');
  const moy = `<tr class="moy"><td>Moyenne</td>${its.map((it) => `<td class="${niveau(it.moyenne)}">${fr(it.moyenne, 2)}</td>`).join('')}</tr>`;
  const inj = `<tr><td>Injouables</td>${its.map((it) => `<td>${it.injouables}</td>`).join('')}</tr>`;
  const changements = its.map((it) => `<li><b>n° ${it.n}</b> (${esc(it.horodatage.replace('_', ' '))}) — ${esc(it.changement || 'référence')} → ${fr(it.moyenne, 2)}/10</li>`).join('');
  return `<div class="defile"><table class="journal"><thead><tr><th>Objet</th>${tete}</tr></thead><tbody>${lignes}${moy}${inj}</tbody></table></div>
  <ol class="changements">${changements}</ol><p class="discret">* passage qui réutilise les réponses API précédentes (seul le rendu a changé).</p>`;
}

export function ecrireRapport(chemin, resume, objets, journal) {
  const atteint = typeof resume.moyenne === 'number' && resume.moyenne >= 8 && resume.injouables.length === 0;
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Banc de scan</title>
<style>
:root {
  --fond: #f6f3ee; --carte: #ffffff; --texte: #1f1b16; --doux: #6b645b; --trait: #e3ddd3;
  --bon: #1f7a3a; --bon-fond: #e3f4e7; --moyen: #8a5a00; --moyen-fond: #fbefd5; --faible: #b3261e; --faible-fond: #fbe4e2;
  --accent: #3d5afe;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --fond: #16140f; --carte: #211e18; --texte: #f1ece4; --doux: #a89f93; --trait: #37322a;
    --bon: #6fd28b; --bon-fond: #173522; --moyen: #f2c063; --moyen-fond: #3a2c10; --faible: #ff8a80; --faible-fond: #3d1714;
    --accent: #8c9eff;
  }
}
:root[data-theme="dark"] {
  --fond: #16140f; --carte: #211e18; --texte: #f1ece4; --doux: #a89f93; --trait: #37322a;
  --bon: #6fd28b; --bon-fond: #173522; --moyen: #f2c063; --moyen-fond: #3a2c10; --faible: #ff8a80; --faible-fond: #3d1714;
  --accent: #8c9eff;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--fond); color: var(--texte); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1180px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; }
h2 { font-size: 20px; margin: 0; }
h3 { font-size: 14px; text-transform: uppercase; letter-spacing: .04em; color: var(--doux); margin: 18px 0 6px; }
.sous, .discret { color: var(--doux); margin: 4px 0 0; }
.bandeau { display: flex; flex-wrap: wrap; gap: 12px; margin: 18px 0 8px; }
.tuile { background: var(--carte); border: 1px solid var(--trait); border-radius: 12px; padding: 12px 16px; min-width: 150px; }
.tuile b { display: block; font-size: 26px; }
.tuile small { color: var(--doux); }
.objectif { font-weight: 600; }
.objectif.ok { color: var(--bon); } .objectif.ko { color: var(--faible); }
.objet { background: var(--carte); border: 1px solid var(--trait); border-radius: 16px; padding: 16px; margin: 24px 0; }
.objet > header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.note { text-align: center; border-radius: 12px; padding: 6px 12px; min-width: 84px; }
.note span { font-size: 30px; font-weight: 700; } .note small { color: inherit; opacity: .7; }
.note em { display: block; font-style: normal; font-size: 12px; font-weight: 700; text-transform: uppercase; }
.bon { background: var(--bon-fond); color: var(--bon); } .moyen { background: var(--moyen-fond); color: var(--moyen); }
.faible { background: var(--faible-fond); color: var(--faible); } .nul { color: var(--doux); }
.galerie { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
.galerie.large { grid-template-columns: 4fr 5fr; }
figure { margin: 0; }
figure img { width: 100%; height: auto; display: block; border-radius: 8px; background: #2a2a2a; }
figure.vide div { aspect-ratio: 1; display: grid; place-items: center; border-radius: 8px; background: var(--fond); color: var(--doux); }
figcaption { font-size: 12px; color: var(--doux); margin-top: 2px; }
.colonnes { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--trait); }
tr.ok td.etat { color: var(--bon); font-weight: 700; } tr.ko td { color: var(--faible); } tr.ko td.etat { font-weight: 700; }
.stats { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.stats span { background: var(--fond); border: 1px solid var(--trait); border-radius: 999px; padding: 2px 10px; }
.stats.petit span { font-size: 13px; }
.criteres { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.criteres div { border-radius: 8px; padding: 6px; text-align: center; }
.criteres small { display: block; font-size: 11px; } .criteres b { font-size: 18px; }
.piste { border-left: 3px solid var(--accent); padding-left: 10px; }
.alerte { color: var(--faible); }
.defile { overflow-x: auto; }
.journal td, .journal th { text-align: center; white-space: nowrap; } .journal td:first-child, .journal th:first-child { text-align: left; }
.journal tr.moy td { font-weight: 700; }
.changements { padding-left: 20px; }
.methode { color: var(--doux); font-size: 14px; }
@media (max-width: 760px) {
  .galerie { grid-template-columns: repeat(2, 1fr); }
  .galerie.large, .colonnes { grid-template-columns: 1fr; }
  .criteres { grid-template-columns: repeat(3, 1fr); }
}
</style>
</head>
<body>
<main>
  <h1>Banc de scan des objets</h1>
  <p class="sous">« Snap any real object: it becomes your weapon. » ${objets.length} photos réelles prises par Adem, passées dans le vrai pipeline du jeu (stats et physique par Gemini, sticker par Nano Banana, détourage et objet 3D par le code du jeu), puis notées. Passage du ${esc(resume.horodatage.replace('_', ' à '))}${resume.iteration ? `, itération n° ${resume.iteration}` : ' (partiel)'}${resume.reprise ? ', réponses API réutilisées' : ''}.</p>
  <div class="bandeau">
    <div class="tuile ${niveau(resume.moyenne)}"><small>Note moyenne</small><b>${fr(resume.moyenne, 2)} / 10</b></div>
    <div class="tuile"><small>Objets injouables</small><b>${resume.injouables.length}</b>${resume.injouables.length ? `<small>${esc(resume.injouables.join(', '))}</small>` : ''}</div>
    <div class="tuile"><small>Objectif</small><b class="objectif ${atteint ? 'ok' : 'ko'}">${atteint ? 'atteint' : 'pas encore'}</b><small>moyenne ≥ 8 et 0 injouable</small></div>
  </div>
  <h3>Journal des itérations</h3>
  ${tableJournal(journal, objets)}
  ${objets.map(carteObjet).join('\n')}
  <h3>Méthode</h3>
  <p class="methode">Chaque photo est réduite à 768 px comme dans le jeu, puis envoyée aux vraies API du jeu : <code>/api/scan-object</code> (Gemini, catégorie, stats et physique) et <code>/api/sticker</code> (Nano Banana, sticker sur fond magenta), en parallèle. Le sticker est détouré et extrudé par le code du jeu (<code>src/scene/sticker</code>), puis rendu à côté d'un chevalier KayKit du jeu. Note d'un objet = moyenne de 5 critères : 4 notes du juge Gemini 3.1 Pro en vision (reconnaissable, style KayKit, détourage, jouable) et la physique (part des 7 vérifications réussies contre la vérité terrain, catégorie comprise, ramenée sur 10). Le détourage est plafonné à 5 si le code mesure plus de ${3} % de pixels roses au bord ; un objet sans sticker est plafonné à 3 et compté injouable, comme un objet que le juge juge injouable ou dont la note « jouable » est sous 5. Les photos d'origine ne sont jamais affichées.</p>
</main>
</body>
</html>
`;
  writeFileSync(chemin, html);
}
