/** Moving along paths and move/attack orders. */
import type { Building, Entity, Tile, Unit } from '../world/types';
import { MAP_H, MAP_W } from '../config/map';
import { UNITS } from '../config/units';
import { G } from '../state';
import { laneExit, onLane, overWater, stepsAshore } from './bridges';
import { bodiesNear, bodyR, partingBlows } from './combat';
import { findPath } from './pathfinding';
import {
  detAtan2,
  dist,
  segmentDist,
  tileIndex,
  vecLen,
} from '../util/geometry';
import { paceAt, walkable } from '../world/terrain';

export function moveToward(
  e: Unit,
  tx: number,
  ty: number,
  speed: number,
  dt: number,
) {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = vecLen(dx, dy);
  if (d < 1e-4) return true;
  // faster on a road, slower in a forest: the tile the unit stands on sets the pace
  const sp = speed * paceAt(tileIndex(e.x | 0, e.y | 0)) * dt;
  const st = Math.min(sp, d);
  const nx = e.x + (dx / d) * st;
  const ny = e.y + (dy / d) * st;
  e.ang = detAtan2(dy, dx);
  turn(e, dx / d, dy / d);
  if (walkable(nx | 0, ny | 0)) {
    e.x = nx;
    e.y = ny;
  } else if (walkable(nx | 0, e.y | 0)) {
    e.x = nx;
  } else if (walkable(e.x | 0, ny | 0)) {
    e.y = ny;
  } else return false;
  e.mv = 1;
  return st >= d;
}

/**
 * turns a unit's facing toward the unit vector (dx, dy): half the way each tick, so a squad swings
 * round over a few tenths of a second instead of snapping (an about-turn goes by its right hand)
 */
export function turn(u: Unit, dx: number, dy: number) {
  let x = u.hx + (dx - u.hx) * 0.5;
  let y = u.hy + (dy - u.hy) * 0.5;
  let l = vecLen(x, y);
  if (l < 1e-3) {
    x = -u.hy;
    y = u.hx;
    l = 1;
  }
  u.hx = x / l;
  u.hy = y / l;
}

/** the last waypoint counts as reached this close to its centre (to the exact end point: END) */
const ARRIVE = 0.25;
const END = 0.06;

/** this close to its place in the ranks, a unit that a mate standing still bars from it stops, tiles */
const CROWD_END = 0.6;

/**
 * a mate of u standing still (arrived, not fighting) is in u's way to the point (x, y) where u is to
 * stop: u stops short instead of shoving it aside tick after tick (a crowd pushing to its exact
 * places in a narrow spot shakes) (KAN-57)
 */
function blocked(u: Unit, x: number, y: number) {
  // (a soldier on its way to merge with its squad squeezes on through)
  if (u.joinTo) return false;
  const d = dist(u.x, u.y, x, y);
  for (const j of bodiesNear(u.x, u.y)) {
    const o = G.units[j];
    if (o === u || o.dead || o.owner !== u.owner || o.tgt) continue;
    if (o.path && o.path.length) continue;
    const rr = bodyR(o) + bodyR(u);
    const od = dist(o.x, o.y, x, y);
    // on u's place, or ahead of u on its way there
    if (od < rr) return true;
    if (od < d && segmentDist(o.x, o.y, u.x, u.y, x, y) < rr) return true;
  }
  return false;
}

export function followPath(e: Unit, speed: number, dt: number) {
  const p = e.path;
  if (!p || !p.length) return true;
  // a waypoint on the way is passed as soon as the unit stands in its tile: it never has to hit
  // the exact centre (separation keeps units apart, so two of them sharing a waypoint would block
  // each other there forever), and no tick is spent on the last few hundredths of a tile.
  // Heading from anywhere in a tile to the centre of the next one stays on walkable ground:
  // A* never cuts a corner.
  while (p.length > 1 && (e.x | 0) === p[0][0] && (e.y | 0) === p[0][1])
    p.shift();
  const [wx, wy] = p[0];
  // a group march ends at the unit's exact place in the ranks, not at its tile's centre
  const exact =
    p.length === 1 && !!e.end && walkable(e.end[0] | 0, e.end[1] | 0);
  let tx = exact ? e.end![0] : wx + 0.5;
  let ty = exact ? e.end![1] : wy + 0.5;
  // on a bridge (or by its end) troops walk its middle line in single file
  const lane = exact ? null : onLane(tx, ty);
  if (lane) [tx, ty] = lane;
  if (
    p.length === 1 &&
    (dist(e.x, e.y, tx, ty) < (exact ? END : ARRIVE) ||
      (exact && dist(e.x, e.y, tx, ty) < CROWD_END && blocked(e, tx, ty)))
  ) {
    p.shift();
    return true;
  }
  const x0 = e.x;
  const y0 = e.y;
  // over a bridge's water, bound for a point off its own lane (its place in the ranks on the bank,
  // a waypoint beside the bridge or on another bridge where two meet): along its file to the end
  // first. Heading straight there, it would be held on the file and stand still (KAN-59)
  const exit = !stepsAshore(e) && laneExit(e.x, e.y, tx, ty);
  if (exit) {
    moveToward(e, exit[0], exit[1], speed, dt);
    if (e.x !== x0 || e.y !== y0) return false;
  }
  if (moveToward(e, tx, ty, speed, dt)) {
    p.shift();
  } else if (e.x === x0 && e.y === y0) {
    // pushed off the path onto a tile from which the waypoint cannot be walked to: route again
    const [gx, gy] = p[p.length - 1];
    e.path = findPath(e.x | 0, e.y | 0, gx, gy);
    return !e.path || !e.path.length;
  }
  return !p.length;
}

export const SPIRAL = (() => {
  const a = [[0, 0]];
  for (let r = 1; r < 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r) a.push([dx, dy]);
  return a;
})();

/** a tile to stand on: walkable and not over the water under a bridge */
const dry = (x: number, y: number) => walkable(x, y) && !overWater(x, y);

/** the first tile of SPIRAL round (x, y) that is `ok` and not taken, or null */
function freeTile(
  x: number,
  y: number,
  taken: Set<number>,
  ok: (x: number, y: number) => boolean,
): Tile | null {
  for (const [ox, oy] of SPIRAL)
    if (ok(x + ox, y + oy) && !taken.has(tileIndex(x + ox, y + oy)))
      return [x + ox, y + oy];
  return null;
}

/** room between neighbouring squads in a marching group's ranks, tiles (a squad is 1 tile wide) */
const RANK = 1.4;

/** a unit standing this near its place in the ranks counts as standing in them, tiles */
const SETTLED = 1.2;

/** the slowest pace a unit is held back to on a group march, a share of its speed */
const MIN_PACE = 0.35;

/**
 * time to walk a path from (x, y) at speed 1, seconds: each leg at the pace of the tiles it runs
 * over (half of it on the tile it starts from, half on the one it ends on), so a unit going by road
 * counts on arriving sooner than one going over the grass beside it
 */
function pathTime(x: number, y: number, p: Tile[], end: Tile | null) {
  let t = 0;
  let k = tileIndex(x | 0, y | 0);
  for (let i = 0; i < p.length; i++) {
    const last = i === p.length - 1 && end;
    const nx = last ? end[0] : p[i][0] + 0.5;
    const ny = last ? end[1] : p[i][1] + 0.5;
    const nk = tileIndex(p[i][0], p[i][1]);
    t += (dist(x, y, nx, ny) * (1 / paceAt(k) + 1 / paceAt(nk))) / 2;
    x = nx;
    y = ny;
    k = nk;
  }
  return t;
}

/**
 * Sends units to (tx, ty) as one group: they end in ranks across the way they came, the front rank
 * at the target, every unit keeping its side (the left ones stay on the left), and they walk at one
 * pace so the group arrives together instead of trickling in. Each unit still finds its own way
 * (A*), so a group squeezes through a gap and spreads out again behind it.
 */
export function orderMove(
  units: Unit[],
  tx: number,
  ty: number,
  mode?: 'move' | 'amove',
) {
  tx = Math.max(0, Math.min(MAP_W - 1, tx | 0));
  ty = Math.max(0, Math.min(MAP_H - 1, ty | 0));
  if (!units.length) return;
  // a fighting unit sent away (a plain move) turns its back: every foe striking it gets a free blow
  if (mode === 'move') for (const u of units) partingBlows(u);
  const n = units.length;
  let cx = 0;
  let cy = 0;
  for (const u of units) {
    cx += u.x;
    cy += u.y;
  }
  cx /= n;
  cy /= n;
  const px = tx + 0.5;
  const py = ty + 0.5;
  const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n * 2));
  // the way the group goes; a group ordered onto the spot it already stands on (its ranks reach
  // back from the front this far) keeps the way it faces, so its ranks are laid out as they stand
  // and nobody swaps places (KAN-57)
  let dx = px - cx;
  let dy = py - cy;
  const dl = vecLen(dx, dy);
  const onSpot = dl < 0.5 + ((Math.ceil(n / cols) - 1) * RANK) / 2;
  if (onSpot) {
    dx = 0;
    dy = 0;
    for (const u of units) {
      dx += u.hx;
      dy += u.hy;
    }
    const hl = vecLen(dx, dy);
    if (hl > 1e-3) {
      dx /= hl;
      dy /= hl;
    } else {
      dx = units[0].hx;
      dy = units[0].hy;
    }
  } else {
    dx /= dl;
    dy /= dl;
  }
  // the whole group already stands in its ranks round this spot: the order changes nothing, so
  // nobody is shuffled to a new place
  const reach = 3 + Math.sqrt(n * 2) * 0.8;
  if (
    onSpot &&
    units.every(
      u =>
        !u.tgt &&
        !(u.path && u.path.length) &&
        !!u.end &&
        dist(u.x, u.y, u.end[0], u.end[1]) < SETTLED &&
        dist(u.end[0], u.end[1], px, py) <= reach,
    )
  ) {
    for (const u of units) {
      u.path = null;
      u.gsp = 1;
      u.ftgt = 0;
      u.slot = -1;
      u.chg = 0;
      u.chT = 0;
      u.capB = 0;
      u.task = null;
      u.job = null;
      u.joinTo = 0;
      u.order = mode || 'amove';
      u.wps = null;
    }
    return;
  }
  // across the way (to the right of a unit walking along it)
  const ax = -dy;
  const ay = dx;
  // the units nearest to the target make the front rank; in a rank, left to right
  const along = (u: Unit) => (u.x - cx) * dx + (u.y - cy) * dy;
  const side = (u: Unit) => (u.x - cx) * ax + (u.y - cy) * ay;
  const sorted = [...units].sort((a, b) => along(b) - along(a) || a.id - b.id);
  const taken = new Set<number>();
  const plan: { u: Unit; end: Tile; path: Tile[] | null; time: number }[] = [];
  // a group ordered onto its own spot: each place goes to the unit standing nearest to it, so units
  // already in their places stay put (KAN-57)
  const free = onSpot ? [...units].sort((a, b) => a.id - b.id) : [];
  for (let r = 0; r * cols < n; r++) {
    const rank = sorted
      .slice(r * cols, r * cols + cols)
      .sort((a, b) => side(a) - side(b) || a.id - b.id);
    for (let c = 0; c < rank.length; c++) {
      let u = rank[c];
      const lat = (c - (rank.length - 1) / 2) * RANK;
      let ex = px + ax * lat - dx * r * RANK;
      let ey = py + ay * lat - dy * r * RANK;
      ex = Math.max(0.5, Math.min(MAP_W - 0.5, ex));
      ey = Math.max(0.5, Math.min(MAP_H - 0.5, ey));
      // its place falls on water, a bridge, a mountain or a mate's tile: the nearest free walkable
      // tile off the bridges (a unit standing on a bridge's single file would bar it, KAN-59)
      let gx = ex | 0;
      let gy = ey | 0;
      let exact = true;
      if (!dry(gx, gy) || taken.has(tileIndex(gx, gy))) {
        exact = false;
        const spot =
          freeTile(gx, gy, taken, dry) || freeTile(gx, gy, taken, walkable);
        if (spot) [gx, gy] = spot;
      }
      taken.add(tileIndex(gx, gy));
      let end: Tile = exact ? [ex, ey] : [gx + 0.5, gy + 0.5];
      // a place over a bridge's water: on its middle line
      if (overWater(end[0], end[1])) end = onLane(end[0], end[1]) || end;
      if (onSpot) {
        let k = 0;
        for (let i = 1; i < free.length; i++)
          if (
            dist(free[i].x, free[i].y, end[0], end[1]) <
            dist(free[k].x, free[k].y, end[0], end[1])
          )
            k = i;
        u = free.splice(k, 1)[0];
      }
      const path = findPath(u.x | 0, u.y | 0, gx, gy);
      plan.push({
        u,
        end,
        path,
        time: path ? pathTime(u.x, u.y, path, end) / UNITS[u.type].speed : 0,
      });
    }
  }
  // one pace for the group: the unit with the longest walk for its speed sets the time (a road
  // or a forest on its way counted in), so the ranks reach their places together
  let time = 0;
  for (const q of plan) time = Math.max(time, q.time);
  for (const { u, end, path, time: own } of plan) {
    u.path = path;
    u.dest = [end[0] | 0, end[1] | 0];
    u.end = end;
    u.gsp = time > 0 ? Math.max(MIN_PACE, Math.min(1, own / time)) : 1;
    u.tgt = 0;
    u.ftgt = 0;
    u.slot = -1;
    u.chg = 0;
    u.chT = 0;
    u.capB = 0;
    u.task = null;
    u.job = null;
    u.joinTo = 0;
    u.order = mode || 'amove';
    u.wps = null;
  }
}

/**
 * Shift+click (KAN-61): (tx, ty) goes after the points the units already march to. Each unit keeps
 * its place in the group: its spot there is the point plus where it stands (or ends) now from the
 * group's middle. A group with nowhere to go yet gets a plain order instead.
 */
export function queueMove(
  units: Unit[],
  tx: number,
  ty: number,
  mode?: 'move' | 'amove',
) {
  tx = Math.max(0, Math.min(MAP_W - 1, tx | 0));
  ty = Math.max(0, Math.min(MAP_H - 1, ty | 0));
  if (!units.length) return;
  const busy = (u: Unit) =>
    !!(u.path && u.path.length) || !!(u.wps && u.wps.length) || !!u.ftgt;
  if (!units.some(busy)) {
    orderMove(units, tx, ty, mode);
    return;
  }
  // where each unit will be once its marches so far are done
  const last = (u: Unit): Tile => {
    const w = u.wps && u.wps[u.wps.length - 1];
    if (w) return [w.x, w.y];
    if (u.end) return u.end;
    if (u.dest) return [u.dest[0] + 0.5, u.dest[1] + 0.5];
    return [u.x, u.y];
  };
  const at = units.map(last);
  let cx = 0;
  let cy = 0;
  for (const [x, y] of at) {
    cx += x;
    cy += y;
  }
  cx /= units.length;
  cy /= units.length;
  units.forEach((u, i) => {
    const x = Math.max(0.5, Math.min(MAP_W - 0.5, tx + 0.5 + at[i][0] - cx));
    const y = Math.max(0.5, Math.min(MAP_H - 0.5, ty + 0.5 + at[i][1] - cy));
    // (a full queue drops its oldest point: a bound on what a stream of clicks can pile up)
    const wps = (u.wps ||= []);
    if (wps.length >= MAX_WPS) wps.shift();
    wps.push({ x, y, mode: mode || 'amove' });
  });
}

/** points one unit may have queued */
const MAX_WPS = 16;

/**
 * The unit has done its march: it sets off to the next queued point, alone and at its own pace
 * (its mates set off as they arrive, each to its own spot, so the group keeps its shape).
 */
export function nextLeg(u: Unit) {
  const w = u.wps && u.wps.shift();
  if (!u.wps || !u.wps.length) u.wps = null;
  if (!w) return;
  let gx = w.x | 0;
  let gy = w.y | 0;
  let end: Tile = [w.x, w.y];
  if (!walkable(gx, gy)) {
    for (const [ox, oy] of SPIRAL)
      if (walkable(gx + ox, gy + oy)) {
        gx += ox;
        gy += oy;
        end = [gx + 0.5, gy + 0.5];
        break;
      }
  }
  if (overWater(end[0], end[1])) end = onLane(end[0], end[1]) || end;
  if (w.mode === 'move') partingBlows(u);
  u.path = findPath(u.x | 0, u.y | 0, gx, gy);
  u.dest = [gx, gy];
  u.end = end;
  u.gsp = 1;
  u.tgt = 0;
  u.slot = -1;
  u.chg = 0;
  u.chT = 0;
  u.order = w.mode;
}

/**
 * Take a hostile post: walk to it like a plain move (not stopping for foes on the way), then stand
 * by it and fight back the enemy troops that come, but never shoot that post (see acquireTarget).
 * The order lapses when the post is ours, gone, or cannot be captured any more.
 */
export function orderCapture(units: Unit[], b: Building) {
  orderMove(units, b.x, b.y, 'move');
  for (const u of units) u.capB = b.id;
}

export function orderAttack(units: Unit[], ent: Entity) {
  for (const u of units) {
    u.slot = -1;
    u.chT = 0;
    u.gsp = 1;
    u.end = null;
    u.joinTo = 0;
    u.order = 'amove';
    u.wps = null;
    u.ftgt = ent.id;
    u.capB = 0;
    u.task = null;
    u.tgt = ent.id;
    u.path = null;
    u.repath = 0;
    u.dest = null;
    u.job = null;
  }
}

export function walkTo(u: Unit, t: Unit) {
  const gx = Math.round(t.x - 0.5);
  const gy = Math.round(t.y - 0.5);
  u.path = findPath(u.x | 0, u.y | 0, gx, gy);
  u.dest = [gx, gy];
  u.end = null;
  u.gsp = 1;
}

/** a unit wades at this share of its pace */
const WADE = 0.5;

/** the walkable tile nearest to the point (x, y), looking up to 20 tiles out, or null */
function shore(x: number, y: number): Tile | null {
  const cx = x | 0;
  const cy = y | 0;
  let best: Tile | null = null;
  let bd = 1e9;
  let lastRing = 20;
  for (let r = 1; r <= lastRing; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!walkable(cx + dx, cy + dy)) continue;
        const d = dist(x, y, cx + dx + 0.5, cy + dy + 0.5);
        if (d < bd) {
          bd = d;
          best = [cx + dx, cy + dy];
        }
      }
    // a nearer tile can still sit in the next ring (a corner of this one is farther than its side)
    if (best && lastRing > r + 1) lastRing = r + 1;
  }
  return best;
}

/**
 * A unit left in the water (its bridge burnt or gone from under it) wades to the nearest shore at
 * half its pace and does nothing else meanwhile: it neither drowns nor stays stuck. Once ashore it
 * walks on to where it was going. Returns false when the unit stands on walkable ground.
 */
export function wade(u: Unit, speed: number, dt: number): boolean {
  if (walkable(u.x | 0, u.y | 0)) return false;
  const s = shore(u.x, u.y);
  if (!s) return true;
  const dx = s[0] + 0.5 - u.x;
  const dy = s[1] + 0.5 - u.y;
  const d = vecLen(dx, dy);
  const st = Math.min(speed * WADE * dt, d);
  if (d > 1e-4) {
    u.x += (dx / d) * st;
    u.y += (dy / d) * st;
    u.ang = detAtan2(dy, dx);
    turn(u, dx / d, dy / d);
  }
  u.mv = 1;
  // ashore: on to where it was going, if its way was lost in the water
  if (
    walkable(u.x | 0, u.y | 0) &&
    !u.tgt &&
    u.dest &&
    !(u.path && u.path.length)
  )
    u.path = findPath(u.x | 0, u.y | 0, u.dest[0], u.dest[1]);
  return true;
}
