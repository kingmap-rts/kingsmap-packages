/** Grid indices, distances and deterministic trigonometry (identical in every JS engine). */
import { MAP_H, MAP_W } from '../config/map';

export const inBounds = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

export const tileIndex = (x: number, y: number) => y * MAP_W + x;

/** x * x (the `**` operator is engine-dependent, like Math.pow) */
export const sq = (x: number) => x * x;

export const vecLen = (x: number, y: number) => Math.sqrt(x * x + y * y);

export const dist = (ax: number, ay: number, bx: number, by: number) =>
  vecLen(ax - bx, ay - by);

// deterministic trig (pure +,*), identical in every JS engine — used where sim results depend on it
export function detSin(x: number) {
  const TAU = 6.283185307179586;
  x = x - Math.floor(x / TAU) * TAU;
  if (x > Math.PI) x -= TAU;
  let r = x;
  let t = x;
  const x2 = x * x;
  for (let n = 1; n < 12; n++) {
    t *= -x2 / (2 * n * (2 * n + 1));
    r += t;
  }
  return r;
}

export const detCos = (x: number) => detSin(x + 1.5707963267948966);

/** atan(z) for 0 <= z <= 1: two half-angle steps bring z under tan(pi/16), then a short series */
function detAtanUnit(z: number) {
  z = z / (1 + Math.sqrt(1 + z * z));
  z = z / (1 + Math.sqrt(1 + z * z));
  const z2 = z * z;
  let t = z;
  let r = z;
  for (let n = 1; n < 13; n++) {
    t *= -z2;
    r += t / (2 * n + 1);
  }
  return 4 * r;
}

/**
 * Deterministic Math.atan2 (only +, -, *, / and the exactly rounded Math.sqrt), identical in
 * every JS engine. Same quadrants and signed zeros as Math.atan2; agrees with it to a few ulp.
 */
export function detAtan2(y: number, x: number) {
  if (y !== y || x !== x) return NaN;
  const PI = Math.PI;
  if (y === 0)
    return x < 0 || Object.is(x, -0) ? (Object.is(y, -0) ? -PI : PI) : y;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let a: number;
  if (ax === ay) a = PI / 4;
  else if (ay < ax) a = detAtanUnit(ay / ax);
  else a = PI / 2 - detAtanUnit(ax / ay);
  if (x < 0) a = PI - a;
  return y < 0 ? -a : a;
}

export function segmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  return vecLen(px - ax - t * dx, py - ay - t * dy);
}
