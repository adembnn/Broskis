import { chromium } from 'playwright';
import path from 'path';
import { log } from '../dashboard/log.mjs';

const nom = process.argv[2];

async function main() {
  console.log(`Lancement du contrôle pour ${nom}...`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Le serveur Vite doit tourner (ou on peut utiliser un file:// absolu, mais le prompt dit "servie par Vite").
  // Si le build tourne, on assume http://localhost:5173
  const url = `http://localhost:5173/tools/vedettes/preview.html?nom=${nom}`;
  
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
  } catch (err) {
    console.error(`Impossible de joindre le serveur Vite sur ${url}. Assurez-vous que npm run dev tourne.`);
    process.exit(1);
  }

  // Attendre que le GLB soit chargé
  await page.waitForSelector('#ready', { timeout: 15000 });

  const errorEl = await page.$('#error');
  if (errorEl) {
    const errText = await errorEl.textContent();
    if (errText) {
      console.error(`Erreur de validation: ${errText}`);
      process.exit(1);
    }
  }

  // Prendre une capture
  const screenshotPath = path.join('captures', 'vedettes', `${nom}-planche.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await browser.close();
  
  log({ source: 'blender', kind: 'generation', title: `Contrôle validé pour ${nom}` });
  console.log(`Planche de contrôle générée dans ${screenshotPath}`);
}

main().catch(console.error);
