/** Squads: several soldiers of one type that walk and fight as one unit. */
import type { GameMessage, Player, Unit, UnitType } from '../world/types';
import { RESOURCES } from '../config/economy';
import { HEAVY_UNITS } from '../config/units';
import { G } from '../state';
import { kill } from './combat';
import { walkTo } from './movement';
import { findPath } from './pathfinding';
import { detCos, detSin, dist } from '../util/geometry';
import { addUnit } from '../world/entities';
import { msg } from '../world/events';
import { walkable } from '../world/terrain';

export const squadSize = (type: UnitType) => (HEAVY_UNITS.has(type) ? 3 : 5);

export const soldierCount = (a: Unit[]) => {
  let s = 0;
  for (const u of a) s += u.n || 1;
  return s;
};

/** a can walk over to b and hand it soldiers (as many as b has room for) */
export function canJoin(a: Unit, b: Unit) {
  return (
    a !== b &&
    !a.dead &&
    !b.dead &&
    a.owner === b.owner &&
    a.type === b.type &&
    (b.n || 1) < squadSize(b.type) &&
    !!a.expire === !!b.expire
  );
}

export function mergeInto(b: Unit, a: Unit) {
  const room = squadSize(b.type) - b.n;
  if (room <= 0) {
    a.joinTo = 0;
    return;
  }
  if (a.n > room) {
    // hand over only what fits; the rest stays a smaller squad
    const per = a.hp / a.n;
    const k = room;
    b.ammo = (b.ammo * b.n + a.ammo * k) / (b.n + k);
    b.hp += per * k;
    b.n += k;
    b.maxhp = b.n * b.mhp;
    if (b.hp > b.maxhp) b.hp = b.maxhp;
    a.hp -= per * k;
    a.n -= k;
    a.maxhp = a.n * a.mhp;
    a.joinTo = 0;
    b.solo = false;
    return;
  }
  const tot = b.n + a.n;
  b.ammo = (b.ammo * b.n + a.ammo * a.n) / tot;
  b.hp += a.hp;
  b.n = tot;
  b.mhp = Math.max(b.mhp, a.mhp);
  b.maxhp = b.n * b.mhp;
  if (b.hp > b.maxhp) b.hp = b.maxhp;
  if (a.cargo && b.cargo) {
    b.cargo.steel += a.cargo.steel;
    b.cargo.food += a.cargo.food;
  }
  if (a.bag) {
    if (!b.bag) b.bag = { wood: 0, ore: 0, steel: 0, food: 0, crystal: 0 };
    for (const k of RESOURCES) b.bag[k] += a.bag[k] || 0;
  }
  if (a.expire) b.expire = Math.min(b.expire || a.expire, a.expire);
  b.solo = false;
  a.joinTo = 0;
  kill(a, true);
}

/** soldiers of a squad fall one by one as its health drops */
export function memberLoss(u: Unit, by: number) {
  let lost = 0;
  while (u.n > 1 && u.hp <= (u.n - 1) * u.mhp + 1e-6) {
    u.n--;
    lost++;
  }
  if (!lost) return;
  u.maxhp = u.n * u.mhp;
  const vs = G.players[u.owner].stats;
  vs.unitsLost += lost;
  if (by != null && by >= 0) G.players[by].stats.kills += lost;
  else vs.starved += lost;
}

/**
 * «Squad» on a selection: soldiers of one type merge with their nearest mates, so a big army forms
 * up in a few seconds without anyone crossing the whole crowd (see gather).
 */
export function formSquads(
  p: Player,
  ids: number[],
  quiet?: boolean,
): GameMessage | null {
  const us = ids
    .map(id => G.byId.get(id))
    .filter(
      (u): u is Unit => !!u && !u.dead && u.kind === 'u' && u.owner === p.id,
    );
  for (const u of us) {
    u.solo = false;
    u.joinTo = 0;
  }
  if (!gather(p.id, us, () => true))
    return quiet ? null : msg('error.squadNeedsSame');
  return null;
}

/**
 * Sends units of a seat to merge into squads with their nearest mates; returns how many set off.
 * The biggest units are the anchors, taken from the edge of the crowd inward (an anchor stays where
 * it is, so the last soldiers left over stand next to each other); each anchor takes its nearest
 * mates that fit until it is full, counting those already on their way to it. Only units that
 * `walks` lets go set off to an anchor.
 */
function gather(owner: number, us: Unit[], walks: (u: Unit) => boolean) {
  const picked = new Set(us.map(u => u.id));
  // soldiers already on their way to one of these take its room
  const coming = new Map<number, number>();
  for (const u of G.units)
    if (!u.dead && u.joinTo && u.owner === owner && !picked.has(u.id))
      coming.set(u.joinTo, (coming.get(u.joinTo) || 0) + (u.n || 1));
  let moved = 0;
  const left = us.slice().sort((a, b) => a.id - b.id);
  while (left.length) {
    let cx = 0;
    let cy = 0;
    for (const u of left) {
      cx += u.x;
      cy += u.y;
    }
    cx /= left.length;
    cy /= left.length;
    let ti = 0;
    let tn = -1;
    let td = -1;
    for (let i = 0; i < left.length; i++) {
      const u = left[i];
      const d = dist(u.x, u.y, cx, cy);
      if ((u.n || 1) > tn || ((u.n || 1) === tn && d > td)) {
        ti = i;
        tn = u.n || 1;
        td = d;
      }
    }
    const t = left.splice(ti, 1)[0];
    let room = squadSize(t.type) - (t.n || 1) - (coming.get(t.id) || 0);
    while (room > 0) {
      // the nearest mate that fits whole, else the nearest that can hand over part of its soldiers
      let best = -1;
      let bd = 1e9;
      let part = -1;
      let pd = 1e9;
      for (let i = 0; i < left.length; i++) {
        const u = left[i];
        if (!canJoin(u, t) || !walks(u)) continue;
        const d = dist(u.x, u.y, t.x, t.y);
        if ((u.n || 1) <= room) {
          if (d < bd) {
            bd = d;
            best = i;
          }
        } else if (d < pd) {
          pd = d;
          part = i;
        }
      }
      const i = best >= 0 ? best : part;
      if (i < 0) break;
      const u = left[i];
      left.splice(i, 1);
      room -= Math.min(u.n || 1, room);
      u.joinTo = t.id;
      u.tgt = 0;
      u.ftgt = 0;
      u.capB = 0;
      u.slot = -1;
      u.job = null;
      u.order = 'amove';
      walkTo(u, t);
      moved++;
    }
  }
  return moved;
}

export function unsquad(p: Player, ids: number[]): GameMessage | null {
  let n = 0;
  for (const id of ids) {
    const u = G.byId.get(id);
    if (!u || u.kind !== 'u' || u.dead || u.owner !== p.id || (u.n || 1) < 2)
      continue;
    const per = u.hp / u.n;
    for (let i = 1; i < u.n; i++) {
      const a = i * 2.4;
      const m = addUnit(
        u.type,
        u.owner,
        u.x + detCos(a) * 0.6,
        u.y + detSin(a) * 0.6,
      );
      m.hp = Math.min(per, m.maxhp);
      m.ammo = u.ammo;
      m.solo = true;
      if (u.expire) m.expire = u.expire;
    }
    u.n = 1;
    u.hp = Math.min(per, u.mhp);
    u.maxhp = u.mhp;
    u.solo = true;
    u.joinTo = 0;
    n++;
  }
  return n ? null : msg('error.noSquads');
}

export const isIdle = (u: Unit) =>
  !u.tgt && !(u.path && u.path.length) && !(u.job && u.jobUntil > G.t);

/** how far a bot's idle soldier looks for mates to squad with, tiles */
const GATHER = 6;

/** a soldier this near its squad steps in, tiles */
const MERGE = 1.3;

/** this near its squad a soldier walks straight at it instead of along a path, tiles */
const STRAIGHT = 3;

/** nothing but walkable ground on the straight line from (x0, y0) to (x1, y1) */
function clearLine(x0: number, y0: number, x1: number, y1: number) {
  const k = Math.ceil(dist(x0, y0, x1, y1) / 0.2);
  for (let i = 1; i <= k; i++) {
    const x = x0 + ((x1 - x0) * i) / k;
    const y = y0 + ((y1 - y0) * i) / k;
    if (!walkable(x | 0, y | 0)) return false;
  }
  return true;
}

/**
 * Every tick: soldiers on their way to a squad merge on arrival. A soldier heads for where its squad
 * stands, or for where it marches to when that is farther off, so it neither chases the squad's
 * old spot nor runs after it from behind; close by it walks straight at it.
 */
export function joinTick() {
  for (const u of G.units) {
    if (u.dead || !u.joinTo) continue;
    const t = G.byId.get(u.joinTo);
    if (!t || t.kind !== 'u' || !canJoin(u, t)) {
      u.joinTo = 0;
      u.path = null;
      u.dest = null;
      u.end = null;
      continue;
    }
    const d = dist(u.x, u.y, t.x, t.y);
    if (d <= MERGE) {
      mergeInto(t, u);
      continue;
    }
    if (d <= STRAIGHT && clearLine(u.x, u.y, t.x, t.y)) {
      u.path = [[t.x | 0, t.y | 0]];
      u.dest = [t.x | 0, t.y | 0];
      u.end = [t.x, t.y];
      u.gsp = 1;
      continue;
    }
    // the squad marches off: meet it where it is going
    const goal =
      t.path && t.path.length && t.dest ? t.dest : [t.x | 0, t.y | 0];
    const far =
      !u.dest ||
      Math.abs(u.dest[0] - goal[0]) > 1 ||
      Math.abs(u.dest[1] - goal[1]) > 1;
    if (!u.path || !u.path.length || far) {
      u.path = findPath(u.x | 0, u.y | 0, goal[0], goal[1]);
      u.dest = [goal[0], goal[1]];
      u.end = null;
      u.gsp = 1;
      // no way there: the soldier stays where it is, single
      if (!u.path) {
        u.joinTo = 0;
        u.dest = null;
      }
    }
  }
}

/** every half a second: idle soldiers of a bot gather into squads */
export function squadTick() {
  // idle free soldiers of a bot gather with their mates of a type nearby (a squad on the march takes
  // them in too); a human player's soldiers stay single until grouped by hand (formSquads)
  for (const p of G.players) {
    if (!p.alive || !p.bot || (p.ai && p.ai.P && p.ai.P.noSquad)) continue;
    const free = G.units.filter(
      u =>
        !u.dead &&
        u.owner === p.id &&
        !u.solo &&
        !u.joinTo &&
        (u.n || 1) < squadSize(u.type) &&
        (isIdle(u) || u.n > 1),
    );
    const used = new Set<number>();
    for (const u of free) {
      if (used.has(u.id) || !isIdle(u)) continue;
      const near = free.filter(
        v =>
          !used.has(v.id) &&
          v.type === u.type &&
          !!v.expire === !!u.expire &&
          dist(u.x, u.y, v.x, v.y) <= GATHER,
      );
      for (const v of near) used.add(v.id);
      if (near.length > 1) gather(p.id, near, isIdle);
    }
  }
}
