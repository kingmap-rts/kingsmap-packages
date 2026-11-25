/** Moving along paths and move/attack orders. */
import type { Building, Entity, Tile, Unit } from '../world/types';
import { MAP_H, MAP_W, Terrain } from '../config/map';
import { UNITS } from '../config/units';
import { terrainMap } from '../state';
import { partingBlows } from './combat';
import { findPath } from './pathfinding';
import { dist, tileIndex, vecLen } from '../util/geometry';
import { walkable } from '../world/terrain';

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
  const tk = tileIndex(e.x | 0, e.y | 0);
  const sp = speed * (terrainMap[tk] === Terrain.Forest ? 0.75 : 1) * dt;
  const st = Math.min(sp, d);
  const nx = e.x + (dx / d) * st;
  const ny = e.y + (dy / d) * st;
  e.ang = Math.atan2(dy, dx);
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
  const tx = exact ? e.end![0] : wx + 0.5;
  const ty = exact ? e.end![1] : wy + 0.5;
  if (p.length === 1 && dist(e.x, e.y, tx, ty) < (exact ? END : ARRIVE)) {
    p.shift();
    return true;
  }
  const x0 = e.x;
  const y0 = e.y;
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

/** room between neighbouring squads in a marching group's ranks, tiles (a squad is 1 tile wide) */
const RANK = 1.4;

/** the slowest pace a unit is held back to on a group march, a share of its speed */
const MIN_PACE = 0.35;

/** length of a path walked from (x, y), tiles */
function pathLen(x: number, y: number, p: Tile[], end: Tile | null) {
  let l = 0;
  for (let i = 0; i < p.length; i++) {
    const last = i === p.length - 1 && end;
    const nx = last ? end[0] : p[i][0] + 0.5;
    const ny = last ? end[1] : p[i][1] + 0.5;
    l += dist(x, y, nx, ny);
    x = nx;
    y = ny;
  }
  return l;
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
  // the way the group goes; a group ordered onto its own spot keeps the first unit's facing
  let dx = px - cx;
  let dy = py - cy;
  const dl = vecLen(dx, dy);
  if (dl < 0.5) {
    dx = units[0].hx;
    dy = units[0].hy;
  } else {
    dx /= dl;
    dy /= dl;
  }
  // across the way (to the right of a unit walking along it)
  const ax = -dy;
  const ay = dx;
  const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n * 2));
  // the units nearest to the target make the front rank; in a rank, left to right
  const along = (u: Unit) => (u.x - cx) * dx + (u.y - cy) * dy;
  const side = (u: Unit) => (u.x - cx) * ax + (u.y - cy) * ay;
  const sorted = [...units].sort((a, b) => along(b) - along(a) || a.id - b.id);
  const taken = new Set<number>();
  const plan: { u: Unit; end: Tile; path: Tile[] | null; len: number }[] = [];
  for (let r = 0; r * cols < n; r++) {
    const rank = sorted
      .slice(r * cols, r * cols + cols)
      .sort((a, b) => side(a) - side(b) || a.id - b.id);
    for (let c = 0; c < rank.length; c++) {
      const u = rank[c];
      const lat = (c - (rank.length - 1) / 2) * RANK;
      let ex = px + ax * lat - dx * r * RANK;
      let ey = py + ay * lat - dy * r * RANK;
      ex = Math.max(0.5, Math.min(MAP_W - 0.5, ex));
      ey = Math.max(0.5, Math.min(MAP_H - 0.5, ey));
      // its place falls on water, a mountain or a mate's tile: the nearest free walkable tile
      let gx = ex | 0;
      let gy = ey | 0;
      let exact = true;
      if (!walkable(gx, gy) || taken.has(tileIndex(gx, gy))) {
        exact = false;
        for (const [ox, oy] of SPIRAL) {
          const x = gx + ox;
          const y = gy + oy;
          if (walkable(x, y) && !taken.has(tileIndex(x, y))) {
            gx = x;
            gy = y;
            break;
          }
        }
      }
      taken.add(tileIndex(gx, gy));
      const end: Tile = exact ? [ex, ey] : [gx + 0.5, gy + 0.5];
      const path = findPath(u.x | 0, u.y | 0, gx, gy);
      plan.push({
        u,
        end,
        path,
        len: path ? pathLen(u.x, u.y, path, end) : 0,
      });
    }
  }
  // one pace for the group: the unit with the longest walk for its speed sets the time
  let time = 0;
  for (const q of plan) time = Math.max(time, q.len / UNITS[q.u.type].speed);
  for (const { u, end, path, len } of plan) {
    u.path = path;
    u.dest = [end[0] | 0, end[1] | 0];
    u.end = end;
    u.gsp =
      time > 0
        ? Math.max(MIN_PACE, Math.min(1, len / UNITS[u.type].speed / time))
        : 1;
    u.tgt = 0;
    u.ftgt = 0;
    u.slot = -1;
    u.chg = 0;
    u.chT = 0;
    u.capB = 0;
    u.job = null;
    u.joinTo = 0;
    u.order = mode || 'amove';
  }
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
    u.ftgt = ent.id;
    u.capB = 0;
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
    u.ang = Math.atan2(dy, dx);
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
