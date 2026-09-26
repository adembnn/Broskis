// Veille du dépôt distant : interroge GitHub toutes les 45 s et s'arrête dès qu'un nouveau commit arrive sur origin/main,
// pour que la session Claude l'intègre tout de suite (puis relance la veille). Journalise dans le tableau de bord.
import { execSync } from 'node:child_process';
import { log } from './dashboard/log.mjs';

const git = (c) => { try { return execSync(`git ${c}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const depart = git('rev-parse origin/main');
const fin = Date.now() + 55 * 60 * 1000; // au plus 55 min, ensuite on rend la main quand même

while (Date.now() < fin) {
  await new Promise((r) => setTimeout(r, 45000));
  try { git('fetch -q origin'); } catch { continue; }
  const maintenant = git('rev-parse origin/main');
  if (maintenant && maintenant !== depart) {
    const nouveaux = git(`log --format=%h|%an|%s ${depart}..${maintenant}`)
      .split('\n').filter((l) => l && !l.split('|')[1].startsWith('adembnn')).join('\n');
    if (!nouveaux) continue; // seulement mes propres commits : rien à intégrer
    for (const ligne of nouveaux.split('\n').filter(Boolean)) {
      const [h, auteur, sujet] = ligne.split('|');
      log({ source: auteur === 'LaRacine23' ? 'humain' : 'git', kind: 'commit', status: 'info', title: `Nouveau commit de ${auteur === 'LaRacine23' ? 'Titouan' : auteur} : ${sujet}`, hash: h });
    }
    console.log(`NOUVEAUX COMMITS sur origin/main :\n${nouveaux}`);
    process.exit(0);
  }
}
console.log('Aucun nouveau commit en 55 min.');
