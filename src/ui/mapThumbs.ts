// Vignettes des 3 arènes (lot LUX) : petites affiches en SVG peintes avec la palette de CHAQUE map (tokens.js →
// maps.*), donc toujours cohérentes avec le rendu 3D, sans capture ni rendu hors écran. Deux pions P1/P2 donnent
// l'échelle et rappellent qu'on s'y bat à deux.
import { joueurs, maps, ui } from '../art/tokens.js';
import type { MapId } from '../core/types';

const INK = ui.encre;
const VINYL = ui.vinyle;

/** Hexagone vu en plongée (écrasé) : dessus + tranche. */
function hexTile(cx: number, cy: number, w: number, top: string, side: string, depth = 9, tilt = 0): string {
  const h = w * 0.42;
  const pts = [
    [cx - w / 2, cy],
    [cx - w / 4, cy - h / 2],
    [cx + w / 4, cy - h / 2],
    [cx + w / 2, cy],
    [cx + w / 4, cy + h / 2],
    [cx - w / 4, cy + h / 2],
  ];
  const p = (a: number[]) => `${a[0].toFixed(1)},${a[1].toFixed(1)}`;
  const sidePts = [pts[0], pts[5], pts[4], pts[3], [pts[3][0], pts[3][1] + depth], [pts[4][0], pts[4][1] + depth], [pts[5][0], pts[5][1] + depth], [pts[0][0], pts[0][1] + depth]];
  return `<g transform="rotate(${tilt} ${cx} ${cy})"><polygon points="${sidePts.map(p).join(' ')}" fill="${side}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<polygon points="${pts.map(p).join(' ')}" fill="${top}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/></g>`;
}

function pawns(x1: number, y1: number, x2: number, y2: number): string {
  const pawn = (x: number, y: number, c: string) =>
    `<g><ellipse cx="${x}" cy="${y + 1}" rx="7" ry="2.6" fill="${INK}" opacity=".35"/><rect x="${x - 4.5}" y="${y - 15}" width="9" height="14" rx="4" fill="${c}" stroke="${INK}" stroke-width="1.6"/>` +
    `<circle cx="${x}" cy="${y - 19}" r="5" fill="${c}" stroke="${INK}" stroke-width="1.6"/></g>`;
  return pawn(x1, y1, joueurs.p1.principal) + pawn(x2, y2, joueurs.p2.principal);
}

function sky(id: string, c: { haut: string; horizon: string; bas: string }): string {
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.haut}"/><stop offset=".6" stop-color="${c.horizon}"/><stop offset="1" stop-color="${c.bas}"/></linearGradient></defs>` +
    `<rect width="320" height="180" fill="url(#${id})"/>`;
}

function archipel(): string {
  const m = maps.archipel;
  const { sol, matiere, accent, lumiere } = m.palette;
  const tiles = [
    [120, 104], [158, 92], [196, 104], [158, 116], [120, 128], [196, 128], [158, 140],
  ].map(([x, y]) => hexTile(x, y, 44, sol, matiere)).join('');
  return sky('sky-archipel', m.ciel) +
    `<g fill="${matiere}" opacity=".5"><path d="M14 124h46l-10 24h-26z"/><path d="M258 96h50l-12 28h-26z"/></g>` +
    hexTile(262, 90, 30, sol, matiere, 7) + hexTile(38, 118, 30, sol, matiere, 7) +
    tiles +
    hexTile(236, 150, 40, sol, matiere, 9, 18) + // la dalle qui tombe
    `<path d="M246 170l4 8M226 168l-3 9" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<rect x="186" y="80" width="5" height="16" fill="${accent}" stroke="${INK}" stroke-width="1.4"/><path d="M188.5 70c5 5 5 9 0 11c-5-2-5-6 0-11z" fill="${lumiere}" stroke="${INK}" stroke-width="1.4"/>` +
    pawns(128, 112, 190, 124);
}

function galion(): string {
  const m = maps.galion;
  const { sol, matiere, accent, lumiere } = m.palette;
  return sky('sky-galion', m.ciel) +
    `<path d="M246 14l-12 26h10l-8 24 20-32h-11l9-18z" fill="${VINYL}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M0 132q20-10 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0V180H0z" fill="${accent}" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M20 128q10-6 20 0M140 128q10-6 20 0M260 128q10-6 20 0" stroke="${m.mer.ecume}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `<g transform="rotate(-5 160 120)">` +
    `<path d="M62 104h196l-18 40q-80 14-160 0z" fill="${matiere}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<path d="M70 98h180l8 6H62z" fill="${sol}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<rect x="156" y="34" width="6" height="66" fill="${matiere}" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M162 40q34 16 0 44z" fill="${VINYL}" stroke="${INK}" stroke-width="1.6"/>` +
    `<circle cx="100" cy="92" r="4.5" fill="${lumiere}" stroke="${INK}" stroke-width="1.4"/>` +
    pawns(118, 100, 212, 100) + `</g>` +
    `<path d="M0 150q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0V180H0z" fill="${accent}" stroke="${INK}" stroke-width="1.6" opacity=".95"/>`;
}

function cuisine(): string {
  const m = maps.cuisine;
  const { sol, matiere, accent, lumiere } = m.palette;
  return sky('sky-cuisine', m.ciel) +
    `<rect x="28" y="14" width="70" height="52" rx="3" fill="${m.principale.couleur}" opacity=".55" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M63 14v52M28 40h70" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M10 118l40-26h230l30 26z" fill="${sol}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<path d="M10 118h300v14H10z" fill="${matiere}" stroke="${INK}" stroke-width="1.8"/>` +
    `<ellipse cx="160" cy="105" rx="46" ry="9" fill="none" stroke="${INK}" stroke-width="2" opacity=".4"/>` +
    `<rect x="214" y="66" width="52" height="38" rx="9" fill="${matiere}" stroke="${INK}" stroke-width="1.8"/>` +
    `<rect x="224" y="62" width="12" height="6" rx="2" fill="${lumiere}" stroke="${INK}" stroke-width="1.4"/><rect x="244" y="62" width="12" height="6" rx="2" fill="${lumiere}" stroke="${INK}" stroke-width="1.4"/>` +
    `<ellipse cx="84" cy="104" rx="24" ry="6" fill="${INK}" opacity=".75"/><path d="M84 98v-20h14v6" fill="none" stroke="${matiere}" stroke-width="4" stroke-linecap="round"/>` +
    `<rect x="120" y="84" width="22" height="12" rx="3" fill="${accent}" stroke="${INK}" stroke-width="1.6"/>` +
    pawns(146, 110, 196, 106);
}

const DRAW: Record<MapId, () => string> = { archipel, galion, cuisine };

export function mapThumbSvg(id: MapId): string {
  return `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${DRAW[id]()}</svg>`;
}
