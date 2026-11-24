/** Grid indices, distances and deterministic trigonometry (identical in every JS engine). */
import { MAP_H, MAP_W } from '../config/map';

export const inBounds = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

export const tileIndex = (x: number, y: number) => y * MAP_W + x;

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
