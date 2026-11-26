/** Targeting, shooting, damage, death and elimination. */
import { Color } from '@kingmap-rts/kingsmap-types';
import type { Building, Entity, Unit } from '../world/types';
import { RESOURCES } from '../config/economy';
import { COLORS, MAP_W, SEATS } from '../config/map';
import { UNITS } from '../config/units';
import { G } from '../state';
import { hostile } from './diplomacy';
import { findPath } from './pathfinding';
import { memberLoss } from './squads';
import { takeable } from './capture';
import { taskLive } from './sabotage';
import { dist, segmentDist, tileIndex, vecLen } from '../util/geometry';
import { walkable } from '../world/terrain';
import { rand } from '../util/rng';
import { lootCarried, centerX, centerY } from '../world/entities';
import { logEvent, msg, notify } from '../world/events';
import { gain } from '../ledger';
import { unitsNear } from '../world/unitGrid';

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
          color: Color.Hit,
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

/** a melee unit: fights hand to hand (squads of it take sides around a foe) */
export const melee = (u: Unit) => UNITS[u.type].range <= 2;

/**
 * The four sides of a foe a melee unit fights from: front, left flank, right flank, rear. They are
 * laid out along the way the foe faces its own fight (its target), or the way it faces when it
 * fights nobody. Each side takes one unit of each seat; a foe with every side taken counts as farther
 * away for the next attacker (acquireTarget), so attackers spread over the enemy.
 */
const SIDES = 4;

/** attackers of each seat on each side of each foe (key: foe id * SEATS + seat), built once per tick */
const sides = new Map<number, number[]>();

/** how much farther a foe looks for every unit of ours already attacking it, tiles */
const CROWD = 0.5;

/** how much farther a foe with all four sides taken by our troops looks, tiles */
const SURROUNDED = 3;

/** how much farther a unit waiting behind a surrounded foe looks for another, tiles */
const WAIT_LOOK = 2.5;

/** how far from an ordered foe that is surrounded a unit looks for another one to fight, tiles */
const ASIDE = 3;

/** units of each seat on each target (key: target id * SEATS + seat), counted once per tick */
const onTarget = new Map<number, number>();

/** the way foe t faces its fight: toward its own unit target, else its facing */
function frontOf(t: Unit): [number, number] {
  const o = t.tgt ? G.byId.get(t.tgt) : null;
  if (o && !o.dead && o.kind === 'u') {
    const dx = o.x - t.x;
    const dy = o.y - t.y;
    const l = vecLen(dx, dy);
    if (l > 1e-3) return [dx / l, dy / l];
  }
  return [t.hx, t.hy];
}

/** how far from foe t's centre unit u stands to strike it: shoulder to shoulder */
export const touch = (u: Unit, t: Unit) => bodyR(u) + bodyR(t) + 0.05;

/** where side k of foe t is for unit u (tiles) */
export function sideSpot(u: Unit, t: Unit, k: number): [number, number] {
  const [fx, fy] = frontOf(t);
  // front, its left (seen from the foe), its right, behind it
  const dx = k === 0 ? fx : k === 1 ? fy : k === 2 ? -fy : -fx;
  const dy = k === 0 ? fy : k === 1 ? -fx : k === 2 ? fx : -fy;
  const r = touch(u, t);
  return [t.x + dx * r, t.y + dy * r];
}

/**
 * The side of foe t unit u takes: the one it already holds, else the free side nearest to it (one
 * on water or a mountain does not count), -1 when every side is taken by its mates.
 */
export function takeSide(u: Unit, t: Unit): number {
  const key = t.id * SEATS + u.owner;
  let held = sides.get(key);
  if (!held) {
    held = new Array(SIDES).fill(0);
    sides.set(key, held);
  }
  if (u.slot >= 0 && held[u.slot] === u.id) return u.slot;
  if (u.slot >= 0 && !held[u.slot]) {
    held[u.slot] = u.id;
    return u.slot;
  }
  let best = -1;
  let bd = 1e9;
  for (let k = 0; k < SIDES; k++) {
    if (held[k] || !open(u, t, k)) continue;
    const [x, y] = sideSpot(u, t, k);
    const d = dist(u.x, u.y, x, y);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  if (best >= 0) held[best] = u.id;
  return best;
}

export function countTargets() {
  onTarget.clear();
  sides.clear();
  fightAt.clear();
  indexBodies();
  for (const u of G.units) {
    if (u.dead || !u.tgt) continue;
    const t = G.byId.get(u.tgt);
    if (t && !t.dead && t.kind === 'u')
      fightAt.add(((u.y | 0) * MAP_W + (u.x | 0)) * SEATS + u.owner);
    const k = u.tgt * SEATS + u.owner;
    onTarget.set(k, (onTarget.get(k) ?? 0) + 1);
    // the sides held since the last tick stay held (first come, first kept)
    if (u.slot < 0) continue;
    let held = sides.get(k);
    if (!held) {
      held = new Array(SIDES).fill(0);
      sides.set(k, held);
    }
    if (held[u.slot]) u.slot = -1;
    else held[u.slot] = u.id;
  }
}

/**
 * Side k of foe t is open to u: on walkable ground, nobody else's body stands there (in a line of
 * squads the flanks are their neighbours' places), and u can get there without going through t.
 */
function open(u: Unit, t: Unit, k: number) {
  const [x, y] = sideSpot(u, t, k);
  if (!walkable(x | 0, y | 0)) return false;
  for (const i of bodiesNear(x, y)) {
    const o = G.units[i];
    if (o === u || o === t || o.dead) continue;
    if (dist(o.x, o.y, x, y) < bodyR(o) + bodyR(u) * 0.5) return false;
  }
  // the way there passes the foe's body: that side is behind it
  return segmentDist(t.x, t.y, u.x, u.y, x, y) >= touch(u, t) * 0.8;
}

/**
 * u stands at rest (its march over, no order to walk past foes) while its mates right next to it
 * fight: it looks a little farther for a foe, so the back ranks of a group join the fight in front
 * of them instead of watching it
 */
function joinsMates(u: Unit) {
  if (!melee(u) || u.order === 'move' || (u.path && u.path.length))
    return false;
  const cx = u.x | 0;
  const cy = u.y | 0;
  for (let y = cy - MATES; y <= cy + MATES; y++)
    for (let x = cx - MATES; x <= cx + MATES; x++)
      if (fightAt.has((y * MAP_W + x) * SEATS + u.owner)) return true;
  return false;
}

/**
 * u marches on an attack-move (KAN-61): it looks this much farther for foes than one standing, so a
 * foe a little off the way is not walked past
 */
const MARCH_LOOK = 1;

/**
 * a unit on an attack-move (marching or at rest) turns on a foe that strikes it from this far
 * (a trebuchet shoots from 5 tiles, farther than any soldier looks), tiles
 */
const STRUCK_LOOK = 7;

const marching = (u: Unit) =>
  u.order === 'amove' && !u.ftgt && !!(u.path && u.path.length);

/** the foe t attacks u: u may answer it from farther than it would look for a foe (KAN-61) */
const strikes = (t: Entity, u: Unit) =>
  t.kind === 'u' && u.order === 'amove' && t.tgt === u.id && !t.dead;

/** how far u runs after its foe t before it gives the chase up (without an attack order), tiles */
export function chaseReach(u: Unit, t: Entity) {
  const r = UNITS[u.type].aggro * 1.7;
  return strikes(t, u) ? Math.max(r, STRUCK_LOOK + 0.5) : r;
}

/** how near a mate must fight for a unit at rest to join in, tiles */
const MATES = 3;

/** tiles where units of a seat fight a unit this tick (key: tile index * SEATS + seat) */
const fightAt = new Set<number>();

/** u has no side of foe t to fight from: each is held by its mates or closed */
function surrounded(u: Unit, t: Unit) {
  const held = sides.get(t.id * SEATS + u.owner);
  for (let k = 0; k < SIDES; k++) {
    const id = held ? held[k] : 0;
    if (id === u.id) return false;
    if (!id && open(u, t, k)) return false;
  }
  return true;
}

/** units on each tile (tile index -> indices into G.units, ascending), see indexBodies */
const cells = new Map<number, number[]>();

/** files every unit under its tile; call when positions changed (once per tick, and before separation) */
export function indexBodies() {
  cells.clear();
  const us = G.units;
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (a.dead) continue;
    const k = (a.y | 0) * MAP_W + (a.x | 0);
    const c = cells.get(k);
    if (c) c.push(i);
    else cells.set(k, [i]);
  }
}

const near: number[] = [];

/** indices of the units on the 3x3 tiles around (x, y), as filed by indexBodies (ascending per tile) */
export function bodiesNear(x: number, y: number): number[] {
  near.length = 0;
  const cx = x | 0;
  const cy = y | 0;
  for (let oy = -1; oy <= 1; oy++)
    for (let ox = -1; ox <= 1; ox++) {
      const c = cells.get((cy + oy) * MAP_W + cx + ox);
      if (c) for (const j of c) near.push(j);
    }
  return near;
}

/**
 * A foe of u fighting it hand to hand gets a free blow when u turns its back to walk away: the price
 * of leaving a fight (see orderMove).
 */
export function partingBlows(u: Unit) {
  if (u.dead) return;
  // (a melee unit reaches 2 tiles at most)
  for (const i of unitsNear(u.x, u.y, 2)) {
    const e = G.units[i];
    if (e.dead || e.tgt !== u.id || !melee(e) || !UNITS[e.type].dmg) continue;
    if (!hostile(e.owner, u.owner)) continue;
    if (dist(e.x, e.y, u.x, u.y) > UNITS[e.type].range) continue;
    fire(e, u, PARTING);
    if (u.dead) return;
  }
}

/** a post that troops can still be ordered to capture from seat (whether these troops may: canCapture) */
export function capturable(b: Entity | undefined, seat: number): b is Building {
  return (
    !!b && !b.dead && b.kind === 'b' && takeable(b) && hostile(seat, b.owner)
  );
}

export function acquireTarget(u: Unit) {
  // a capture order lapses once the post is ours (or an ally's), destroyed, or linked again
  if (u.capB && !capturable(G.byId.get(u.capB), u.owner)) u.capB = 0;
  if (u.type === 'wagon') {
    u.tgt = 0;
    return;
  }
  // a road task (KAN-60) lapses once the road is done or gone (or the unit walks to its squad)
  if (u.task && (u.joinTo || !taskLive(u))) u.task = null;
  if (u.task) {
    // on its way it turns aside for nobody; at its spot it strikes only a foe within reach
    const t = u.path && u.path.length ? null : foeInReach(u);
    const id = t ? t.id : 0;
    if (u.tgt !== id) u.slot = -1;
    u.tgt = id;
    return;
  }
  if (u.order === 'move' && u.path && u.path.length && !u.ftgt) {
    u.tgt = 0;
    return;
  }
  // a soldier on its way to its squad does not turn aside for foes: it fights once it is in
  if (u.joinTo && !u.ftgt) {
    u.tgt = 0;
    u.slot = -1;
    return;
  }
  if (u.ftgt) {
    const f = G.byId.get(u.ftgt);
    if (f && !f.dead) {
      let t: Entity = f;
      // the ordered foe has all its sides taken by our troops: fight one beside it meanwhile
      if (f.kind === 'u' && melee(u) && surrounded(u, f)) {
        let bd = ASIDE;
        for (const i of unitsNear(f.x, f.y, ASIDE)) {
          const o = G.units[i];
          if (o.dead || o === f || !hostile(u.owner, o.owner)) continue;
          if (Math.abs(o.x - f.x) > bd || Math.abs(o.y - f.y) > bd) continue;
          const e = dist(o.x, o.y, f.x, f.y);
          if (e < bd && !surrounded(u, o)) {
            bd = e;
            t = o;
          }
        }
      }
      if (u.tgt !== t.id) u.slot = -1;
      u.tgt = t.id;
      return;
    }
    u.ftgt = 0;
  }
  const S = UNITS[u.type];
  // a melee unit keeps the foe it fights or runs at while that foe is near: no hopping from one
  // foe to another every scan (a chase that leads nowhere lapses in update)
  // (unless it only waits behind a foe our troops already surround: then it looks a little farther
  // for one with a side free)
  let waiting = false;
  if (u.tgt && melee(u)) {
    const t = G.byId.get(u.tgt);
    if (
      t &&
      !t.dead &&
      t.kind === 'u' &&
      hostile(u.owner, t.owner) &&
      dist(t.x, t.y, u.x, u.y) < chaseReach(u, t)
    ) {
      if (u.slot >= 0 || !surrounded(u, t)) return;
      waiting = true;
    }
  }
  let best = null;
  let bd =
    S.aggro +
    (waiting || joinsMates(u) ? WAIT_LOOK : marching(u) ? MARCH_LOOK : 0);

  if (u.type === 'siege') {
    // artillery prefers buildings in range, never chases: a trebuchet is a siege engine, it shells
    // the enemy buildings it stands in range of by itself (but never the post it was sent to capture)
    let bb = null;
    let bdd = S.range + 0.4;
    for (const b of G.buildings) {
      if (b.dead || b.id === u.capB || !hostile(u.owner, b.owner)) continue;
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
  const answers = u.order === 'amove' && S.aggro > 0;
  let striker: Unit | null = null;
  let sd = STRUCK_LOOK;
  for (const i of unitsNear(u.x, u.y, answers ? Math.max(bd, sd) : bd)) {
    const o = G.units[i];
    if (o.dead || !hostile(u.owner, o.owner)) continue;
    if (answers && o.tgt === u.id) {
      const e = dist(o.x, o.y, u.x, u.y);
      if (e < sd) {
        sd = e;
        striker = o;
      }
    }
    const d = Math.abs(o.x - u.x) + Math.abs(o.y - u.y);
    if (d > bd * 1.5) continue;
    const e = dist(o.x, o.y, u.x, u.y);
    if (e >= bd) continue;
    const crowd =
      (onTarget.get(o.id * SEATS + u.owner) ?? 0) - (u.tgt === o.id ? 1 : 0);
    // (a foe none of ours fights yet has its sides free, barring the odd body in the way)
    const sc =
      e +
      CROWD * crowd +
      (crowd > 0 && melee(u) && surrounded(u, o) ? SURROUNDED : 0);
    if (sc < bs) {
      bs = sc;
      best = o;
    }
  }
  // nobody near: on an attack-move, a foe striking it from afar (a trebuchet) is answered
  if (!best) best = striker;
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
  // (troops never pick a building by themselves: only the attack order sends them at one, ftgt above;
  // the siege engines are the exception, see above)
  const had = u.tgt;
  u.tgt = best ? best.id : 0;
  if (u.tgt !== had) u.slot = -1;
  if (had && !u.tgt && u.dest) {
    u.path = findPath(u.x | 0, u.y | 0, u.dest[0], u.dest[1]);
  }
}

/** the nearest foe (a unit, else a caravan) unit u reaches from where it stands, or null */
function foeInReach(u: Unit): Entity | null {
  const r = UNITS[u.type].range;
  let best: Entity | null = null;
  let bd = r;
  for (const i of unitsNear(u.x, u.y, r)) {
    const o = G.units[i];
    if (o.dead || !hostile(u.owner, o.owner)) continue;
    if (Math.abs(o.x - u.x) > bd || Math.abs(o.y - u.y) > bd) continue;
    const e = dist(o.x, o.y, u.x, u.y);
    if (e <= bd) {
      bd = e;
      best = o;
    }
  }
  if (best) return best;
  for (const c of G.convoys) {
    if (c.dead || !hostile(u.owner, c.owner)) continue;
    const e = dist(c.x, c.y, u.x, u.y);
    if (e <= bd) {
      bd = e;
      best = c;
    }
  }
  return best;
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
        gain(p.id, k, 'loot', v);
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

/** a free blow at a foe that turns its back on the fight */
export const PARTING = 1.5;
/** the first blow of a charge (after running at the foe at least CHARGE_RUN tiles) */
const CHARGE = 1.5;
const CHARGE_RUN = 1.5;
/** blows at a foe's flank and at its back */
const FLANK = 1.25;
const REAR = 1.5;
/** hand-to-hand fights between troops go this much faster than the plain numbers say */
const MELEE_PACE = 1.25;
/** soldiers of a squad that strike at full strength in melee; those behind them add half each */
const FRONT_RANK = 3;

/** soldiers whose blows count: in melee only the front rank strikes fully */
export function strikers(u: Unit) {
  const n = u.n || 1;
  if (!melee(u)) return n;
  return Math.min(n, FRONT_RANK) + 0.5 * Math.max(0, n - FRONT_RANK);
}

/** how much harder a melee blow of u lands on unit t: from its flank or its back, or as a charge */
export function blowBonus(u: Unit, t: Unit) {
  let m = 1;
  if (u.chg >= CHARGE_RUN) m *= CHARGE;
  const dx = u.x - t.x;
  const dy = u.y - t.y;
  const l = vecLen(dx, dy);
  if (l > 1e-3) {
    // which side of t u stands on, seen along the way t faces its fight
    const [fx, fy] = frontOf(t);
    const c = (dx * fx + dy * fy) / l;
    if (c < -0.5) m *= REAR;
    else if (c < 0.5) m *= FLANK;
  }
  return m;
}

export function fire(u: Unit, t: Entity, mult = 1) {
  const S = UNITS[u.type];
  if (!S.dmg) return;
  let dmg = S.dmg * strikers(u) * (u.supplied ? 1 : 0.6) * mult;
  if (t.kind === 'u' && melee(u) && t.type !== 'wagon')
    dmg *= MELEE_PACE * blowBonus(u, t);
  u.chg = 0;
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
      color: Color.Spark,
    });
  }
  if (t.kind === 'b' && t.type === 'hq' && t.owner !== u.owner)
    G.players[u.owner].stats.hqDmg += dmg;
  hit(t, dmg, u.owner, u.x, u.y);
}
