/**
 * A* on the tile grid: a step costs the time it takes, so a forest is dearer and a road cheaper
 * (troops take a road when it goes their way). Scratch buffers are shared by all matches.
 */
import type { Tile } from '../world/types';
import { MAP_H, MAP_W, TILES, Terrain } from '../config/map';
import { ROAD_PACE } from '../config/network';
import { roadDist, roadMap, roadSum, terrainMap } from '../state';
import { tileIndex } from '../util/geometry';
import { walkable } from '../world/terrain';

// enum codes read once: `Terrain.X` / `Deposit.X` go through CommonJS re-export getters, which cost
// about a third of tick time when read per tile (KAN-88)
const FOREST = Terrain.Forest;

export const gScore = new Float32Array(TILES);

export const cameFrom = new Int32Array(TILES);

export const seenIn = new Int32Array(TILES);

export const closedIn = new Int32Array(TILES);

export let searchNo = 0;

export const heapKeys: number[] = [];

export const heapVals: number[] = [];

export function heapPush(k: number, v: number) {
  heapKeys.push(k);
  heapVals.push(v);
  let i = heapKeys.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapVals[p] <= heapVals[i]) break;
    [heapKeys[p], heapKeys[i]] = [heapKeys[i], heapKeys[p]];
    [heapVals[p], heapVals[i]] = [heapVals[i], heapVals[p]];
    i = p;
  }
}

export function heapPop() {
  const top = heapKeys[0];
  const lk = heapKeys.pop()!;
  const lv = heapVals.pop()!;
  if (heapKeys.length) {
    heapKeys[0] = lk;
    heapVals[0] = lv;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heapKeys.length && heapVals[l] < heapVals[m]) m = l;
      if (r < heapKeys.length && heapVals[r] < heapVals[m]) m = r;
      if (m === i) break;
      [heapKeys[m], heapKeys[i]] = [heapKeys[i], heapKeys[m]];
      [heapVals[m], heapVals[i]] = [heapVals[i], heapVals[m]];
      i = m;
    }
  }
  return top;
}

export function nearestPass(x: number, y: number): Tile | null {
  x = Math.max(0, Math.min(MAP_W - 1, x | 0));
  y = Math.max(0, Math.min(MAP_H - 1, y | 0));
  if (walkable(x, y)) return [x, y];
  for (let r = 1; r < 8; r++) {
    let best: Tile | null = null;
    let bd = 1e9;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walkable(x + dx, y + dy)) {
          const d = dx * dx + dy * dy;
          if (d < bd) {
            bd = d;
            best = [x + dx, y + dy];
          }
        }
      }
    if (best) return best;
  }
  return null;
}

export const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [1, -1, 1.414],
  [-1, 1, 1.414],
  [-1, -1, 1.414],
];

/** a step onto a road tile costs this share of a step over open ground */
const ROAD_COST = 1 / ROAD_PACE;

/** road tiles in the box x0..x1 × y0..y1 (inclusive, clipped to the map), from roadSum */
function roadsIn(x0: number, y0: number, x1: number, y1: number) {
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(MAP_W - 1, x1) + 1;
  y1 = Math.min(MAP_H - 1, y1) + 1;
  if (x0 >= x1 || y0 >= y1) return 0;
  const W = MAP_W + 1;
  return (
    roadSum[y1 * W + x1] -
    roadSum[y0 * W + x1] -
    roadSum[y1 * W + x0] +
    roadSum[y0 * W + x0]
  );
}

/**
 * A lower bound of the cost from a tile to the goal `oct` away (octile) with roads about: a way off
 * the roads costs at least oct; a way by road walks at least `from` - 1.414 off-road to its first road
 * tile (the step onto it is a road step) and `to` from its last one to the goal, at full cost, and
 * the rest at ROAD_COST at best. Far from every road it is the plain estimate, near one it shrinks.
 */
function roadEstimate(oct: number, from: number, to: number) {
  const off = Math.max(0, from - 1.414) + to;
  return Math.min(oct, oct * ROAD_COST + off * (1 - ROAD_COST));
}

export function findPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): Tile[] | null {
  const s = nearestPass(sx, sy);
  const t = nearestPass(tx, ty);
  if (!s || !t) return null;
  [sx, sy] = s;
  [tx, ty] = t;
  const si = tileIndex(sx, sy);
  const ti = tileIndex(tx, ty);
  if (si === ti) return [[tx, ty]];
  // The straight way is the goal's distance only where every step costs at least 1; with a road
  // near (in the box of start and goal, widened by a share of the trip: a road farther off is never
  // worth the walk to it) a step may cost ROAD_COST, so the estimate shrinks to stay below the cost
  // and the search still finds the bend off to the road. Without one the search is exactly the
  // quick one over open ground.
  const ox = Math.abs(sx - tx);
  const oy = Math.abs(sy - ty);
  const m = 2 + ((Math.max(ox, oy) * 0.15) | 0);
  const roads =
    roadsIn(
      Math.min(sx, tx) - m,
      Math.min(sy, ty) - m,
      Math.max(sx, tx) + m,
      Math.max(sy, ty) + m,
    ) > 0;
  // the goal's own walk from the nearest road: no way by road avoids it
  const toRoad = roadDist[ti];
  searchNo++;
  heapKeys.length = 0;
  heapVals.length = 0;
  gScore[si] = 0;
  seenIn[si] = searchNo;
  cameFrom[si] = -1;
  heapPush(si, 0);
  // every pop expands a tile once or drops a stale entry, and a tile pushes at most 8:
  // the search always finishes, the cap only guards against a broken heap
  let it = 0;
  let found = false;
  // the explored tile nearest to the goal: an unreachable goal still gets a path to its edge
  let best = si;
  let bestH = 1e9;
  while (heapKeys.length && it++ < TILES * 8) {
    const cur = heapPop();
    if (cur === ti) {
      found = true;
      break;
    }
    if (closedIn[cur] === searchNo) continue;
    closedIn[cur] = searchNo;
    const cx = cur % MAP_W;
    const cy = (cur / MAP_W) | 0;
    const hx = Math.abs(cx - tx);
    const hy = Math.abs(cy - ty);
    const h = Math.max(hx, hy) + 0.414 * Math.min(hx, hy);
    if (h < bestH) {
      bestH = h;
      best = cur;
    }
    for (const [dx, dy, c] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy)))
        continue;
      const ni = tileIndex(nx, ny);
      if (closedIn[ni] === searchNo) continue;
      const ng =
        gScore[cur] +
        c *
          (roadMap[ni] === 1 ? ROAD_COST : terrainMap[ni] === FOREST ? 1.3 : 1);
      if (seenIn[ni] !== searchNo || ng < gScore[ni]) {
        seenIn[ni] = searchNo;
        gScore[ni] = ng;
        cameFrom[ni] = cur;
        const ax = Math.abs(nx - tx);
        const ay = Math.abs(ny - ty);
        heapPush(
          ni,
          roads
            ? ng +
                roadEstimate(
                  Math.max(ax, ay) + 0.414 * Math.min(ax, ay),
                  roadDist[ni],
                  toRoad,
                )
            : ng + Math.max(ax, ay) + 0.414 * Math.min(ax, ay),
        );
      }
    }
  }
  const end = found ? ti : best;
  if (end === si) return null;
  const out: Tile[] = [];
  let c = end;
  while (c !== si && c !== -1) {
    out.push([c % MAP_W, (c / MAP_W) | 0]);
    c = cameFrom[c];
  }
  out.reverse();
  return out;
}
