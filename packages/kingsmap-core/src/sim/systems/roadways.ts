/**
 * Roads speed troops up: on every tile under a standing road (the tiles the map draws it over, round
 * the mountains and across its bridges) a unit walks ROAD_PACE times faster, and A* counts such a
 * step cheaper, so troops take a road when it goes their way. Whose road it is does not matter, as
 * with bridges: a foe marches faster along my roads too, which makes them worth holding and worth
 * burning. A burning road speeds no one (it is ash, its bridge is gone); a road only blocked (by
 * troops on it, or by a hostile kingdom's land) still does, like its bridge: otherwise the troops
 * fighting over it would flip its pace under their own feet every network update.
 */
import { MAP_H, MAP_W, TILES } from '../config/map';
import { G, roadDist, roadMap, roadSum, terrainMap } from '../state';
import { bridgeStands } from './bridges';
import { findPath } from './pathfinding';
import { bridgeTiles, roadTiles } from './roads';

/** scratch: the roads as they stand now */
const next = new Uint8Array(TILES);

/** scratch: 1 near a road tile built this update */
const near = new Uint8Array(TILES);

/** a new road this close (tiles) to the way a unit walks makes it look for a quicker one */
const NEAR = 2;

/** a unit with fewer tiles than this left to walk keeps its way */
const SHORT = 6;

/**
 * Lays the standing roads onto the map (after the bridges, on each network update). When a road is
 * built next to the way a unit marches, it looks again (the road may be quicker); a road gone takes
 * no one off their way (it is still walkable, only slower; a fallen bridge is updateBridges' care).
 */
export function updateRoads() {
  next.fill(0);
  for (const l of G.links) {
    if (!bridgeStands(l)) continue;
    const a = roadTiles(terrainMap, l.a.x, l.a.y, l.b.x, l.b.y);
    for (let i = 0; i < a.length; i++) next[a[i]] = 1;
    const b = bridgeTiles(terrainMap, l.a.x, l.a.y, l.b.x, l.b.y);
    for (let i = 0; i < b.length; i++) next[b[i]] = 1;
  }
  let built = false;
  let changed = false;
  for (let k = 0; k < TILES; k++) {
    if (next[k] !== roadMap[k]) changed = true;
    if (next[k] && !roadMap[k]) {
      built = true;
      const x = k % MAP_W;
      const y = (k / MAP_W) | 0;
      for (let dy = -NEAR; dy <= NEAR; dy++)
        for (let dx = -NEAR; dx <= NEAR; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H)
            near[ny * MAP_W + nx] = 1;
        }
    }
  }
  if (!changed) return;
  roadMap.set(next);
  sumRoads();
  measureRoads();
  if (!built) return;
  for (const u of G.units) {
    // a chase looks for its foe again every 1.5 s anyway
    if (u.dead || u.tgt || !u.dest || !u.path || u.path.length < SHORT)
      continue;
    for (const [x, y] of u.path)
      if (near[y * MAP_W + x]) {
        u.path = findPath(u.x | 0, u.y | 0, u.dest[0], u.dest[1]);
        break;
      }
  }
  near.fill(0);
}

/** roadSum from roadMap: road tiles in every box from the map's corner (for findPath) */
export function sumRoads() {
  const W = MAP_W + 1;
  for (let y = 0; y < MAP_H; y++) {
    let row = 0;
    for (let x = 0; x < MAP_W; x++) {
      row += roadMap[y * MAP_W + x];
      roadSum[(y + 1) * W + x + 1] = roadSum[y * W + x + 1] + row;
    }
  }
}

/**
 * roadDist from roadMap: each tile's octile distance to the nearest road tile, obstacles ignored (a
 * lower bound of the walk, for findPath's estimate). Two sweeps over the map (exact for octile).
 */
export function measureRoads() {
  const D = roadDist;
  for (let k = 0; k < TILES; k++) D[k] = roadMap[k] ? 0 : 1e9;
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const k = y * MAP_W + x;
      let d = D[k];
      if (x > 0 && D[k - 1] + 1 < d) d = D[k - 1] + 1;
      if (y > 0) {
        const u = k - MAP_W;
        if (D[u] + 1 < d) d = D[u] + 1;
        if (x > 0 && D[u - 1] + 1.414 < d) d = D[u - 1] + 1.414;
        if (x < MAP_W - 1 && D[u + 1] + 1.414 < d) d = D[u + 1] + 1.414;
      }
      D[k] = d;
    }
  for (let y = MAP_H - 1; y >= 0; y--)
    for (let x = MAP_W - 1; x >= 0; x--) {
      const k = y * MAP_W + x;
      let d = D[k];
      if (x < MAP_W - 1 && D[k + 1] + 1 < d) d = D[k + 1] + 1;
      if (y < MAP_H - 1) {
        const b = k + MAP_W;
        if (D[b] + 1 < d) d = D[b] + 1;
        if (x < MAP_W - 1 && D[b + 1] + 1.414 < d) d = D[b + 1] + 1.414;
        if (x > 0 && D[b - 1] + 1.414 < d) d = D[b - 1] + 1.414;
      }
      D[k] = d;
    }
}
