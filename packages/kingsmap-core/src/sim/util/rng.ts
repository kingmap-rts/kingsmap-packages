/** The seeded random stream of the active match. All randomness in the simulation goes through rnd(). */
import { matchState } from '../state';

export function rand() {
  let rs = matchState.rng | 0;
  rs = (rs + 0x6d2b79f5) | 0;
  matchState.rng = rs;
  let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(a: number, b: number) {
  return a + Math.floor(rand() * (b - a + 1));
}
