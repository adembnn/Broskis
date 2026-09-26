// Statistiques d'un GLB sans dépendance : Ko, triangles (par nœud instancié), sommets, textures (nombre et
// taille max), matières, extensions. Sert à optimise.mjs et build-kit.mjs.
// Usage direct : node tools/assets/glb-stats.mjs fichier.glb [...]
import { readFileSync } from 'node:fs';

function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)]; // PNG
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) { // JPEG : premier marqueur SOFn
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  }
  return null;
}

export function glbStats(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} : pas un GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const acc = json.accessors ?? [];
  const meshTris = (json.meshes ?? []).map((m) => m.primitives.reduce((s, p) => {
    if (p.mode !== undefined && p.mode !== 4) return s;
    const n = p.indices !== undefined ? acc[p.indices].count : acc[p.attributes.POSITION].count;
    return s + n / 3;
  }, 0));
  const meshVerts = (json.meshes ?? []).map((m) => m.primitives.reduce((s, p) => s + acc[p.attributes.POSITION].count, 0));
  let tris = 0; let verts = 0; let drawn = 0;
  for (const n of json.nodes ?? []) {
    if (n.mesh === undefined) continue;
    const inst = n.extensions?.EXT_mesh_gpu_instancing ? acc[Object.values(n.extensions.EXT_mesh_gpu_instancing.attributes)[0]].count : 1;
    tris += meshTris[n.mesh] * inst; verts += meshVerts[n.mesh] * inst; drawn += json.meshes[n.mesh].primitives.length;
  }
  const textures = [];
  for (const img of json.images ?? []) {
    let size = null;
    if (img.bufferView !== undefined) {
      const bv = json.bufferViews[img.bufferView];
      const b = json.buffers[bv.buffer];
      if (!b.uri && !b.extensions) size = imageSize(buf.subarray(binStart + (bv.byteOffset ?? 0), binStart + (bv.byteOffset ?? 0) + bv.byteLength));
    }
    textures.push({ mime: img.mimeType ?? img.uri ?? '?', size });
  }
  const maxTex = textures.reduce((m, t) => Math.max(m, t.size ? Math.max(...t.size) : 0), 0);
  return {
    fichier: file.split(/[\\/]/).pop(),
    ko: Math.round(buf.length / 102.4) / 10,
    triangles: Math.round(tris),
    sommets: verts,
    appelsDeDessin: drawn,
    textures: textures.length,
    textureMax: maxTex,
    matieres: (json.materials ?? []).length,
    extensions: json.extensionsUsed ?? [],
    noeuds: (json.nodes ?? []).filter((n) => n.name).map((n) => n.name),
  };
}

if (process.argv[1] && process.argv[1].endsWith('glb-stats.mjs')) {
  for (const f of process.argv.slice(2)) console.log(JSON.stringify(glbStats(f)));
}
