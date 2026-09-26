// Carte d'arme façon Wacky Packages (règle 5 du DA), 5:7, bord vinyle 12 px : bandeau catégorie (icône + mot) +
// numéro, le sticker de l'arme sur une trame de points couleur claire du joueur (+ la vraie photo webcam en niveaux
// de gris, agrafée, pour les armes scannées), bandeau de nom couleur du joueur, 3 rangées de 6 pastilles, tampon.
// Présentation : arrive dos kraft, se retourne (durees.glisse), les pastilles se remplissent une à une (durees.pastille).
import { durees } from '../art/tokens.js';
import { CATEGORIES, STAT_NAMES } from '../core/types';
import type { Category, PlayerId, Weapon } from '../core/types';
import { el } from './dom';
import { categoryIconSvg } from './icons';
import { weaponSticker } from './sticker2d';
import { LOCAL_TOKENS } from './theme';

export interface WeaponCardOptions {
  player?: PlayerId;
  cardNumber?: number;
  /** Photo réellement capturée (webcam/import), en couleur : le CSS l'affiche en niveaux de gris. */
  photoUrl?: string;
  /** Pastilles de catégorie ; le clic sur une autre catégorie relance un scan (armes scannées seulement). */
  onCategoryChange?: (cat: Category) => void;
  /** Présentation façon carte à collectionner : arrive dos kraft puis se retourne. */
  reveal?: boolean;
}

function pipRow(label: string, value: number): HTMLDivElement {
  const row = el('div', 'wc-pip-row');
  row.append(el('span', 'wc-pip-label', label));
  const dots = el('div', 'wc-pip-dots');
  for (let i = 0; i < 6; i++) dots.append(el('span', `pip${i < value ? ' filled' : ''}`));
  row.append(dots);
  return row;
}

/** Physique réelle estimée de l'objet (lot LE2E) : « 15 kg · 1.1 m · plastic · fragile ». La chaise n'est pas la canette. */
function physicsLine(weapon: Weapon): HTMLParagraphElement | null {
  const ph = weapon.physics;
  if (!ph) return null;
  const kg = ph.massKg;
  const mass = kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg < 10 ? kg.toFixed(1) : Math.round(kg)} kg`;
  const dim = Math.max(...ph.sizeM);
  const size = dim < 1 ? `${Math.round(dim * 100)} cm` : `${dim.toFixed(1)} m`;
  const flags = [ph.fragile && 'fragile', ph.liquid && 'splashes', ph.bounciness > 0.3 && 'bouncy'].filter(Boolean);
  return el('p', 'wc-physics', [mass, size, ph.material, ...flags].join(' · '));
}

function buildFront(weapon: Weapon, opts: WeaponCardOptions): HTMLDivElement {
  const player = opts.player ?? 0;
  const front = el('div', 'weapon-card-face wc-front');
  front.style.setProperty('--owner', `var(--b-p${player + 1})`);
  front.style.setProperty('--owner-light', `var(--b-p${player + 1}-clair)`);

  const band = el('div', 'wc-band-top');
  const catLabel = el('span', 'wc-category');
  catLabel.innerHTML = categoryIconSvg(weapon.category);
  catLabel.append(el('span', '', weapon.category));
  catLabel.style.setProperty('--accent', LOCAL_TOKENS.category[weapon.category]);
  band.append(catLabel, el('span', 'wc-number', `#${String(opts.cardNumber ?? 1).padStart(2, '0')}`));

  // Le vrai visuel de l'arme (sticker détouré, ou forge tant qu'il n'est pas arrivé) — jamais un pictogramme.
  const illustration = el('div', 'wc-illustration');
  illustration.append(weaponSticker(weapon, 'wc-sticker'));
  if (opts.photoUrl) {
    const photoWrap = el('div', 'wc-photo-wrap');
    const img = el('img', 'wc-photo');
    img.src = opts.photoUrl;
    img.alt = weapon.object;
    photoWrap.append(img, el('span', 'wc-staple'), el('span', 'wc-staple b'));
    illustration.append(photoWrap);
  }

  const nameBand = el('div', 'wc-band-name', weapon.name);
  const objectLine = el('p', 'weapon-object', `From: ${weapon.object}`);

  const pips = el('div', 'wc-pips');
  const names = STAT_NAMES[weapon.category];
  pips.append(pipRow(names[0], weapon.stats.a), pipRow(names[1], weapon.stats.b), pipRow(names[2], weapon.stats.c));

  const stamp = el('div', 'wc-stamp', weapon.trait);

  front.append(band, illustration, nameBand, objectLine);
  const physics = physicsLine(weapon);
  if (physics) front.append(physics);
  front.append(pips, stamp);

  if (opts.onCategoryChange) {
    const pillsRow = el('div', 'category-pills');
    for (const cat of CATEGORIES) {
      const pill = el('button', `cat-pill${cat === weapon.category ? ' active' : ''}`, cat);
      pill.type = 'button';
      pill.disabled = cat === weapon.category;
      pill.addEventListener('click', () => opts.onCategoryChange!(cat));
      pillsRow.append(pill);
    }
    front.append(pillsRow);
  }
  front.append(el('p', 'weapon-why', `"${weapon.why}"`));
  return front;
}

function animatePips(front: HTMLDivElement, delayMs: number): void {
  window.setTimeout(() => {
    const dots = Array.from(front.querySelectorAll<HTMLElement>('.pip.filled'));
    dots.forEach((dot, i) => {
      dot.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], {
        duration: 160,
        delay: i * durees.pastille,
        easing: 'ease-out',
        fill: 'both',
      });
    });
  }, delayMs);
}

export function renderWeaponCard(weapon: Weapon, opts: WeaponCardOptions = {}): HTMLDivElement {
  const outer = el('div', `weapon-card${opts.reveal ? ' reveal-size' : ''}`);
  const inner = el('div', `weapon-card-inner${opts.reveal ? ' face-down' : ''}`);
  const back = el('div', 'weapon-card-face wc-back');
  back.append(el('span', 'b-title wc-back-mark', 'BROSKIS'));
  const front = buildFront(weapon, opts);
  inner.append(back, front);
  outer.append(inner);

  if (opts.reveal) {
    requestAnimationFrame(() => requestAnimationFrame(() => inner.classList.remove('face-down')));
    animatePips(front, durees.glisse);
  } else {
    animatePips(front, 0);
  }
  return outer;
}
