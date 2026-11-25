/**
 * Travel along a road as the map draws it (KAN-55): a caravan drives the road's route
 * (roads.ts roadRoute, around the mountains) at its own steady pace, so a road that winds around
 * a mountain takes longer, instead of the caravan cutting straight through the mountain while the
 * map shows it racing along the detour. Only +, -, *, / and sqrt: the same in every JS engine.
 */
import type { Building, Convoy, Link } from '../world/types';
import { G, terrainMap } from '../state';
import { dist, segmentDist } from '../util/geometry';
import { roadRoute, type RoadPt } from './roads';

/** the length of a route, tiles */
export function routeLength(pts: readonly RoadPt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++)
    s += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return s;
}

/** the route of a link from its post a to its post b, the way the map draws the road */
export const linkRoute = (l: Link): RoadPt[] =>
  roadRoute(terrainMap, [l.a.x + 0.5, l.a.y + 0.5], [l.b.x + 0.5, l.b.y + 0.5]);

/** the routes turned round (from b to a), per route: never changed, like the routes themselves */
const reversed = new WeakMap<RoadPt[], RoadPt[]>();

/** the links of the network by key (G.links is a new array after every recompute) */
let byKeyOf: Link[] | null = null;
const byKey = new Map<string, Link>();

/**
 * The route a caravan on its road drives, from where it left to the post it drives to; null when
 * it is on no road (a gift between castles) or its road is gone: then it drives straight.
 */
export function convoyRoute(c: Convoy, to: Building): RoadPt[] | null {
  if (!c.key) return null;
  if (byKeyOf !== G.links) {
    byKeyOf = G.links;
    byKey.clear();
    for (const l of G.links) byKey.set(l.key, l);
  }
  const l = byKey.get(c.key);
  if (!l) return null;
  const pts = linkRoute(l);
  if (l.b === to) return pts;
  if (l.a !== to) return null;
  let back = reversed.get(pts);
  if (!back) reversed.set(pts, (back = [...pts].reverse()));
  return back;
}

/** the stretch of the route a point on it lies on: the index of the stretch's end */
function stretchOf(pts: readonly RoadPt[], x: number, y: number): number {
  let best = 1;
  let bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const d = segmentDist(x, y, ax, ay, bx, by);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** how much of the route is left from the point (x, y) on it to its end, tiles */
export function routeLeft(pts: readonly RoadPt[], x: number, y: number) {
  if (pts.length < 2) return 0;
  let i = stretchOf(pts, x, y);
  let s = dist(x, y, pts[i][0], pts[i][1]);
  for (i++; i < pts.length; i++)
    s += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return s;
}

/**
 * Moves a point on the route `step` tiles on towards its end, around the corners.
 * Returns the new point, or null when the step reaches the end.
 */
export function stepAlong(
  pts: readonly RoadPt[],
  x: number,
  y: number,
  step: number,
): RoadPt | null {
  if (pts.length < 2) return null;
  for (let i = stretchOf(pts, x, y); i < pts.length; i++) {
    const [tx, ty] = pts[i];
    const d = dist(x, y, tx, ty);
    if (d > step) return [x + ((tx - x) / d) * step, y + ((ty - y) / d) * step];
    step -= d;
    x = tx;
    y = ty;
  }
  return null;
}
