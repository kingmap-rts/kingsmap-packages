import { describe, it, expect } from 'vitest';
import { runMatch } from './support/match';

/**
 * The port must behave like the prototype it came from.
 * Reference: 98 browser-prototype (v12) matches, 10 bots, measured at minute 20:
 *   leader's land share — median 19.0%, p10 16.7%, p90 21.9%
 *   eliminated players by minute 20 — mean 0.76
 * The port changes only the random stream (Math.random → seeded rnd) and trig/hypot
 * implementations, so statistics must match within sampling noise.
 * Bots run the prototype's AI here (ai2: false); the campaign AI is newer than the prototype.
 */
const OLD_AI = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [i, { ai2: false }]),
);
const REF = { medianLeader: 19.0, p10: 16.7, p90: 21.9, elims: 0.76 };

describe('parity with the prototype', () => {
  it('leader share and eliminations at minute 20 match the prototype', async () => {
    const N = 8;
    const leaders: number[] = [];
    const elims: number[] = [];
    for (let k = 0; k < N; k++) {
      const r = await runMatch({
        seed: 5000 + k,
        maxT: 1200,
        botParams: OLD_AI,
      });
      const last = r.shares[r.shares.length - 1];
      leaders.push(Math.max(...last));
      elims.push(last.filter(v => v === 0).length);
      await new Promise(r => setImmediate(r)); // let the test runner breathe between matches
    }
    leaders.sort((a, b) => a - b);
    const median = (leaders[3] + leaders[4]) / 2;
    const meanElims = elims.reduce((a, b) => a + b, 0) / N;
    console.log(
      'port: median leader',
      median,
      'leaders',
      leaders,
      'mean elims',
      meanElims,
    );
    expect(median).toBeGreaterThan(REF.p10 - 1);
    expect(median).toBeLessThan(REF.p90 + 1);
    expect(meanElims).toBeLessThan(REF.elims + 1.5);
  }, 600000);
});
