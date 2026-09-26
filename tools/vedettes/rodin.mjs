import fs from 'fs';
import path from 'path';
import { log } from '../dashboard/log.mjs';

const nom = process.argv[2];
const workDir = path.join('tools', 'vedettes', 'work', nom);
const frontPath = path.join(workDir, 'front.png');
const backPath = path.join(workDir, 'back.png');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tryMainSite() {
  log({ source: 'rodin', kind: 'generation', title: `Démarrage Hyper3D Rodin (Main Site)` });
  
  const formData = new FormData();
  const frontBuffer = fs.readFileSync(frontPath);
  const backBuffer = fs.readFileSync(backPath);
  
  formData.append('images', new Blob([frontBuffer]), '0000.png');
  formData.append('images', new Blob([backBuffer]), '0001.png');
  formData.append('tier', 'Sketch');
  formData.append('mesh_mode', 'Raw');
  formData.append('texture_mode', 'high');

  const createRes = await fetch('https://hyperhuman.deemos.com/api/v2/rodin', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer vibecoding' },
    body: formData
  });

  if (!createRes.ok) {
    throw new Error(`Rodin Main Site failed to create job: ${createRes.status} ${await createRes.text()}`);
  }

  const jobData = await createRes.json();
  const subKey = jobData.subscription_key;
  const uuid = jobData.uuid;

  if (!subKey || !uuid) {
    throw new Error('Invalid response from Rodin main site');
  }

  console.log(`Tâche créée, uuid: ${uuid}. Attente...`);

  // Polling
  while (true) {
    await delay(3000);
    const statusRes = await fetch('https://hyperhuman.deemos.com/api/v2/status', {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer vibecoding',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ subscription_key: subKey })
    });

    if (!statusRes.ok) throw new Error('Erreur API status');
    
    const statusData = await statusRes.json();
    const statuses = statusData.jobs.map(j => j.status);
    
    if (statuses.some(s => s === 'failed')) {
      throw new Error('La génération a échoué (failed)');
    }
    
    if (statuses.every(s => s === 'succeed')) {
      break;
    }
    process.stdout.write('.');
  }

  console.log('\nGénération terminée. Téléchargement...');

  const dlRes = await fetch('https://hyperhuman.deemos.com/api/v2/download', {
    method: 'POST',
    headers: { 
      'Authorization': 'Bearer vibecoding',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ task_uuid: uuid })
  });

  if (!dlRes.ok) throw new Error('Erreur API download');
  
  const dlData = await dlRes.json();
  const glbUrl = dlData.list.find(i => i.name.endsWith('.glb'))?.url;
  
  if (!glbUrl) throw new Error('Aucun GLB dans la réponse de téléchargement');

  const glbRes = await fetch(glbUrl);
  const glbBuffer = await glbRes.arrayBuffer();
  fs.writeFileSync(path.join(workDir, 'rodin.glb'), Buffer.from(glbBuffer));
  
  log({ source: 'rodin', kind: 'generation', title: `Modèle 3D prêt (Main Site)` });
  return true;
}

async function tryFalAi() {
  log({ source: 'rodin', kind: 'generation', title: `Démarrage Hyper3D Rodin (Hunyuan3D/Fal.ai)` });
  
  const b64Front = fs.readFileSync(frontPath).toString('base64');
  const b64Back = fs.readFileSync(backPath).toString('base64');
  
  const reqData = {
    tier: 'Sketch',
    input_image_urls: [
      `data:image/png;base64,${b64Front}`,
      `data:image/png;base64,${b64Back}`
    ]
  };

  const createRes = await fetch('https://queue.fal.run/fal-ai/hyper3d/rodin', {
    method: 'POST',
    headers: {
      'Authorization': 'Key vibecoding',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(reqData)
  });

  if (!createRes.ok) {
    throw new Error(`Fal.ai failed to create job: ${createRes.status} ${await createRes.text()}`);
  }

  const jobData = await createRes.json();
  const requestId = jobData.request_id;

  console.log(`Tâche fal.ai créée, requestId: ${requestId}. Attente...`);

  // Polling
  while (true) {
    await delay(3000);
    const statusRes = await fetch(`https://queue.fal.run/fal-ai/hyper3d/requests/${requestId}/status`, {
      headers: { 'Authorization': 'Key vibecoding' }
    });

    if (!statusRes.ok) throw new Error('Erreur API status fal.ai');
    
    const statusData = await statusRes.json();
    const status = statusData.status;
    
    if (status === 'IN_QUEUE' || status === 'IN_PROGRESS') {
      process.stdout.write('.');
      continue;
    }
    
    if (status === 'COMPLETED') {
      break;
    }
    
    throw new Error(`Statut inattendu: ${status}`);
  }

  console.log('\nGénération terminée. Téléchargement...');

  const resultRes = await fetch(`https://queue.fal.run/fal-ai/hyper3d/requests/${requestId}`, {
    headers: { 'Authorization': 'Key vibecoding' }
  });

  if (!resultRes.ok) throw new Error('Erreur API download fal.ai');
  
  const resultData = await resultRes.json();
  const glbUrl = resultData.model_mesh.url;
  
  const glbRes = await fetch(glbUrl);
  const glbBuffer = await glbRes.arrayBuffer();
  fs.writeFileSync(path.join(workDir, 'rodin.glb'), Buffer.from(glbBuffer));
  
  log({ source: 'rodin', kind: 'generation', title: `Modèle 3D prêt (Fal.ai)` });
  return true;
}

async function main() {
  try {
    await tryMainSite();
  } catch (err) {
    console.warn(`\nÉchec de la méthode principale (${err.message}), passage au fallback Fal.ai...`);
    try {
      await tryFalAi();
    } catch (err2) {
      console.error('\n[Rodin/Fal.ai] L\'essai gratuit est saturé ou la clé est invalide.');
      console.error('Arrêt propre de la génération 3D.');
      process.exit(1);
    }
  }
}

main().catch(console.error);
