/** Burning roads: bandits, arsonists and their traps, builders who put fires out. */
import { Color } from '@kingmap-rts/kingsmap-types';
import type { Convoy, Link, Unit } from '../world/types';
import { RESOURCES } from '../config/economy';
import { BURN_IMMUNITY } from '../config/network';
import { hasPerk, burnTime, arsonTime } from '../modifiers';
import { G } from '../state';
import { hostile } from './diplomacy';
import { segmentDist } from '../util/geometry';
import { logEvent, msg, notify } from '../world/events';

export function sabotageTick(dt: number) {
  const seen = new Set();
  for (const l of G.links) {
    if (seen.has(l.key)) continue;
    seen.add(l.key);
    const until = G.sab.get(l.key) || 0;
    if (until > G.t) {
      G.sabProg.delete(l.key);
      continue;
    }
    if (until > 0 && G.t < until + BURN_IMMUNITY) {
      G.sabProg.delete(l.key);
      continue;
    }
    if ((G.royal.get(l.key) || 0) > G.t || guarded(l)) {
      G.sabProg.delete(l.key);
      continue;
    }
    const ax = l.a.x + 0.5;
    const ay = l.a.y + 0.5;
    const bx = l.b.x + 0.5;
    const by = l.b.y + 0.5;
    let raider = null;
    for (const u of G.units) {
      if (u.dead || u.type !== 'raid' || !hostile(l.owner, u.owner)) continue;
      if (
        u.x < Math.min(ax, bx) - 1.2 ||
        u.x > Math.max(ax, bx) + 1.2 ||
        u.y < Math.min(ay, by) - 1.2 ||
        u.y > Math.max(ay, by) + 1.2
      )
        continue;
      if (segmentDist(u.x, u.y, ax, ay, bx, by) <= 1.1) {
        raider = u;
        break;
      }
    }
    if (raider && G.t - raider.lastHit < 1) {
      G.sabProg.delete(l.key);
      continue;
    }
    let pr = G.sabProg.get(l.key);
    if (raider) {
      if (!pr || pr.by !== raider.owner) pr = { p: 0, by: raider.owner };
      pr.p += dt;
      G.sabProg.set(l.key, pr);
      const att = G.players[raider.owner];
      const dur = burnTime(att, G.players[l.owner]);
      if (pr.p >= arsonTime(att)) {
        G.sab.set(l.key, G.t + dur);
        if (hasPerk(att, 'scorch'))
          for (const e of [l.a, l.b])
            if (e.type === 'depot')
              for (const k of RESOURCES) e.stock[k] *= 0.6;
        G.sabProg.delete(l.key);
        G.players[raider.owner].stats.sabotage++;
        G.players[l.owner].stats.sabotaged++;
        logEvent('sabotage', raider.owner, { v: l.owner });
        G.fx.push({
          x: (ax + bx) / 2,
          y: (ay + by) / 2,
          t: 0,
          dur: 0.9,
          r: 1.4,
          color: Color.Blast,
        });
        notify(l.owner, msg('notice.roadBurned', { seconds: Math.round(dur) }));
        notify(
          raider.owner,
          msg('notice.roadSetOnFire', { seconds: Math.round(dur) }),
        );
      }
    } else if (pr) {
      pr.p = Math.max(0, pr.p - dt);
      if (pr.p <= 0) G.sabProg.delete(l.key);
    }
  }
}

/** a builder standing by a road protects it from arson and puts out a fire on it */
export function guarded(l: Link) {
  for (const u of G.units) {
    if (u.dead || u.type !== 'builder' || u.owner !== l.owner) continue;
    if (
      segmentDist(
        u.x,
        u.y,
        l.a.x + 0.5,
        l.a.y + 0.5,
        l.b.x + 0.5,
        l.b.y + 0.5,
      ) <= 1.6
    )
      return true;
  }
  return false;
}

export function builderTick() {
  for (const l of G.links) {
    const until = G.sab.get(l.key) || 0;
    if (until <= G.t) continue;
    if (guarded(l)) {
      G.sab.set(l.key, G.t);
      notify(l.owner, msg('notice.fireOut'));
    }
  }
}

/** arsonist: stands still on an enemy road for 2 s to hide a trap that burns the next 3 caravans */
export function arsonTick(u: Unit, dt: number) {
  if (u.trapCd !== undefined && u.trapCd > G.t) return;
  let best = null;
  for (const l of G.links) {
    if (!hostile(u.owner, l.owner) || l.blocked) continue;
    const ax = l.a.x + 0.5;
    const ay = l.a.y + 0.5;
    const bx = l.b.x + 0.5;
    const by = l.b.y + 0.5;
    if (
      u.x < Math.min(ax, bx) - 1 ||
      u.x > Math.max(ax, bx) + 1 ||
      u.y < Math.min(ay, by) - 1 ||
      u.y > Math.max(ay, by) + 1
    )
      continue;
    if (segmentDist(u.x, u.y, ax, ay, bx, by) <= 0.9) {
      best = l;
      break;
    }
  }
  if (!best || u.mv || (u.path && u.path.length)) {
    u.trapT = 0;
    return;
  }
  u.trapT = (u.trapT || 0) + dt;
  if (u.trapT >= 2) {
    G.traps.set(best.key, { owner: u.owner, n: 3 });
    u.trapT = 0;
    u.trapCd = G.t + 20;
    notify(u.owner, msg('notice.trapHidden'));
  }
}

export function springTrap(c: Convoy) {
  if (c.key === undefined) return;
  const tr = G.traps.get(c.key);
  if (!tr || !hostile(tr.owner, c.owner)) return;
  c.doom = tr.owner + 1;
  tr.n--;
  if (tr.n <= 0) {
    G.traps.delete(c.key);
    G.sab.set(c.key, Math.max(G.sab.get(c.key) || 0, G.t + 20));
    notify(c.owner, msg('notice.trapSprung'));
  }
}
