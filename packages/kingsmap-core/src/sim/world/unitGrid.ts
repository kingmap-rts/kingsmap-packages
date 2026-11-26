/**
 * A live grid of the units for finding foes near a point (KAN-78): target finding, a unit's foe
 * in reach, parting blows and turret volleys look at the buckets around them instead of every
 * unit of the match.
 *
 * It is exact: a query returns every unit that could be within the asked radius, as indices into
 * G.units in ascending order, so a loop over it visits the same units in the same order as a loop
 * over G.units that skips the far ones, and finds the same foe (ties included).
 *
 * It lives for one tick: fileUnits() builds it in update() (before the first query), every change
 * of a unit's position re-files the unit (unitMoved, called where the sim moves units), units added
 * during the tick are taken in by every query, and dropUnitGrid() ends it before G.units is
 * compacted. Outside a tick (intents applied between ticks, tests) a query returns every unit.
 */
import type { Unit } from './types';
import { MAP_H, MAP_W } from '../config/map';
import { G } from '../state';

/** a bucket's side, tiles */
const CELL = 4;
const GW = Math.ceil(MAP_W / CELL);
const GH = Math.ceil(MAP_H / CELL);

/** indices into G.units per bucket, ascending */
const buckets: number[][] = Array.from({ length: GW * GH }, () => []);
/** the bucket each filed unit is in (by its index) */
const filedIn: number[] = [];
/** each filed unit's index in G.units */
const indexOf = new Map<Unit, number>();
/** the G.units the grid was built for (null: no grid) */
let filedFor: Unit[] | null = null;
/** units at indices from here on were added after the grid was built */
let filed = 0;

const clampX = (b: number) => (b < 0 ? 0 : b >= GW ? GW - 1 : b);
const clampY = (b: number) => (b < 0 ? 0 : b >= GH ? GH - 1 : b);
const bucketOf = (x: number, y: number) =>
  clampY(Math.floor(y / CELL)) * GW + clampX(Math.floor(x / CELL));

/** files every unit of the match under its bucket: the start of a tick's grid */
export function fileUnits() {
  for (const b of buckets) b.length = 0;
  indexOf.clear();
  const us = G.units;
  filedIn.length = us.length;
  for (let i = 0; i < us.length; i++) {
    const k = bucketOf(us[i].x, us[i].y);
    buckets[k].push(i);
    filedIn[i] = k;
    indexOf.set(us[i], i);
  }
  filedFor = us;
  filed = us.length;
}

/** the grid is over (G.units is about to be compacted, or the tick is done) */
export function dropUnitGrid() {
  filedFor = null;
  indexOf.clear();
}

/** u's position changed: it moves to its new bucket */
export function unitMoved(u: Unit) {
  if (filedFor !== G.units) return;
  const i = indexOf.get(u);
  if (i === undefined) return;
  const k = bucketOf(u.x, u.y);
  const was = filedIn[i];
  if (k === was) return;
  const from = buckets[was];
  from.splice(from.indexOf(i), 1);
  const to = buckets[k];
  let at = to.length;
  while (at > 0 && to[at - 1] > i) at--;
  to.splice(at, 0, i);
  filedIn[i] = k;
}

/** a little more than asked, so a unit right on the edge is never lost to rounding, tiles */
const PAD = 0.5;

const found: number[] = [];

/**
 * Indices into G.units (ascending) of every unit within r tiles of (x, y) along each axis, and
 * maybe some farther ones: the caller still checks the distance. The array is reused by the next
 * query.
 */
export function unitsNear(x: number, y: number, r: number): number[] {
  found.length = 0;
  const us = G.units;
  if (filedFor !== us) {
    for (let i = 0; i < us.length; i++) found.push(i);
    return found;
  }
  const x0 = clampX(Math.floor((x - r - PAD) / CELL));
  const x1 = clampX(Math.floor((x + r + PAD) / CELL));
  const y0 = clampY(Math.floor((y - r - PAD) / CELL));
  const y1 = clampY(Math.floor((y + r + PAD) / CELL));
  for (let by = y0; by <= y1; by++)
    for (let bx = x0; bx <= x1; bx++)
      for (const i of buckets[by * GW + bx]) found.push(i);
  if (y1 > y0 || x1 > x0) found.sort((a, b) => a - b);
  for (let i = filed; i < us.length; i++) found.push(i);
  return found;
}
