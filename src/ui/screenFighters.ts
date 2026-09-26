// Choix du perso, joueur 1 puis joueur 2 : 4 prédéfinis (3 barres) ou « Snap yourself » (scanFighter, lot LP).
import type { FighterDef, PlayerId } from '../core/types';
import { scanFighter } from '../ia/fighter';
import { mountCapture } from './capture';
import { button, clear, el, menuScreen, statRow } from './dom';
import { mountForge } from './forge';
import { FIGHTER_BAR_MAX, FIGHTER_PRESETS } from './presets';

function fighterInfo(f: FighterDef): HTMLDivElement {
  const box = el('div', 'fighter-info');
  box.append(el('h3', 'b-title fighter-name', f.name));
  box.append(el('p', 'fighter-model', f.model.replace('_', ' ')));
  box.append(statRow('HP', f.hpMax, FIGHTER_BAR_MAX.hp));
  box.append(statRow('Power', f.power, FIGHTER_BAR_MAX.power));
  box.append(statRow('Agility', f.agility, FIGHTER_BAR_MAX.agility));
  if (f.catchphrase) box.append(el('p', 'fighter-quote', `"${f.catchphrase}"`));
  return box;
}

function fighterTile(f: FighterDef, onPick: () => void): HTMLDivElement {
  const tile = el('div', 'fighter-tile');
  tile.tabIndex = 0;
  tile.append(fighterInfo(f));
  const pick = () => onPick();
  tile.addEventListener('click', pick);
  tile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  });
  return tile;
}

async function snapYourself(area: HTMLElement, label: string): Promise<FighterDef> {
  clear(area);
  const capture = mountCapture('Show your face to the camera, or drop in a photo.');
  area.append(capture.root);
  const shot = await capture.result;
  capture.dispose();
  clear(area);
  const forge = mountForge(`Scanning ${label}…`);
  area.append(forge.root);
  const fighter = await scanFighter(shot.blob);

  return new Promise((resolve) => {
    clear(area);
    const wrap = el('div', 'fighter-confirm');
    wrap.append(fighterInfo(fighter));
    const row = el('div', 'confirm-row');
    row.append(
      button('Confirm', 'b-btn', () => resolve(fighter)),
      button('Retry', 'b-btn small alt', () => {
        snapYourself(area, label).then(resolve);
      }),
    );
    wrap.append(row);
    area.append(wrap);
  });
}

import { promptVoiceClone } from '../ia/voice';

function pickOne(screenLayer: HTMLElement, player: PlayerId): Promise<FighterDef> {
  clear(screenLayer);
  const { root, card } = menuScreen('fighters-card');
  const label = `Player ${player + 1}`;
  card.append(el('h2', 'b-title', `${label}: choose your fighter`));

  const grid = el('div', 'fighter-grid');
  const snapArea = el('div', 'fighter-snap-area');
  const snapBtn = button('Snap yourself', 'b-btn alt');
  
  const voiceWrap = el('div', 'voice-wrap');
  const voiceBtn = button('🎤 USE MY VOICE', 'b-btn voice-btn', async () => {
    voiceBtn.disabled = true;
    voiceBtn.textContent = '🎤 RECORDING...';
    await promptVoiceClone(player, snapArea, () => {
      const badge = el('span', 'voice-badge', '🎤 VOICE READY');
      voiceWrap.append(badge);
    });
    voiceBtn.hidden = true;
    const warning = el('p', 'voice-warning', 'Your voice is only used for this session.');
    voiceWrap.append(warning);
  });
  voiceWrap.append(voiceBtn);
  
  card.append(grid, snapArea, snapBtn, voiceWrap);
  screenLayer.append(root);

  return new Promise((resolve) => {
    let done = false;
    const finish = (f: FighterDef) => {
      if (done) return;
      done = true;
      resolve(f);
    };
    for (const preset of FIGHTER_PRESETS) grid.append(fighterTile(preset, () => finish(preset)));
    snapBtn.addEventListener('click', () => {
      grid.hidden = true;
      snapBtn.hidden = true;
      voiceBtn.hidden = true;
      snapYourself(snapArea, label).then(finish);
    });
  });
}

export async function runFighterSelect(screenLayer: HTMLElement): Promise<[FighterDef, FighterDef]> {
  const p0 = await pickOne(screenLayer, 0);
  const p1 = await pickOne(screenLayer, 1);
  return [p0, p1];
}
