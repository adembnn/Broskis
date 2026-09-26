#!/usr/bin/env node
// Décompresse un GLB utilisant EXT_meshopt_compression (et retire EXT_texture_webp /
// matériaux, inutiles pour la génération de colliders) afin que le glTF importer de
// Blender (bpy pip, sans les extensions meshopt/webp) puisse le lire.
// Usage: node decompress_glb.cjs <in.glb> <out.glb>
const fs = require('fs');
const path = require('path');

const MeshoptDecoder = require('/home/user/Voodoo-Hack/node_modules/meshoptimizer/meshopt_decoder.cjs');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node decompress_glb.cjs <in.glb> <out.glb>');
  process.exit(1);
}

function readGlb(p) {
  const buf = fs.readFileSync(p);
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'glTF') throw new Error('not a GLB: ' + p);
  const version = buf.readUInt32LE(4);
  const length = buf.readUInt32LE(8);
  let offset = 12;
  const chunkLen0 = buf.readUInt32LE(offset); offset += 4;
  const chunkType0 = buf.toString('ascii', offset, offset + 4); offset += 4;
  if (chunkType0 !== 'JSON') throw new Error('first chunk not JSON');
  const jsonBuf = buf.subarray(offset, offset + chunkLen0); offset += chunkLen0;
  const json = JSON.parse(jsonBuf.toString('utf8'));
  let bin = null;
  if (offset < buf.length) {
    const chunkLen1 = buf.readUInt32LE(offset); offset += 4;
    const chunkType1 = buf.toString('ascii', offset, offset + 4); offset += 4;
    if (chunkType1 === 'BIN\0') {
      bin = buf.subarray(offset, offset + chunkLen1);
    }
  }
  return { json, bin };
}

function writeGlb(p, json, binParts) {
  const jsonStr = JSON.stringify(json);
  let jsonBuf = Buffer.from(jsonStr, 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  let binBuf = Buffer.concat(binParts);
  const binPad = (4 - (binBuf.length % 4)) % 4;
  if (binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, 0x00)]);

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.write('JSON', 4, 'ascii');

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuf.length, 0);
  binChunkHeader.write('BIN\0', 4, 'ascii');

  fs.writeFileSync(p, Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBuf]));
}

async function main() {
  const t0 = Date.now();
  const { json, bin } = readGlb(inPath);

  const usesMeshopt = (json.extensionsUsed || []).includes('EXT_meshopt_compression');
  if (usesMeshopt) {
    await MeshoptDecoder.ready;
  }

  const newParts = [];
  let runningOffset = 0;
  const newBufferViews = [];

  for (const bv of json.bufferViews) {
    let bytes;
    const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
    if (ext) {
      // La source compressée vit dans buffers[ext.buffer] (le vrai chunk BIN du GLB),
      // PAS dans buffers[bv.buffer] (le buffer "fallback" factice, souvent sans données réelles).
      if (ext.buffer !== 0) throw new Error('unexpected meshopt source buffer index ' + ext.buffer);
      const source = bin.subarray(ext.byteOffset || 0, (ext.byteOffset || 0) + ext.byteLength);
      const count = ext.count;
      const stride = ext.byteStride;
      const target = new Uint8Array(count * stride);
      MeshoptDecoder.decodeGltfBuffer(target, count, stride, source, ext.mode, ext.filter || 'NONE');
      bytes = Buffer.from(target.buffer, target.byteOffset, target.byteLength);
    } else {
      if (bv.buffer !== 0) throw new Error('unexpected plain bufferView buffer index ' + bv.buffer);
      bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    }

    // Alignement 4 octets par bufferView (bonne pratique glTF).
    const pad = (4 - (runningOffset % 4)) % 4;
    if (pad) {
      newParts.push(Buffer.alloc(pad, 0));
      runningOffset += pad;
    }

    const newBv = { buffer: 0, byteOffset: runningOffset, byteLength: bytes.length };
    if (bv.byteStride) newBv.byteStride = bv.byteStride;
    if (bv.target) newBv.target = bv.target;
    if (bv.name) newBv.name = bv.name;
    newBufferViews.push(newBv);

    newParts.push(Buffer.from(bytes));
    runningOffset += bytes.length;
  }

  json.bufferViews = newBufferViews;
  json.buffers = [{ byteLength: runningOffset }];

  // Textures/matériaux/images : inutiles pour générer des colliders, et EXT_texture_webp
  // n'est de toute façon pas supporté par l'addon glTF de bpy. On les retire entièrement.
  delete json.materials;
  delete json.textures;
  delete json.images;
  delete json.samplers;
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      delete prim.material;
    }
  }

  const dropExt = new Set(['EXT_meshopt_compression', 'EXT_texture_webp', 'KHR_texture_transform', 'EXT_mesh_gpu_instancing']);
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (json[key]) {
      json[key] = json[key].filter((e) => !dropExt.has(e));
      if (json[key].length === 0) delete json[key];
    }
  }
  if (json.extensions) {
    for (const e of dropExt) delete json.extensions[e];
  }

  writeGlb(outPath, json, newParts);

  const inSize = fs.statSync(inPath).size;
  const outSize = fs.statSync(outPath).size;
  console.log(`OK ${path.basename(inPath)} -> ${path.basename(outPath)}`);
  console.log(`  meshopt decoded: ${usesMeshopt}`);
  console.log(`  taille: ${inSize} -> ${outSize} octets`);
  console.log(`  temps: ${Date.now() - t0} ms`);
}

main().catch((e) => { console.error(e); process.exit(1); });
