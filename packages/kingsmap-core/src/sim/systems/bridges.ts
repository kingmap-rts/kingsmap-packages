/**
 * Bridges: where a road between two posts crosses water the map draws a bridge, and troops walk
 * it like the land. Whose road it is does not matter: a bridge is a bridge, a foe can cross it too
 * (and attack over it). It stands while its road does and is not burning; a road only blocked (by
 * troops on it, or by a hostile kingdom's land) keeps its bridge, so troops fighting on a bridge
 * never drop into the water because they outnumber the other side.
 */
import type { Link, Match, Tile, Unit } from '../world/types';
import { MAP_H, MAP_W, TILES, Terrain } from '../config/map';
import { G, bridgeMap, matchState, terrainMap } from '../state';
import { findPath } from './pathfinding';
import { bridgeLanes, bridgeTiles } from './roads';
import { hostile } from './diplomacy';
import { walkable } from '../world/terrain';
import { sq } from '../util/geometry';
import { unitMoved } from '../world/unitGrid';

// enum codes read once: `Terrain.X` / `Deposit.X` go through CommonJS re-export getters, which cost
// about a third of tick time when read per tile (KAN-88)
const WATER = Terrain.Water;

/** does the bridge of this road stand? (while the road is there and not burning) */
export const bridgeStands = (l: Link) => (G.sab.get(l.key) || 0) <= G.t;

/** scratch: the bridges as they stand now */
const next = new Uint8Array(TILES);

/** a path walked from (x, y) this many times longer than the straight way is a detour */
const DETOUR = 1.25;

/** length of a tile path walked from the tile (x, y), tiles */
function tilesLen(x: number, y: number, p: Tile[]) {
  let l = 0;
  for (const [px, py] of p) {
    l += px !== x && py !== y ? 1.414 : 1;
    x = px;
    y = py;
  }
  return l;
}

/** the straight way between two tiles, the way A* counts it */
function octile(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
}

/**
 * Lays the bridges of the standing roads onto the map (after the road network is recomputed).
 * When one falls, everyone whose way crosses it finds another; when one is built, everyone who
 * could not reach their goal or walks a long way round looks again (it may be shorter now).
 */
export function updateBridges() {
  next.fill(0);
  for (const l of G.links) {
    if (!bridgeStands(l)) continue;
    const ts = bridgeTiles(terrainMap, l.a.x, l.a.y, l.b.x, l.b.y);
    for (let i = 0; i < ts.length; i++) next[ts[i]] = 1;
  }
  let built = false;
  let fell = false;
  for (let k = 0; k < TILES; k++)
    if (next[k] !== bridgeMap[k]) {
      if (next[k]) built = true;
      else fell = true;
    }
  if (!built && !fell) {
    indexLanes();
    return;
  }
  bridgeMap.set(next);
  indexLanes();
  for (const u of G.units) {
    if (u.dead || !u.path || !u.path.length) continue;
    const end = u.path[u.path.length - 1];
    // a chase heads for the foe (the path's end), a march for its destination
    const [gx, gy] = !u.tgt && u.dest ? u.dest : end;
    let again = false;
    if (fell)
      for (const [x, y] of u.path)
        if (!walkable(x, y)) {
          again = true;
          break;
        }
    if (!again && built) {
      const ux = u.x | 0;
      const uy = u.y | 0;
      again =
        end[0] !== gx ||
        end[1] !== gy ||
        tilesLen(ux, uy, u.path) > octile(ux, uy, gx, gy) * DETOUR + 2;
    }
    if (again) u.path = findPath(u.x | 0, u.y | 0, gx, gy);
  }
}

/*
 * Lanes: a bridge is narrower than a tile (and than a squad), so troops on it walk its middle line
 * in single file: a waypoint on or by a bridge is moved onto that line, and whoever stands over the
 * water is kept on it (pushed by a mate or a foe, cut across a corner). The map draws a squad on a
 * bridge as a file along it, so no soldier is drawn over the water.
 */

/** a unit over the water stays this close to its bridge's middle line, tiles */
const LANE = 0.04;

/** a waypoint this close to a bridge's middle line (on the land at its ends) is moved onto it */
const CATCH = 0.9;

interface Lanes {
  /** x0, y0, x1, y1 of every lane of the standing bridges, tiles */
  ends: number[];
  /** tile → the lanes (index into ends / 4) that pass within reach of it */
  at: Map<number, number[]>;
}
const lanesOf = new WeakMap<Match, Lanes>();

/**
 * The lanes of the bridges as they stand (on the map now): rebuilt after every recompute of the
 * network, and on the first look after a match is restored, from the same links and bridge tiles,
 * so every client finds the same lanes.
 */
function indexLanes(): Lanes {
  const ends: number[] = [];
  const at = new Map<number, number[]>();
  for (const l of G.links) {
    const ts = bridgeTiles(terrainMap, l.a.x, l.a.y, l.b.x, l.b.y);
    let on = false;
    for (let i = 0; i < ts.length && !on; i++) on = bridgeMap[ts[i]] === 1;
    if (!on) continue;
    const ls = bridgeLanes(terrainMap, l.a.x, l.a.y, l.b.x, l.b.y);
    for (let i = 0; i < ls.length; i += 4) {
      const id = ends.length / 4;
      const [x0, y0, x1, y1] = [ls[i], ls[i + 1], ls[i + 2], ls[i + 3]];
      ends.push(x0, y0, x1, y1);
      const len = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      const n = Math.max(1, Math.ceil(len / 0.25));
      for (let j = 0; j <= n; j++) {
        const x = x0 + ((x1 - x0) * j) / n;
        const y = y0 + ((y1 - y0) * j) / n;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const tx = (x + ox) | 0;
            const ty = (y + oy) | 0;
            if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
            const k = ty * MAP_W + tx;
            const a = at.get(k);
            if (!a) at.set(k, [id]);
            else if (a[a.length - 1] !== id) a.push(id);
          }
      }
    }
  }
  const lanes = { ends, at };
  lanesOf.set(matchState, lanes);
  return lanes;
}

/** the point of the nearest lane to (x, y) and how far off it (x, y) lies, or null if none is near */
function nearestLane(x: number, y: number) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  const L = lanesOf.get(matchState) || indexLanes();
  const ids = L.at.get((y | 0) * MAP_W + (x | 0));
  if (!ids) return null;
  let best: { x: number; y: number; d: number; id: number } | null = null;
  for (const id of ids) {
    const x0 = L.ends[id * 4];
    const y0 = L.ends[id * 4 + 1];
    const dx = L.ends[id * 4 + 2] - x0;
    const dy = L.ends[id * 4 + 3] - y0;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((x - x0) * dx + (y - y0) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    const d = Math.sqrt(sq(x - px) + sq(y - py));
    if (!best || d < best.d) best = { x: px, y: py, d, id };
  }
  return best;
}

/** (x, y) stands over the water of a bridge */
export const overWater = (x: number, y: number) => {
  const k = (y | 0) * MAP_W + (x | 0);
  return bridgeMap[k] === 1 && terrainMap[k] === WATER;
};

/**
 * Where to head for the point (x, y) of a way (a waypoint's centre, a place in the ranks): on a
 * bridge, or on the land by its end, the nearest point of its middle line; null anywhere else.
 */
export function onLane(x: number, y: number): [number, number] | null {
  const n = nearestLane(x, y);
  if (!n || (n.d > CATCH && !overWater(x, y))) return null;
  return walkable(n.x | 0, n.y | 0) ? [n.x, n.y] : null;
}

/** a point this close to a lane lies on it; a unit this close to a lane's end stands at it, tiles */
const ON = 0.1;

/** distance from (x, y) to the lane `id`, tiles */
function laneDist(L: Lanes, id: number, x: number, y: number) {
  const x0 = L.ends[id * 4];
  const y0 = L.ends[id * 4 + 1];
  const dx = L.ends[id * 4 + 2] - x0;
  const dy = L.ends[id * 4 + 3] - y0;
  const l2 = dx * dx + dy * dy;
  const t = l2
    ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2))
    : 0;
  const px = x0 + dx * t - x;
  const py = y0 + dy * t - y;
  return Math.sqrt(px * px + py * py);
}

/**
 * Where a unit at (x, y) over the water of a bridge heads first on its way to the point (tx, ty)
 * that does not lie on its own lane (a place on the bank beside the bridge, a waypoint on another
 * lane where two bridges meet): the end of its own lane nearer to that point, so it walks the file
 * there instead of cutting across the planks. Kept on its lane, it would stand still (KAN-59).
 * Null when (x, y) is not over a bridge's water, the point lies on its lane, or the unit already
 * stands at that end.
 */
export function laneExit(
  x: number,
  y: number,
  tx: number,
  ty: number,
): [number, number] | null {
  if (!overWater(x, y)) return null;
  const n = nearestLane(x, y);
  if (!n) return null;
  const L = lanesOf.get(matchState)!;
  if (laneDist(L, n.id, tx, ty) <= ON) return null;
  const e = L.ends;
  const i = n.id * 4;
  const d0 = sq(e[i] - tx) + sq(e[i + 1] - ty);
  const d1 = sq(e[i + 2] - tx) + sq(e[i + 3] - ty);
  const [ex, ey] = d0 <= d1 ? [e[i], e[i + 1]] : [e[i + 2], e[i + 3]];
  if (!walkable(ex | 0, ey | 0)) return null;
  const ox = ex - x;
  const oy = ey - y;
  return Math.sqrt(ox * ox + oy * oy) <= ON ? null : [ex, ey];
}

/**
 * The unit steps off a bridge sideways: its next waypoint is a tile of the bank next to the one it
 * stands on and away from the bridge's middle line (a way along the shore that cuts the corner of
 * a bridge's tile, or one that leaves a bridge by its side near its end). It walks there straight,
 * over a little water: kept on the middle line, or sent along it to the bridge's end, it would be
 * turned back and never get off (KAN-59).
 */
export function stepsAshore(u: Unit) {
  if (!u.path || !u.path.length) return false;
  const [wx, wy] = u.path[0];
  return (
    Math.abs(wx - (u.x | 0)) <= 1 &&
    Math.abs(wy - (u.y | 0)) <= 1 &&
    walkable(wx, wy) &&
    !overWater(wx + 0.5, wy + 0.5) &&
    !onLane(wx + 0.5, wy + 0.5)
  );
}

/** keeps every unit standing over the water of a bridge on its middle line (after separation) */
export function keepOnBridges() {
  for (const u of G.units) {
    if (u.dead || !overWater(u.x, u.y)) continue;
    const n = nearestLane(u.x, u.y);
    if (!n || n.d <= LANE || stepsAshore(u)) continue;
    const k = (n.d - LANE) / n.d;
    const x = u.x + (n.x - u.x) * k;
    const y = u.y + (n.y - u.y) * k;
    if (!walkable(x | 0, y | 0)) continue;
    u.x = x;
    u.y = y;
    unitMoved(u);
  }
}

/**
 * Mates pass through each other on a bridge (KAN-59): on its single file nobody can step aside, so
 * a mate standing on it (fighting, or left there), a slower one ahead, or one coming the other way
 * would otherwise bar the file for good. It holds when either of the two stands over the water, so
 * one still on the bank by the bridge's end does not bar one already on it either. Foes still meet.
 */
export const passOnBridge = (a: Unit, b: Unit) =>
  !hostile(a.owner, b.owner) && (overWater(a.x, a.y) || overWater(b.x, b.y));
