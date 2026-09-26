// Arsenal, 3 emplacements par joueur (touches 1 2 3 du combat) : râtelier des 8 vraies armes (stickers), ou
// « Snap a real object » (webcam/import/glisser-déposer), forge, puis carte d'arme (relance en catégorie imposée).
// La photo réellement capturée est gardée à part (photos, par id d'arme) : le contrat Weapon ne la porte pas,
// mais la présentation (règle 5 du DA) veut la vraie preuve webcam sur la carte.
import type { Category, PlayerId, Weapon } from '../core/types';
import { scanObject } from '../ia';
import { mountCapture } from './capture';
import { button, clear, el, menuScreen } from './dom';
import { mountForge } from './forge';
import { CAMERA_SVG, categoryTag } from './icons';
import { presetsReady, weaponPresets } from './presets';
import { weaponSticker } from './sticker2d';
import { renderWeaponCard } from './weaponCard';

export interface ArsenalResult {
  weapons: [Weapon[], Weapon[]];
  photos: Map<string, string>;
}

function slotTile(index: number, weapon: Weapon | null, active: boolean, onClick: () => void): HTMLDivElement {
  const tile = el('div', `arsenal-slot${active ? ' active' : ''}${weapon ? '' : ' empty'}`);
  tile.append(el('kbd', 'key slot-key', String(index + 1)));
  if (weapon) {
    tile.append(weaponSticker(weapon, 'slot-sticker'), el('strong', 'slot-name', weapon.name), categoryTag(weapon));
  } else {
    tile.append(el('div', 'slot-hole'), el('p', 'slot-empty-hint', active ? 'Pick below' : 'Empty'));
  }
  tile.addEventListener('click', onClick);
  return tile;
}

function rackTile(weapon: Weapon, onClick: () => void): HTMLDivElement {
  const tile = el('div', 'rack-tile');
  tile.tabIndex = 0;
  tile.append(weaponSticker(weapon, 'rack-sticker'), el('strong', 'rack-name', weapon.name), categoryTag(weapon));
  const pick = () => onClick();
  tile.addEventListener('click', pick);
  tile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  });
  return tile;
}

/** Tuile « photographie un vrai objet » : le cœur du jeu, mise en avant dans la grille. */
function snapTile(onClick: () => void): HTMLDivElement {
  const tile = el('div', 'rack-tile snap-tile');
  tile.tabIndex = 0;
  const icon = el('div', 'snap-icon');
  icon.innerHTML = CAMERA_SVG;
  tile.append(icon, el('strong', 'rack-name', 'Snap a real object'), el('span', 'snap-sub', 'It becomes a weapon'));
  tile.addEventListener('click', onClick);
  tile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  });
  return tile;
}

async function forgeAndCard(
  area: HTMLElement,
  blob: Blob,
  photoUrl: string,
  category: Category | undefined,
  label: string,
  player: PlayerId,
  slotNumber: number,
): Promise<Weapon> {
  clear(area);
  const forge = mountForge(`Forging ${label}'s weapon…`);
  area.append(forge.root);
  const weapon = await scanObject(blob, category ? { category } : {});
  return new Promise((resolve) => {
    clear(area);
    const wrap = el('div', 'weapon-confirm');
    wrap.append(
      renderWeaponCard(weapon, {
        player,
        cardNumber: slotNumber,
        photoUrl,
        onCategoryChange: (cat) => {
          forgeAndCard(area, blob, photoUrl, cat, label, player, slotNumber).then(resolve);
        },
      }),
    );
    const row = el('div', 'confirm-row');
    row.append(
      button('Confirm', 'b-btn', () => resolve(weapon)),
      button('Retry', 'b-btn small alt', () => {
        snapObjectFlow(area, label, player, slotNumber).then(({ weapon: w }) => resolve(w));
      }),
    );
    wrap.append(row);
    area.append(wrap);
  });
}

async function snapObjectFlow(
  area: HTMLElement,
  label: string,
  player: PlayerId,
  slotNumber: number,
): Promise<{ weapon: Weapon; photoUrl: string }> {
  clear(area);
  const capture = mountCapture('Point the camera at an object, or drop in a photo.');
  area.append(capture.root);
  const shot = await capture.result;
  capture.dispose();
  const weapon = await forgeAndCard(area, shot.blob, shot.url, undefined, label, player, slotNumber);
  return { weapon, photoUrl: shot.url };
}

function pickArsenal(screenLayer: HTMLElement, player: PlayerId, photos: Map<string, string>): Promise<Weapon[]> {
  clear(screenLayer);
  const { root, card } = menuScreen(`arsenal-card p${player + 1}`);
  const label = `Player ${player + 1}`;
  const head = el('div', 'screen-head');
  head.append(el('span', `ptoken p${player + 1}`, `P${player + 1}`), el('h2', 'b-title', 'Pick 3 weapons'));
  card.append(head);

  const slots: (Weapon | null)[] = [null, null, null];
  let current = 0;
  const slotsRow = el('div', 'arsenal-slots');
  const rack = el('div', 'weapon-rack');
  const snapArea = el('div', 'weapon-snap-area');
  const confirmBtn = button('', 'b-btn cta');
  confirmBtn.disabled = true;
  const foot = el('div', 'screen-foot');
  foot.append(confirmBtn);
  card.append(slotsRow, rack, snapArea, foot);
  screenLayer.append(root);

  function renderSlots() {
    clear(slotsRow);
    slots.forEach((w, i) =>
      slotsRow.append(
        slotTile(i, w, i === current, () => {
          current = i;
          renderSlots();
        }),
      ),
    );
    const filled = slots.filter(Boolean).length;
    confirmBtn.disabled = filled < 3;
    confirmBtn.textContent = filled < 3 ? `Pick ${3 - filled} more` : 'Ready!';
  }
  function assign(weapon: Weapon, photoUrl?: string) {
    const slotIndex = current;
    const cloned: Weapon = { ...weapon, id: `${weapon.id}-p${player}-${slotIndex}` };
    slots[slotIndex] = cloned;
    if (photoUrl) photos.set(cloned.id, photoUrl);
    const next = slots.findIndex((w) => !w);
    if (next !== -1) current = next;
    renderSlots();
    rack.hidden = false;
    clear(snapArea);
  }
  renderSlots();
  rack.append(
    snapTile(() => {
      rack.hidden = true;
      snapObjectFlow(snapArea, label, player, current + 1).then(({ weapon, photoUrl }) => assign(weapon, photoUrl));
    }),
  );
  for (const preset of weaponPresets()) rack.append(rackTile(preset, () => assign(preset)));

  return new Promise((resolve) => {
    confirmBtn.addEventListener('click', () => {
      if (slots.every((w): w is Weapon => !!w)) resolve(slots as Weapon[]);
    });
  });
}

/** Contre l'IA : 3 vraies armes différentes tirées au hasard, une par catégorie autant que possible. */
function aiArsenal(): Weapon[] {
  const pool = [...weaponPresets()].sort(() => Math.random() - 0.5);
  const picked: Weapon[] = [];
  for (const w of pool) if (picked.length < 3 && !picked.some((p) => p.category === w.category)) picked.push(w);
  for (const w of pool) if (picked.length < 3 && !picked.includes(w)) picked.push(w);
  return picked.map((w, i) => ({ ...w, id: `${w.id}-p1-${i}` }));
}

export async function runArsenal(screenLayer: HTMLElement, vsAI = false): Promise<ArsenalResult> {
  await presetsReady; // les 8 vraies armes (stickers) : fichier local, déjà là en pratique
  const photos = new Map<string, string>();
  const p0 = await pickArsenal(screenLayer, 0, photos);
  const p1 = vsAI ? aiArsenal() : await pickArsenal(screenLayer, 1, photos);
  return { weapons: [p0, p1], photos };
}
