// Combat : dégâts (modifiés par la chimie), K.O., boucliers, étourdissement, mana.
//   ctx.damage(f, amount, { kind, element, by, from })  → émet 'damage' puis éventuellement 'fighter:ko'
//   ctx.foe(f), ctx.canAct(f), f.stun(sec)
//   ctx.showShield(f, color)
//   ctx.hits : journal des 40 derniers coups (débogage)
import { makeShieldBubble } from '../fx.js';
import { sfx } from '../audio.js';

export const MANA = { max: 100, regen: 10, prop: 20, wow: { law: 35, weather: 35, mirror: 25, possess: 30, summon: 30 }, spell: (power) => Math.min(55, 15 + 5 * power), defense: (power) => Math.min(40, 10 + 3 * power) };

export function installCombat(ctx) {
  const { p1, p2 } = ctx.fighters;
  const hits = [];
  ctx.hits = hits;
  ctx.foe = (f) => (f === p1 ? p2 : p1);
  const colliderOwner = new Map([[p1.collider.handle, p1], [p2.collider.handle, p2]]);
  ctx.fighterByCollider = (h) => colliderOwner.get(h);

  for (const f of [p1, p2]) {
    f.stunUntil = 0;
    f.stun = (sec) => { f.stunUntil = Math.max(f.stunUntil, ctx.time + sec); f.stunned = true; };
    ctx.entities.add(f);
  }
  ctx.canAct = (f) => !f.ko && !f.frozen && ctx.time >= f.stunUntil;

  ctx.damage = (f, amount, info = {}) => {
    if (!f || f.ko || amount <= 0) return 0;
    let dmg = ctx.chem ? ctx.chem.modifyDamage(f, amount, info) : amount;
    if (f.ko) return 0; // l'éclatement a pu achever
    hits.push({ t: +ctx.time.toFixed(2), who: f.id, amount: dmg, kind: info.kind || '', element: info.element || '', by: info.by || '', shield: f.shield });
    if (hits.length > 40) hits.shift();
    const dot = info.kind === 'burn' || info.kind === 'soup';
    if (f.shield > 0 && !dot) {
      const absorbed = Math.min(f.shield, dmg);
      f.shield -= absorbed; dmg -= absorbed;
      ctx.floater(f, `-${absorbed} bouclier`, 'shield');
      if (f.shield <= 0) removeShield(f);
      if (dmg <= 0) { sfx.shield(); ctx.addShake(0.15); ctx.events.emit('damage', { target: f.id, amount: 0, absorbed, ...info }); return 0; }
    }
    f.hp = Math.max(0, f.hp - dmg);
    if (!dot) {
      ctx.hitstop = Math.max(ctx.hitstop, dmg >= 20 ? 0.11 : 0.07);
      ctx.addShake(Math.min(0.9, 0.25 + dmg * 0.02));
      f.hitReact(dmg, info.from?.x ?? ctx.foe(f).root.position.x);
      sfx.hurt();
      const c = f.chestPos();
      ctx.fx.sparks.burst(c.x, c.y, c.z, ['#fff4d0', '#ffcf5a'], 16, 4, 0.3);
    } else f.flash = Math.max(f.flash, 0.4);
    ctx.floater(f, `-${dmg}`, dmg >= 20 ? 'big' : dot ? 'dot' : '', info.element);
    ctx.events.emit('damage', { target: f.id, amount: dmg, ...info, from: undefined });
    if (f.hp <= 0) knockOut(f, info);
    return dmg;
  };

  function knockOut(f, info) {
    f.ko = true;
    f.setFrozen(false);
    f.play('Death', 0.1);
    sfx.ko();
    ctx.addShake(0.6);
    const winner = ctx.foe(f);
    ctx.later(1.4, () => { if (!winner.ko) winner.play('Dance', 0.3); });
    ctx.events.emit('fighter:ko', { fighter: f.id, winner: winner.id, by: info.by || null, kind: info.kind || '' });
  }

  const shields = new Map();
  ctx.showShield = (f, color) => {
    removeShield(f);
    const m = makeShieldBubble(color);
    f.root.add(m);
    shields.set(f, m);
    ctx.tween(0.25, (k) => m.scale.setScalar(0.2 + k * 0.8));
  };
  function removeShield(f) {
    const m = shields.get(f);
    if (m) { m.removeFromParent(); shields.delete(f); }
  }
  ctx.removeShield = removeShield;

  ctx.addSystem('fighters', (dt) => {
    for (const f of [p1, p2]) {
      if (f.stunned && ctx.time >= f.stunUntil) f.stunned = false;
      if (ctx.manaOn && !f.ko) f.mana = Math.min(f.maxMana, f.mana + MANA.regen * dt);
      f.update(dt);
    }
    for (const [, m] of shields) { m.rotation.y += dt * 0.8; m.material.opacity = 0.18 + Math.sin(ctx.time * 4) * 0.05; }
  }, 20);
}
