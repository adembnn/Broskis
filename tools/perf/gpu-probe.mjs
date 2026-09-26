// Quelle carte graphique le navigateur utilise-t-il ? (PC portable à 2 GPU : Intel intégré + NVIDIA)
// Usage : node tools/perf/gpu-probe.mjs
// Dans le vrai Chrome : ouvrir chrome://gpu et lire « GL_RENDERER ».
import { chromium } from 'playwright';

const VARIANTES = [
  ['d3d11', ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']],
  ['d3d11 + force_high_performance_gpu', ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force_high_performance_gpu']],
];

for (const [nom, args] of VARIANTES) {
  const b = await chromium.launch({ headless: false, args });
  const p = await (await b.newContext({ viewport: null })).newPage();
  const r = await p.evaluate(() => {
    const out = {};
    for (const pp of ['default', 'high-performance', 'low-power']) {
      const gl = document.createElement('canvas').getContext('webgl2', { powerPreference: pp });
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      out[pp] = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a';
    }
    out.dpr = devicePixelRatio;
    out.ecran = [screen.width, screen.height];
    return out;
  });
  console.log(nom.padEnd(36), JSON.stringify(r));
  await b.close();
}
