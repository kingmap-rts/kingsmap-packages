/** Targeting, shooting, damage, death and elimination. */
import type { Entity, Unit } from '../world/types';
import { RESOURCES } from '../config/economy';
import { COLORS, SEATS } from '../config/map';
import { UNITS } from '../config/units';
import { G } from '../state';
import { hostile } from './diplomacy';
import { findPath } from './pathfinding';
import { memberLoss } from './squads';
import { detCos, detSin, dist, tileIndex } from '../util/geometry';
import { walkable } from '../world/terrain';
import { rand } from '../util/rng';
import { lootCarried, centerX, centerY } from '../world/entities';
import { logEvent, msg, notify } from '../world/events';

export function kill(e: Entity, silent?: boolean, by?: number) {
  if (e.dead) return;
  e.dead = true;
  if (!silent) {
    const vs = G.players[e.owner].stats;
    const ks = by != null && by >= 0 ? G.players[by].stats : null;
    if (e.kind === 'u') {
      if (e.bag && lootCarried(e) > 0)
        G.fx.push({
          x: e.x,
          y: e.y,
          t: 0,
          dur: 1,
          text: '−' + Math.round(lootCarried(e)),
          color: '#ff7b72',
        });
      vs.unitsLost++;
      if (ks) ks.kills++;
      else vs.starved++;
    } else if (e.kind === 'c') {
      vs.convoysLost++;
      if (ks) ks.convoysKilled++;
    } else if (e.kind === 'b' && e.type === 'depot') {
      vs.depotsLost++;
      if (ks) ks.depotsDestroyed++;
      logEvent('destroy', by, { v: e.owner, spec: e.spec });
    }
  }
  if (!silent)
    G.fx.push({
      x: centerX(e),
      y: centerY(e),
      t: 0,
      dur: e.kind === 'b' ? 0.9 : 0.45,
      r: e.kind === 'b' ? 1.6 : 0.7,
      color: G.players[e.owner].color,
    });
  if (e.kind === 'b') {
    G.bAt[tileIndex(e.x, e.y)] = -1;
    if (e.type === 'hq') eliminate(e.owner, by);
    G.netT = 0;
  }
}

export function eliminate(pid: number, by?: number) {
  const p = G.players[pid];
  if (!p.alive) return;
  p.alive = false;
  p.stats.elimAt = Math.round(G.t);
  p.stats.elimBy = by != null && by >= 0 ? by : null;
  logEvent('elim', pid);
  for (const b of G.buildings)
    if (b.owner === pid && !b.dead) {
      G.fx.push({
        x: b.x + 0.5,
        y: b.y + 0.5,
        t: 0,
        dur: 1.2,
        r: 1.4,
        color: p.color,
      });
      b.dead = true;
      G.bAt[tileIndex(b.x, b.y)] = -1;
    }
  for (const u of G.units) if (u.owner === pid) kill(u, true);
  for (const c of G.convoys) if (c.owner === pid) kill(c, true);
  for (let i = 0; i < SEATS; i++)
    notify(
      i,
      i === pid
        ? msg('notice.castleFallen')
        : msg('notice.realmFallen', { player: p.id }),
    );
  const alive = G.players.filter(q => q.alive);
  if (alive.length <= 1) {
    G.over = true;
    G.winner = alive[0] ? alive[0].id : -1;
    G.reason = 'elimination';
  }
}

/** a unit's body radius for the separation, tiles */
export const bodyR = (u: Unit) => (u.n > 1 ? 0.5 : 0.275);

/** directions of the attack spots around a foe */
const RING = Array.from({ length: 16 }, (_, i) => [
  detCos((i * Math.PI) / 8),
  detSin((i * Math.PI) / 8),
]);

/**
 * Where u should run to hit foe t: the free spot in reach around t nearest to u, so attackers
 * spread around their foe and walk past their own troops instead of pressing on their backs.
 * The foe itself when every spot is taken.
 */
export function attackSpot(u: Unit, t: Unit): [number, number] {
  const S = UNITS[u.type];
  const touch = bodyR(u) + bodyR(t);
  const r = Math.max(touch, Math.min(S.range * 0.85, touch + 0.3));
  const near: Unit[] = [];
  for (const o of G.units)
    if (
      o !== u &&
      o !== t &&
      !o.dead &&
      Math.abs(o.x - t.x) < r + 1.2 &&
      Math.abs(o.y - t.y) < r + 1.2
    )
      near.push(o);
  let bx = t.x;
  let by = t.y;
  let bd = 1e9;
  for (const [c, s] of RING) {
    const x = t.x + c * r;
    const y = t.y + s * r;
    if (!walkable(x | 0, y | 0)) continue;
    let free = true;
    for (const o of near)
      if (dist(o.x, o.y, x, y) < (bodyR(o) + bodyR(u)) * 0.9) {
        free = false;
        break;
      }
    if (!free) continue;
    const d = dist(u.x, u.y, x, y);
    if (d < bd) {
      bd = d;
      bx = x;
      by = y;
    }
  }
  return [bx, by];
}

/** how much farther a foe looks for every unit of ours already attacking it, tiles */
const CROWD = 0.5;

/** units of each seat on each target (key: target id * SEATS + seat), counted once per tick */
const onTarget = new Map<number, number>();

export function countTargets() {
  onTarget.clear();
  for (const u of G.units) {
    if (u.dead || !u.tgt) continue;
    const k = u.tgt * SEATS + u.owner;
    onTarget.set(k, (onTarget.get(k) ?? 0) + 1);
  }
}

export function acquireTarget(u: Unit) {
  if (u.type === 'wagon') {
    u.tgt = 0;
    return;
  }
  if (u.order === 'move' && u.path && u.path.length && !u.ftgt) {
    u.tgt = 0;
    return;
  }
  if (u.ftgt) {
    const f = G.byId.get(u.ftgt);
    if (f && !f.dead) {
      u.tgt = f.id;
      return;
    }
    u.ftgt = 0;
  }
  const S = UNITS[u.type];
  let best = null;
  let bd = S.aggro;

  if (u.type === 'siege') {
    // artillery prefers buildings in range, never chases
    let bb = null;
    let bdd = S.range + 0.4;
    for (const b of G.buildings) {
      if (b.dead || !hostile(u.owner, b.owner)) continue;
      if (Math.abs(b.x + 0.5 - u.x) > bdd || Math.abs(b.y + 0.5 - u.y) > bdd)
        continue;
      const e = dist(b.x + 0.5, b.y + 0.5, u.x, u.y);
      if (e < bdd) {
        bdd = e;
        bb = b;
      }
    }
    if (bb) {
      u.tgt = bb.id;
      return;
    }
  }
  // the nearest foe, but one already surrounded by our troops counts as farther: attackers spread
  // over the enemy instead of queueing behind each other for the same one
  let bs = 1e9;
  for (const o of G.units) {
    if (o.dead || !hostile(u.owner, o.owner)) continue;
    const d = Math.abs(o.x - u.x) + Math.abs(o.y - u.y);
    if (d > bd * 1.5) continue;
    const e = dist(o.x, o.y, u.x, u.y);
    if (e >= bd) continue;
    const crowd =
      (onTarget.get(o.id * SEATS + u.owner) ?? 0) - (u.tgt === o.id ? 1 : 0);
    const sc = e + CROWD * crowd;
    if (sc < bs) {
      bs = sc;
      best = o;
    }
  }
  if (best) bd = dist(best.x, best.y, u.x, u.y);
  if (!best) {
    bd = u.type === 'raid' ? 5 : 3.5;
    for (const c of G.convoys) {
      if (c.dead || !hostile(u.owner, c.owner)) continue;
      const e = dist(c.x, c.y, u.x, u.y);
      if (e < bd) {
        bd = e;
        best = c;
      }
    }
  }
  if (!best) {
    bd = 2.6;
    for (const b of G.buildings) {
      if (b.dead || !hostile(u.owner, b.owner)) continue;
      const e = dist(b.x + 0.5, b.y + 0.5, u.x, u.y);
      if (e < bd) {
        bd = e;
        best = b;
      }
    }
  }
  const had = u.tgt;
  u.tgt = best ? best.id : 0;
  if (had && !u.tgt && u.dest) {
    u.path = findPath(u.x | 0, u.y | 0, u.dest[0], u.dest[1]);
  }
}

export function hit(
  t: Entity,
  dmg: number,
  owner: number,
  x1: number,
  y1: number,
) {
  t.hp -= dmg;
  t.lastHit = G.t;
  if (t.kind === 'u' && t.n > 1) memberLoss(t, owner);
  G.shots.push({
    x1,
    y1,
    x2: centerX(t),
    y2: centerY(t),
    t: 0.12,
    c: COLORS[owner],
  });
  if (t.hp <= 0) {
    if (t.kind === 'c' && !t.dead) {
      const p = G.players[owner];
      let sum = 0;
      for (const k of RESOURCES) {
        const v = Math.floor(t.cargo[k] * 0.5);
        p.res[k] += v;
        sum += v;
      }
      p.stats.loot += sum;
      if (sum)
        G.fx.push({
          x: t.x,
          y: t.y,
          t: 0,
          dur: 1.2,
          text: '+' + sum,
          color: COLORS[owner],
        });
    }
    kill(t, false, owner);
  }
}

export function fire(u: Unit, t: Entity) {
  const S = UNITS[u.type];
  if (!S.dmg) return;
  let dmg = S.dmg * (u.n || 1) * (u.supplied ? 1 : 0.6);
  if (S.noAmmo) u.cd = S.cd * (0.9 + rand() * 0.2);
  else if (u.ammo >= 1) {
    u.ammo -= 1;
    u.cd = S.cd * (0.9 + rand() * 0.2);
  } else {
    dmg *= 0.25;
    u.cd = S.cd * 1.6;
  }
  if (t.kind === 'c') dmg *= S.vsC;
  else if (t.kind === 'b') dmg *= S.vsB;
  else if (t.kind === 'u') {
    if (t.type === 'wagon') dmg *= Math.max(1, S.vsC);
    else if (S.vsU) dmg *= S.vsU;
  }
  if (u.type === 'siege') {
    G.fx.push({
      x: centerX(t),
      y: centerY(t),
      t: 0,
      dur: 0.5,
      r: 0.9,
      color: '#ffb27a',
    });
  }
  if (t.kind === 'b' && t.type === 'hq' && t.owner !== u.owner)
    G.players[u.owner].stats.hqDmg += dmg;
  hit(t, dmg, u.owner, u.x, u.y);
}
