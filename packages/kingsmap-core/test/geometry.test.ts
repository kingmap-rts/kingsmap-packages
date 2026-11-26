import { describe, expect, it } from 'vitest';
import { detAtan2, detCos, detSin, sq, vecLen } from '../src/sim/util/geometry';

// a small deterministic LCG, so the samples are the same on every run
function samples(n: number, scale: number) {
  let s = 12345;
  const next = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s / 4294967296 - 0.5) * 2 * scale;
  };
  return Array.from({ length: n }, () => [next(), next()] as const);
}

describe('deterministic geometry', () => {
  it('detAtan2 agrees with Math.atan2 within about 4 ulp', () => {
    for (const scale of [1e-6, 1, 3, 100, 1e6])
      for (const [y, x] of samples(4000, scale)) {
        const want = Math.atan2(y, x);
        expect(Math.abs(detAtan2(y, x) - want)).toBeLessThanOrEqual(
          1e-15 * Math.max(1, Math.abs(want)),
        );
      }
  });

  it('detAtan2 handles axes, diagonals, zeros and NaN like Math.atan2', () => {
    const cases: [number, number][] = [
      [0, 0],
      [-0, 0],
      [0, -0],
      [-0, -0],
      [0, 5],
      [0, -5],
      [-0, -5],
      [5, 0],
      [-5, 0],
      [5, -0],
      [3, 3],
      [3, -3],
      [-3, 3],
      [-3, -3],
      [1, 1e-300],
      [1e-300, 1],
      [1, -1e-300],
      [Infinity, 1],
      [1, Infinity],
      [1, -Infinity],
    ];
    for (const [y, x] of cases)
      expect(Object.is(detAtan2(y, x), Math.atan2(y, x))).toBe(true);
    expect(detAtan2(NaN, 1)).toBeNaN();
    expect(detAtan2(1, NaN)).toBeNaN();
  });

  it('detAtan2 inverts detSin/detCos', () => {
    for (let a = -3.1; a < 3.1; a += 0.01)
      expect(Math.abs(detAtan2(detSin(a), detCos(a)) - a)).toBeLessThan(1e-12);
  });

  it('pins exact bits so a change of the formula shows up', () => {
    // these values are part of the simulation: changing them changes every match
    expect(detAtan2(1, 2)).toBe(0.4636476090008061);
    expect(detAtan2(-7, -3)).toBe(-1.97568811307998);
    expect(detSin(1)).toBe(0.8414709848078965);
    expect(detCos(2.4)).toBe(-0.7373937155412457);
  });

  // detSin is an 11-term series on [-pi, pi]: ~1e-13, enough for the game, and fixed by the golden
  it('detSin/detCos agree with Math.sin/cos', () => {
    for (let a = -20; a < 20; a += 0.37) {
      expect(Math.abs(detSin(a) - Math.sin(a))).toBeLessThan(1e-12);
      expect(Math.abs(detCos(a) - Math.cos(a))).toBeLessThan(1e-12);
    }
  });

  it('vecLen and sq', () => {
    expect(vecLen(3, 4)).toBe(5);
    expect(sq(-1.5)).toBe(2.25);
  });
});
