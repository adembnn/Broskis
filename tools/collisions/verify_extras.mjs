// Verifie que les custom properties Blender (collider, source, ...) sont bien
// presentes comme `extras` dans le JSON du GLB exporte (export_extras=True).
import { readFileSync } from 'node:fs';

const path = process.argv[2] || '/tmp/collisions/colliders.glb';
const buf = readFileSync(path);

if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a glb');
const jsonLen = buf.readUInt32LE(12);
const jsonType = buf.toString('ascii', 16, 20);
if (jsonType !== 'JSON') throw new Error('first chunk not JSON: ' + jsonType);
const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

const nodesWithExtras = json.nodes.filter((n) => n.extras && Object.keys(n.extras).length > 0);
console.log(`fichier: ${path}`);
console.log(`nodes total: ${json.nodes.length}, nodes avec extras: ${nodesWithExtras.length}`);

const colliderNodes = nodesWithExtras.filter((n) => n.extras.collider);
console.log(`nodes avec extras.collider: ${colliderNodes.length}`);

const byType = {};
for (const n of colliderNodes) {
  byType[n.extras.collider] = (byType[n.extras.collider] || 0) + 1;
}
console.log('repartition:', byType);

console.log('\nexemples (5 premiers noeuds -col) :');
for (const n of colliderNodes.slice(0, 5)) {
  console.log(` - ${n.name}: ${JSON.stringify(n.extras)}`);
}

const deckNode = json.nodes.find((n) => n.name === 'ship-pirate-large-deck-col');
console.log('\nnode du pont isole :', deckNode ? JSON.stringify(deckNode.extras) : 'ABSENT');

if (colliderNodes.length === 0) {
  console.error('\nECHEC : aucun extras.collider trouve dans le GLB exporte.');
  process.exit(1);
} else {
  console.log(`\nOK : ${colliderNodes.length} colliders avec extras confirmes dans ${path}.`);
}
