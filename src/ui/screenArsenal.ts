// Arsenal, 3 emplacements par joueur : râtelier de presets, ou « Snap an object » (webcam/import/glisser-déposer),
// animation de forge, puis carte d'arme avec pastilles de catégorie (relance scanObject en catégorie imposée).
// La photo réellement capturée est gardée à part (photos, par id d'arme) : le contrat Weapon ne la porte pas,
// mais la présentation (règle 5 du DA) veut la vraie preuve webcam sur la carte.
import type { Category, PlayerId, Weapon } from '../core/types';
import { primeWeapon, scanObject } from '../ia';
import { mountCapture } from './capture';
import { button, clear, el, menuScreen } from './dom';
import { mountForgeView } from './loading';
import { categoryBadge } from './icons';
import { WEAPON_PRESETS } from './presets';
import { LOCAL_TOKENS } from './theme';
import { renderWeaponCard } from './weaponCard';

export interface ArsenalResult {
  weapons: [Weapon[], Weapon[]];
  photos: Map<string, string>;
}

function slotTile(index: number, weapon: Weapon | null, active: boolean, onClick: () => void): HTMLDivElement {
  const tile = el('div', `arsenal-slot${active ? ' active' : ''}${weapon ? '' : ' empty'}`);
  tile.append(el('span', 'slot-index', `Slot ${index + 1}`));
  if (weapon) {
    const head = el('div', 'slot-head');
    head.append(categoryBadge(weapon.category, LOCAL_TOKENS.category[weapon.category]), el('strong', 'slot-name', weapon.name));
    tile.append(head);
  } else {
    tile.append(el('p', 'slot-empty-hint', 'Pick a weapon below'));
  }
  tile.addEventListener('click', onClick);
  return tile;
}

function rackTile(weapon: Weapon, onClick: () => void): HTMLDivElement {
  const tile = el('div', 'rack-tile');
  tile.tabIndex = 0;
  const head = el('div', 'slot-head');
  head.append(categoryBadge(weapon.category, LOCAL_TOKENS.category[weapon.category]), el('strong', 'slot-name', weapon.name));
  tile.append(head, el('p', 'rack-object', weapon.object));
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
  // LLOAD : forge branchée sur les étapes réelles du scan ; elle reste au-dessus de la carte jusqu'au sticker.
  const forge = mountForgeView({ photoUrl, label });
  area.append(forge.root);
  const weapon = await scanObject(blob, { ...(category ? { category } : {}), onProgress: forge.update });
  return new Promise((resolve) => {
    clear(area);
    const wrap = el('div', 'weapon-confirm');
    const pair = el('div', 'lload-pair'); // LLOAD : forge (sticker en cours) et carte côte à côte, Confirm reste visible
    wrap.append(pair);
    pair.append(forge.root);
    pair.append(
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
  const { root, card } = menuScreen('arsenal-card');
  const label = `Player ${player + 1}`;
  card.append(el('h2', 'b-title', `${label}: build your arsenal`));
  card.append(el('p', 'b-lede', 'Pick 3 weapons — presets from the rack, or snap your own objects.'));

  const slots: (Weapon | null)[] = [null, null, null];
  let current = 0;
  const slotsRow = el('div', 'arsenal-slots');
  const rack = el('div', 'weapon-rack');
  const snapArea = el('div', 'weapon-snap-area');
  const snapBtn = button('Snap an object', 'b-btn alt');
  const confirmBtn = button('Confirm arsenal', 'b-btn');
  confirmBtn.disabled = true;
  card.append(slotsRow, rack, snapArea, snapBtn, confirmBtn);
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
    confirmBtn.disabled = slots.some((w) => !w);
  }
  function assign(weapon: Weapon, photoUrl?: string) {
    const slotIndex = current;
    // LLOAD : une arme scannée garde son objet (seul l'id change), pour que le sticker qui arrive ~15 s plus tard
    // (scan.ts le pose sur cet objet) atteigne bien le slot ; les presets du râtelier, partagés, restent copiés.
    const id = `${weapon.id}-p${player}-${slotIndex}`;
    const cloned: Weapon = weapon.source === 'scan' ? Object.assign(weapon, { id }) : { ...weapon, id };
    void primeWeapon(cloned); // LLOAD : sa voix de présentation part dès maintenant

    slots[slotIndex] = cloned;
    if (photoUrl) photos.set(cloned.id, photoUrl);
    const next = slots.findIndex((w) => !w);
    if (next !== -1) current = next;
    renderSlots();
    rack.hidden = false;
    snapBtn.hidden = false;
    clear(snapArea);
  }
  renderSlots();
  for (const preset of WEAPON_PRESETS) rack.append(rackTile(preset, () => assign(preset)));
  snapBtn.addEventListener('click', () => {
    rack.hidden = true;
    snapBtn.hidden = true;
    snapObjectFlow(snapArea, label, player, current + 1).then(({ weapon, photoUrl }) => assign(weapon, photoUrl));
  });

  return new Promise((resolve) => {
    confirmBtn.addEventListener('click', () => {
      if (slots.every((w): w is Weapon => !!w)) resolve(slots as Weapon[]);
    });
  });
}

export async function runArsenal(screenLayer: HTMLElement): Promise<ArsenalResult> {
  const photos = new Map<string, string>();
  const p0 = await pickArsenal(screenLayer, 0, photos);
  const p1 = await pickArsenal(screenLayer, 1, photos);
  return { weapons: [p0, p1], photos };
}
