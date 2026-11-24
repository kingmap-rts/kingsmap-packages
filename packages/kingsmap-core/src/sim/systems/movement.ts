/** Moving along paths and move/attack orders. */
import type { Building, Entity, Unit } from '../world/types';
import { MAP_H, MAP_W, Terrain } from '../config/map';
import { terrainMap } from '../state';
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

/** the last waypoint counts as reached this close to its centre */
const ARRIVE = 0.25;

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
  const tx = wx + 0.5;
  const ty = wy + 0.5;
  if (p.length === 1 && dist(e.x, e.y, tx, ty) < ARRIVE) {
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

export function orderMove(
  units: Unit[],
  tx: number,
  ty: number,
  mode?: 'move' | 'amove',
) {
  tx = Math.max(0, Math.min(MAP_W - 1, tx | 0));
  ty = Math.max(0, Math.min(MAP_H - 1, ty | 0));
  let k = 0;
  const sorted = [...units].sort(
    (a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty),
  );
  for (const u of sorted) {
    let gx = tx;
    let gy = ty;
    while (k < SPIRAL.length) {
      const [dx, dy] = SPIRAL[k++];
      if (walkable(tx + dx, ty + dy)) {
        gx = tx + dx;
        gy = ty + dy;
        break;
      }
    }
    u.path = findPath(u.x | 0, u.y | 0, gx, gy);
    u.dest = [gx, gy];
    u.tgt = 0;
    u.ftgt = 0;
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
}
