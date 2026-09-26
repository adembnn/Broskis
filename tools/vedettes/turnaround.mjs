import fs from 'fs';
import path from 'path';
import { log } from '../dashboard/log.mjs';
import { chromium } from 'playwright';

// Parsing manuel de .env
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}

const photo = process.argv[2];
const nom = process.argv[3];
const inputPath = path.join('tools', 'vedettes', 'input', photo);
const workDir = path.join('tools', 'vedettes', 'work', nom);

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY introuvable dans .env');
    process.exit(1);
  }

  const mimeType = photo.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const imgData = fs.readFileSync(inputPath).toString('base64');

  log({ source: 'gemini', kind: 'generation', title: `Génération T-pose pour ${nom}` });

  const payload = {
    contents: [
      {
        parts: [
          { text: "Create a turnaround sheet (front view and back view side-by-side) of this person as a 3D game character. Style: game proportions (big head, stocky body, #2B1D14 contour, flat cartoon colors). Strict T-pose (arms stretched horizontally, legs slightly apart). Light gray solid background." },
          { inlineData: { mimeType, data: imgData } }
        ]
      }
    ]
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=${apiKey}`;
  
  console.log('Appel de l\'API Gemini...');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Erreur API Gemini:', err);
    log({ source: 'gemini', kind: 'generation', title: `Erreur Gemini: ${response.status}` });
    process.exit(1);
  }

  const data = await response.json();
  let base64Image = '';
  
  try {
    base64Image = data.candidates[0].content.parts[0].inlineData.data;
  } catch (e) {
    console.error('Format inattendu de Gemini:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const fullImagePath = path.join(workDir, 'turnaround.png');
  fs.writeFileSync(fullImagePath, Buffer.from(base64Image, 'base64'));

  // Découpage en 2 images via Playwright
  console.log('Découpage de l\'image avec Playwright...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const b64Src = `data:image/jpeg;base64,${base64Image}`;
  await page.setContent(`
    <html>
      <body style="margin:0; padding:0; background: #fff;">
        <img id="img" src="${b64Src}" style="display:none;" />
        <canvas id="front"></canvas>
        <canvas id="back"></canvas>
      </body>
    </html>
  `);

  const [frontData, backData] = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const img = document.getElementById('img');
      
      const processImg = () => {
        const w = img.width || img.naturalWidth;
        const h = img.height || img.naturalHeight;
        const half = w / 2;
        
        const cf = document.getElementById('front');
        cf.width = half;
        cf.height = h;
        const ctxF = cf.getContext('2d');
        ctxF.fillStyle = '#d3d3d3';
        ctxF.fillRect(0, 0, half, h);
        ctxF.drawImage(img, 0, 0, half, h, 0, 0, half, h);
        
        const cb = document.getElementById('back');
        cb.width = half;
        cb.height = h;
        const ctxB = cb.getContext('2d');
        ctxB.fillStyle = '#d3d3d3';
        ctxB.fillRect(0, 0, half, h);
        ctxB.drawImage(img, half, 0, half, h, 0, 0, half, h);
        
        resolve([
          cf.toDataURL('image/png').split(',')[1],
          cb.toDataURL('image/png').split(',')[1]
        ]);
      };

      if (img.complete) {
        processImg();
      } else {
        img.onload = processImg;
      }
    });
  });

  await browser.close();

  fs.writeFileSync(path.join(workDir, 'front.png'), Buffer.from(frontData, 'base64'));
  fs.writeFileSync(path.join(workDir, 'back.png'), Buffer.from(backData, 'base64'));

  log({ source: 'gemini', kind: 'generation', title: `T-pose générée et découpée pour ${nom}` });
}

main().catch(console.error);
