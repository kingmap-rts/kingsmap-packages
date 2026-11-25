/**
 * Bridges: where a road between two posts crosses water the map draws a bridge, and troops walk
 * it like the land. Whose road it is does not matter: a bridge is a bridge, a foe can cross it too
 * (and attack over it). It stands while its road does and is not burning; a road only blocked (by
 * troops on it, or by a hostile kingdom's land) keeps its bridge, so troops fighting on a bridge
 * never drop into the water because they outnumber the other side.
 */
import type { Link, Tile } from '../world/types';
import { TILES } from '../config/map';
import { G, bridgeMap, terrainMap } from '../state';
import { findPath } from './pathfinding';
import { bridgeTiles } from './roads';
import { walkable } from '../world/terrain';

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
  if (!built && !fell) return;
  bridgeMap.set(next);
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
