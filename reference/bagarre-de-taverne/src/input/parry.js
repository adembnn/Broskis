// Parade : clic sur un projectile ennemi (GAME_SPEC §4).
//   Fenêtres (secondes de jeu avant l'impact, après tolérance d'entrée +40 ms souris / +80 ms tactile) :
//     parfaite ≤ 0,09 → renvoi ×1,5 auto-visé sur le lanceur + interrompt son incantation, arrêt sur image 110 ms
//     correcte ≤ 0,22 → renvoi vers le curseur (cible la plus proche du curseur au relâcher), arrêt sur image 70 ms
//     trop tôt ≤ 0,40 → blocage : le sort est annulé, 50 % des dégâts passent
//     au-delà       → RATÉ, parade verrouillée 350 ms
//   Ralenti ×0,3 dans les 250 ms avant l'impact (au plus une fois toutes les 3 s, temps réel).
//   Télégraphe : anneau au sol sur le point d'impact, qui se resserre et change de couleur selon la fenêtre.
//
// API : ctx.reflex.judge(eta) · humanParry(proj, pointerType, screenXY) · tryParry(fighter, proj, skill) → Promise<qualité|null>
//       incoming(f?) : projectiles ennemis parables qui visent f (ou un humain)
// Événement : input:parry { fighter, projectile, quality, ai }
import * as THREE from 'three';
import { sfx } from '../audio.js';
import { SPELL_ELEMENT } from '../rules.js';

const QUALITY_TEXT = { perfect: ['PARADE PARFAITE !', 'perfect'], good: ['RENVOYÉ !', 'good'], early: ['BLOQUÉ', 'block'], miss: ['RATÉ', 'bad'] };
const RING_COLORS = { far: '#2B1D14', early: '#F3E3C3', good: '#F2A541', perfect: '#FFD166' };

export function installParry(ctx, R) {
  const T = R.tuning;

  R.judge = (eta) => (eta <= T.perfect ? 'perfect' : eta <= T.good ? 'good' : eta <= T.early ? 'early' : 'miss');
  const hostile = (p) => p.alive && p.parryable && p.target?.kind === 'fighter' && p.owner !== p.target;
  R.incoming = (f = null) => ctx.projectiles.filter((p) => hostile(p) && (f ? p.target === f : R.isHuman(p.target)));

  // ---------- Lisibilité : durée de vol minimale des sorts qui visent un humain ----------
  const stretch = ({ projectile: p }) => {
    if (!hostile(p) || !R.isHuman(p.target)) return;
    p.dur = Math.max(p.dur, T.minFlight);
    p.whooshed = false;
    if (R.canUse(p.target)) {
      const what = { feu: 'la boule de feu', glace: 'le glaçon', foudre: 'l\'éclair', eau: 'la bulle d\'eau', huile: 'la boule d\'huile', terre: 'le caillou' }[p.spell.element] || 'le sort';
      const pron = what.startsWith('la ') ? 'la' : 'le';
      R.hint('parry', `<b>Clique sur ${what}</b> pour ${pron} renvoyer ! Juste avant l'impact : parade parfaite.`, 4);
    }
  };
  ctx.events.on('projectile:spawn', stretch);
  ctx.events.on('projectile:redirect', stretch);

  // ---------- Résolution commune (humain et IA) ----------
  function resolve(f, proj, quality, { ai = false, aim = null } = {}) {
    const pos = proj.pos().clone();
    const caster = proj.owner;
    const eta = proj.eta();
    proj.parried = true;
    const [text, kind] = QUALITY_TEXT[quality];
    switch (quality) {
      case 'perfect': {
        proj.redirect(caster, { owner: f, mult: 1.5 });
        R.interrupt(caster, f);
        ctx.hitstop = Math.max(ctx.hitstop, T.hitstop.perfect);
        ctx.addShake(0.35);
        sfx.clang(); sfx.shield();
        ctx.fx.sparks.burst(pos.x, pos.y, pos.z, ['#FFD166', '#fff4d0', '#F2A541'], 34, 6, 0.4);
        f.play?.('Punch', 0.05);
        break;
      }
      case 'good': {
        proj.redirect(aim || caster, { owner: f, mult: 1 });
        ctx.hitstop = Math.max(ctx.hitstop, T.hitstop.good);
        ctx.addShake(0.2);
        sfx.clang();
        ctx.fx.sparks.burst(pos.x, pos.y, pos.z, ['#F2A541', '#fff4d0'], 20, 4, 0.3);
        f.play?.('Punch', 0.05);
        break;
      }
      case 'early': {
        const dmg = Math.round(proj.dmg * 0.5);
        const el = proj.spell.element;
        proj.cancel();
        sfx.shield();
        if (f.shield <= 0) { ctx.showShield(f, '#cfe9ee'); ctx.later(0.3, () => { if (f.shield <= 0) ctx.removeShield(f); }); }
        ctx.damage(f, dmg, { kind: 'spell', element: SPELL_ELEMENT[el] || null, by: caster.id, from: pos });
        break;
      }
      default: {
        f.parryLockUntil = ctx.time + T.missLock;
        proj.parried = false;
        sfx.fizzle();
      }
    }
    R.say(f, text, kind);
    R.record({ kind: 'parry', who: f.id, quality, eta: +eta.toFixed(3), ai });
    ctx.events.emit('input:parry', { fighter: f.id, projectile: proj.id, quality, ai });
    if (!ai && quality !== 'miss') R.hint('glyph', '<b>Clic droit maintenu</b> (ou Maj + glisser) : trace un <b>cercle</b> pour une bulle, un <b>zigzag</b> pour un éclair, un <b>triangle</b> pour une boule de feu.', 5);
    return quality;
  }
  R.resolveParry = resolve;

  // ---------- Parade humaine (clic) ----------
  R.humanParry = (proj, pointerType = 'mouse') => {
    const f = proj.target;
    if (!R.canUse(f)) return null;
    if (ctx.time < (f.parryLockUntil || 0)) { R.say(f, 'Trop vite !', 'bad'); return 'locked'; }
    const tol = pointerType === 'touch' ? T.tolTouch : T.tolMouse;
    const q = R.judge(proj.eta() - tol);
    if (q === 'good') pendingAim = { proj, f, until: ctx.realTime + 0.35 };
    return resolve(f, proj, q);
  };
  // Parade correcte : au relâcher, le projectile renvoyé part vers la cible la plus proche du curseur.
  let pendingAim = null;
  R.releaseAim = (groundPoint) => {
    const pa = pendingAim; pendingAim = null;
    if (!pa || !pa.proj.alive || pa.proj.owner !== pa.f || !groundPoint) return;
    const t = R.entityNear(groundPoint, pa.f);
    if (t && t !== pa.proj.target) { pa.proj.redirect(t, { owner: pa.f, mult: 1 }); pa.proj.reflected--; }
  };
  R.entityNear = (pt, exclude) => {
    let best = null, bd = 2.2;
    for (const e of ctx.entities.live()) {
      if (e === exclude || e.kind === 'surface') continue;
      const p = e.pos();
      const d = Math.hypot(p.x - pt.x, p.z - pt.z) - (e.radius || 0.4) * 0.5;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  // ---------- Parade de l'IA (probabiliste) ----------
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  R.tryParry = (fighter, proj, skill = 0.3) => {
    if (!proj?.alive || !proj.parryable || proj.target !== fighter || proj.owner === fighter || proj.parried) return Promise.resolve(null);
    if (Math.random() > skill) return Promise.resolve(null); // n'a pas réagi
    const spread = 0.05 + (1 - skill) * 0.22;
    const want = THREE.MathUtils.clamp(0.16 - 0.1 * skill + gauss() * spread, 0.01, 0.6); // skill 1 → vise la parade parfaite
    return new Promise((res) => ctx.tick((dt) => {
      if (!proj.alive || proj.target !== fighter || proj.owner === fighter) { res(null); return false; }
      if (fighter.ko || !ctx.canAct(fighter) || ctx.time < (fighter.parryLockUntil || 0)) { res(null); return false; }
      // dernière chance si l'impact tombe pendant cette image (rendu lent : une image peut dépasser la fenêtre visée)
      if (proj.eta() <= want || proj.eta() <= dt) { res(resolve(fighter, proj, R.judge(proj.eta()), { ai: true })); return false; }
      return true;
    }));
  };

  // ---------- Télégraphe (anneaux au sol) + anneau de survol + ralenti ----------
  const ringGeo = new THREE.RingGeometry(0.86, 1, 48);
  const pool = [];
  function ringPair() {
    const mk = (op) => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: RING_COLORS.far, transparent: true, opacity: op, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 4; m.visible = false; ctx.scene.add(m); return m; };
    return { outer: mk(0.9), inner: mk(0.85), proj: null };
  }
  for (let i = 0; i < 6; i++) pool.push(ringPair());
  const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: '#FFD166', transparent: true, depthWrite: false, depthTest: false }));
  hoverRing.visible = false; hoverRing.renderOrder = 6;
  ctx.scene.add(hoverRing);
  R.hoverProjectile = null;

  let slowProj = null, slowReadyAt = 0, slowStart = 0;
  ctx.addSystem('reflex-parry', (dt, real) => {
    const list = R.incoming();
    // anneaux
    for (const r of pool) { r.outer.visible = r.inner.visible = false; }
    list.slice(0, pool.length).forEach((p, i) => {
      const r = pool[i];
      const eta = p.eta();
      const zone = eta <= T.perfect + T.tolMouse ? 'perfect' : eta <= T.good + T.tolMouse ? 'good' : eta <= T.early + T.tolMouse ? 'early' : 'far';
      const c = RING_COLORS[zone];
      r.outer.position.set(p.to.x, 0.05, p.to.z); r.inner.position.set(p.to.x, 0.06, p.to.z);
      r.outer.scale.setScalar(0.9); r.outer.material.color.set(c);
      r.inner.scale.setScalar(0.9 + Math.min(2.6, eta * 3.2)); r.inner.material.color.set(zone === 'far' ? '#F3E3C3' : c);
      r.outer.visible = r.inner.visible = true;
      if (!p.whooshed && eta < T.early + 0.03) { p.whooshed = true; sfx.whoosh(); }
    });
    // survol d'un projectile (anneau doré face caméra)
    const hp = R.hoverProjectile;
    if (hp && hp.alive && list.includes(hp)) {
      hoverRing.visible = true;
      hoverRing.position.copy(hp.pos());
      hoverRing.quaternion.copy(ctx.camera.quaternion);
      hoverRing.scale.setScalar(0.42 * (hp.size || 1) + 0.22 + Math.sin(ctx.realTime * 14) * 0.03);
    } else hoverRing.visible = false;
    // ralenti avant impact
    if (slowProj) {
      if (!slowProj.alive || slowProj.parried || !R.isHuman(slowProj.target) || ctx.realTime - slowStart > 1.2) { slowProj = null; ctx.clearSlow('parry'); }
    } else if (ctx.duel.state.phase === 'fight' && ctx.realTime >= slowReadyAt && !window.__noParrySlow) {
      const p = list.find((q) => q.eta() < T.slowWindow && !q.parried && R.canUse(q.target));
      if (p) { slowProj = p; slowStart = ctx.realTime; slowReadyAt = ctx.realTime + T.slowEvery; ctx.setSlow('parry', T.slowFactor); }
    }
  }, 55);
  ctx.events.on('duel:round', () => { slowProj = null; ctx.clearSlow('parry'); });
}
