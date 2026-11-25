/** Squads: several soldiers of one type that walk and fight as one unit. */
import type { GameMessage, Player, Unit, UnitType } from '../world/types';
import { RESOURCES } from '../config/economy';
import { HEAVY_UNITS } from '../config/units';
import { G } from '../state';
import { kill } from './combat';
import { walkTo } from './movement';
import { dist } from '../util/geometry';
import { addUnit } from '../world/entities';
import { msg } from '../world/events';

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

export function formSquads(
  p: Player,
  ids: number[],
  quiet?: boolean,
): GameMessage | null {
  const us = ids
    .map(id => G.byId.get(id))
    .filter(
      (u): u is Unit => !!u && !u.dead && u.kind === 'u' && u.owner === p.id,
    )
    .sort((a, b) => (b.n || 1) - (a.n || 1) || a.id - b.id);
  const size = new Map(us.map(u => [u.id, u.n || 1]));
  let moved = 0;
  for (const u of us) {
    u.solo = false;
  }
  for (let i = us.length - 1; i > 0; i--) {
    const u = us[i];
    if (size.get(u.id) !== (u.n || 1)) continue;
    for (let k = 0; k < i; k++) {
      const t = us[k];
      if (
        t.type !== u.type ||
        !canJoin(u, t) ||
        size.get(t.id)! >= squadSize(u.type)
      )
        continue;
      const give = Math.min(u.n || 1, squadSize(u.type) - size.get(t.id)!);
      size.set(t.id, size.get(t.id)! + give);
      size.set(u.id, (u.n || 1) - give);
      u.joinTo = t.id;
      walkTo(u, t);
      u.tgt = 0;
      u.ftgt = 0;
      u.job = null;
      moved++;
      break;
    }
  }
  if (!moved) return quiet ? null : msg('error.squadNeedsSame');
  return null;
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
        u.x + Math.cos(a) * 0.6,
        u.y + Math.sin(a) * 0.6,
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

export function squadTick() {
  // soldiers walking to their squad merge on arrival
  for (const u of G.units) {
    if (u.dead || !u.joinTo) continue;
    const t = G.byId.get(u.joinTo);
    if (!t || t.kind !== 'u' || !canJoin(u, t)) {
      u.joinTo = 0;
      continue;
    }
    if (dist(u.x, u.y, t.x, t.y) <= 1.3) {
      mergeInto(t, u);
      continue;
    }
    if (!u.path || !u.path.length) walkTo(u, t);
  }
  // idle free soldiers of a bot find a mate of their type nearby; a human
  // player's soldiers stay single until grouped by hand (formSquads)
  for (const p of G.players) {
    if (!p.alive || !p.bot || (p.ai && p.ai.P && p.ai.P.noSquad)) continue;
    const free = G.units.filter(
      u =>
        !u.dead &&
        u.owner === p.id &&
        !u.solo &&
        !u.joinTo &&
        (u.n || 1) < squadSize(u.type),
    );
    const used = new Set();
    for (const u of free) {
      if (used.has(u.id) || !isIdle(u)) continue;
      let best = null;
      let bs = -1e9;
      for (const v of free) {
        if (v === u || used.has(v.id) || !canJoin(u, v)) continue;
        const d = dist(u.x, u.y, v.x, v.y);
        if (d > 6) continue;
        if (!isIdle(v) && !(v.n > 1)) continue;
        const sc = (v.n || 1) * 10 - d;
        if (sc > bs) {
          bs = sc;
          best = v;
        }
      }
      if (!best) continue;
      // the smaller group walks to the bigger one
      let a = u;
      let b = best;
      if (
        (a.n || 1) > (b.n || 1) ||
        ((a.n || 1) === (b.n || 1) && a.id < b.id)
      ) {
        a = best;
        b = u;
      }
      if (!isIdle(a)) continue;
      a.joinTo = b.id;
      walkTo(a, b);
      used.add(a.id);
      used.add(b.id);
    }
  }
}
