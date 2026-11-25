/**
 * Where a road between two posts runs and which tiles it crosses. The same route the map draws
 * (the client bends it a little more, by under a tile): straight when no mountain is in the way,
 * otherwise around the mountains (A* over the tiles, then pulled straight between the corners).
 * A pure function of the terrain, cached per map. Only +, *, / and sqrt, so it is the same in
 * every JS engine.
 */
import { MAP_H, MAP_W, Terrain } from '../config/map';
import { vecLen } from '../util/geometry';

/** a point in tiles */
export type RoadPt = [number, number];

/** samples per tile when walking along a line */
const STEP = 0.2;

/** how far from the road's middle line it keeps off the mountains, tiles */
const MARGIN = 0.3;

const mountain = (terrain: ArrayLike<number>, x: number, y: number) =>
  x < 0 ||
  y < 0 ||
  x >= MAP_W ||
  y >= MAP_H ||
  terrain[(y | 0) * MAP_W + (x | 0)] === Terrain.Mountain;

/** can a road run straight from p to q without touching a mountain? */
function clear(terrain: ArrayLike<number>, p: RoadPt, q: RoadPt): boolean {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = vecLen(dx, dy);
  if (!len) return !mountain(terrain, p[0], p[1]);
  const nx = (-dy / len) * MARGIN;
  const ny = (dx / len) * MARGIN;
  const n = Math.ceil(len / STEP);
  for (let i = 0; i <= n; i++) {
    const x = p[0] + (dx * i) / n;
    const y = p[1] + (dy * i) / n;
    if (
      mountain(terrain, x, y) ||
      mountain(terrain, x + nx, y + ny) ||
      mountain(terrain, x - nx, y - ny)
    )
      return false;
  }
  return true;
}

const N8: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** tile centres from a to b around the mountains, or null when there is no way */
function search(
  terrain: ArrayLike<number>,
  a: RoadPt,
  b: RoadPt,
): RoadPt[] | null {
  const W = MAP_W;
  const si = (a[1] | 0) * W + (a[0] | 0);
  const ti = (b[1] | 0) * W + (b[0] | 0);
  const g = new Float32Array(W * MAP_H).fill(Infinity);
  const from = new Int32Array(W * MAP_H).fill(-1);
  const done = new Uint8Array(W * MAP_H);
  const tx = ti % W;
  const ty = (ti / W) | 0;
  const hOf = (k: number) => {
    const ax = Math.abs((k % W) - tx);
    const ay = Math.abs(((k / W) | 0) - ty);
    return Math.max(ax, ay) + (Math.SQRT2 - 1) * Math.min(ax, ay);
  };
  // a small binary heap of [f, tile]
  const heap: [number, number][] = [];
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top[1];
  };
  g[si] = 0;
  push(hOf(si), si);
  while (heap.length) {
    const k = pop();
    if (k === ti) break;
    if (done[k]) continue;
    done[k] = 1;
    const x = k % W;
    const y = (k / W) | 0;
    for (const [dx, dy, c] of N8) {
      const X = x + dx;
      const Y = y + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= MAP_H) continue;
      const q = Y * W + X;
      if (q !== ti && terrain[q] === Terrain.Mountain) continue;
      // never cut a mountain's corner
      if (
        dx &&
        dy &&
        (terrain[y * W + X] === Terrain.Mountain ||
          terrain[Y * W + x] === Terrain.Mountain)
      )
        continue;
      const ng = g[k] + c;
      if (ng < g[q]) {
        g[q] = ng;
        from[q] = k;
        push(ng + hOf(q), q);
      }
    }
  }
  if (from[ti] < 0 && si !== ti) return null;
  const out: RoadPt[] = [];
  for (let k = ti; k !== -1; k = from[k])
    out.push([(k % W) + 0.5, ((k / W) | 0) + 0.5]);
  return out.reverse();
}

/** keeps only the corners: from each point, the farthest one still in a clear straight line */
function pull(terrain: ArrayLike<number>, pts: RoadPt[]): RoadPt[] {
  const out: RoadPt[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(terrain, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

interface RoadCache {
  route: Map<string, RoadPt[]>;
  tiles: Map<string, Int32Array>;
  bridges: Map<string, Int32Array>;
}
const caches = new WeakMap<object, RoadCache>();
const cacheOf = (terrain: ArrayLike<number> & object) => {
  let c = caches.get(terrain);
  if (!c)
    caches.set(
      terrain,
      (c = { route: new Map(), tiles: new Map(), bridges: new Map() }),
    );
  return c;
};

/**
 * The road from a to b (tile centres, in tiles): straight when nothing is in the way, otherwise
 * around the mountains. Always starts at a and ends at b. Do not change the returned array.
 */
export function roadRoute(
  terrain: ArrayLike<number> & object,
  a: RoadPt,
  b: RoadPt,
): RoadPt[] {
  const m = cacheOf(terrain).route;
  const key = `${a[0]},${a[1]}>${b[0]},${b[1]}`;
  const hit = m.get(key);
  if (hit) return hit;
  let path: RoadPt[] = [a, b];
  if (!clear(terrain, a, b)) {
    const found = search(terrain, a, b);
    if (found && found.length > 1) {
      found[0] = a;
      found[found.length - 1] = b;
      path = pull(terrain, found);
    }
  }
  m.set(key, path);
  return path;
}

/** the tiles under the road between the posts at tiles (ax, ay) and (bx, by), each once, in order */
export function roadTiles(
  terrain: ArrayLike<number> & object,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Int32Array {
  const c = cacheOf(terrain).tiles;
  const key = `${ax},${ay}>${bx},${by}`;
  const hit = c.get(key);
  if (hit) return hit;
  const pts = roadRoute(terrain, [ax + 0.5, ay + 0.5], [bx + 0.5, by + 0.5]);
  const out: number[] = [];
  const seen = new Set<number>();
  for (let s = 1; s < pts.length; s++) {
    const [px, py] = pts[s - 1];
    const [qx, qy] = pts[s];
    const n = Math.max(1, Math.ceil(vecLen(qx - px, qy - py) / STEP));
    for (let i = 0; i <= n; i++) {
      const x = (px + ((qx - px) * i) / n) | 0;
      const y = (py + ((qy - py) * i) / n) | 0;
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      const k = y * MAP_W + x;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  }
  const tiles = Int32Array.from(out);
  c.set(key, tiles);
  return tiles;
}

/** how far a bridge reaches onto the shore past the water's edge, tiles */
const SHORE = 0.3;

/** half a bridge's width, tiles (the map's bridge tile is 12 px of a 20 px tile) */
const BRIDGE_HALF = 0.3;

const water = (terrain: ArrayLike<number>, x: number, y: number) =>
  x >= 0 &&
  y >= 0 &&
  x < MAP_W &&
  y < MAP_H &&
  terrain[(y | 0) * MAP_W + (x | 0)] === Terrain.Water;

/**
 * The stretches of the straight line p → q (in tiles) that a bridge spans: where it runs over
 * water, as fractions [from, to] of its length, a little wider than the water so the bridge rests
 * on the shores. The map draws its bridges along these and the simulation lets troops walk them.
 */
export function bridgeSpans(
  terrain: ArrayLike<number>,
  p: RoadPt,
  q: RoadPt,
): [number, number][] {
  const len = vecLen(q[0] - p[0], q[1] - p[1]);
  if (!len) return [];
  const n = Math.ceil(len / 0.1);
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const wet = water(
      terrain,
      p[0] + ((q[0] - p[0]) * i) / n,
      p[1] + ((q[1] - p[1]) * i) / n,
    );
    if (wet && start < 0) start = i;
    if ((!wet || i === n) && start >= 0) {
      const end = wet ? i : i - 1;
      const pad = SHORE / len;
      const a = Math.max(0, start / n - pad);
      const b = Math.min(1, end / n + pad);
      const last = out[out.length - 1];
      if (last && a <= last[1]) last[1] = b;
      else out.push([a, b]);
      start = -1;
    }
  }
  return out;
}

/**
 * The water tiles a bridge of the road between the posts at tiles (ax, ay) and (bx, by) covers:
 * every water tile under the planks (the bridge's width, not only its middle line) along each
 * stretch of bridgeSpans of the road's route, and every water tile of roadTiles (so the road never
 * runs over water off its bridge). Side by side they always join edge to edge, so troops
 * can walk them tile to tile. Empty when the road crosses no water. Do not change the returned array.
 */
export function bridgeTiles(
  terrain: ArrayLike<number> & object,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Int32Array {
  const c = cacheOf(terrain).bridges;
  const key = `${ax},${ay}>${bx},${by}`;
  const hit = c.get(key);
  if (hit) return hit;
  const pts = roadRoute(terrain, [ax + 0.5, ay + 0.5], [bx + 0.5, by + 0.5]);
  const out: number[] = [];
  const seen = new Set<number>();
  const mark = (x: number, y: number) => {
    if (!water(terrain, x, y)) return;
    const k = (y | 0) * MAP_W + (x | 0);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  for (let s = 1; s < pts.length; s++) {
    const p = pts[s - 1];
    const q = pts[s];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = vecLen(dx, dy);
    if (!len) continue;
    // across the bridge, half its width each way
    const nx = (-dy / len) * BRIDGE_HALF;
    const ny = (dx / len) * BRIDGE_HALF;
    for (const [u0, u1] of bridgeSpans(terrain, p, q)) {
      const n = Math.max(1, Math.ceil(((u1 - u0) * len) / 0.1));
      for (let i = 0; i <= n; i++) {
        const u = u0 + ((u1 - u0) * i) / n;
        const x = p[0] + dx * u;
        const y = p[1] + dy * u;
        for (let j = -3; j <= 3; j++) mark(x + (nx * j) / 3, y + (ny * j) / 3);
      }
    }
  }
  // and any water tile the road's middle line clips at a corner too thin for a span of its own
  for (const k of roadTiles(terrain, ax, ay, bx, by))
    mark(k % MAP_W, (k / MAP_W) | 0);
  const tiles = Int32Array.from(out);
  c.set(key, tiles);
  return tiles;
}
