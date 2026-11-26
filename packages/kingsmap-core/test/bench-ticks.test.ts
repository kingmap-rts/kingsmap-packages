import { describe, expect, it } from 'vitest';
import { createGame, type Game } from '../src/index';
import { addUnit } from '../src/sim/world/entities';
import { walkable } from '../src/sim/world/terrain';
import { MAP_H, MAP_W, SEATS } from '../src/sim/config/map';

/** a fixed pseudo-random sequence for placing troops (the sim's own rng stays untouched) */
function lcg(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/**
 * A crowded match: every seat a bot, each with UNITS_PER_SEAT single soldiers, half of them
 * around its castle and half in the middle of the map, where they all meet and fight.
 */
const UNITS_PER_SEAT = 100;

function crowd(): Game {
  const game = createGame({ seed: 1234, headless: true });
  const G = game.world;
  const next = lcg(99);
  const types = ['inf', 'inf', 'raid', 'militia', 'inf', 'siege'] as const;
  for (let seat = 0; seat < SEATS; seat++) {
    const hq = G.players[seat].hq;
    for (let k = 0; k < UNITS_PER_SEAT;) {
      const home = k < UNITS_PER_SEAT / 2;
      const x = home
        ? hq.x + (next() - 0.5) * 12
        : MAP_W / 2 + (next() - 0.5) * 30;
      const y = home
        ? hq.y + (next() - 0.5) * 12
        : MAP_H / 2 + (next() - 0.5) * 20;
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
      if (!walkable(x | 0, y | 0)) continue;
      addUnit(types[k % types.length], seat, x, y);
      k++;
    }
  }
  return game;
}

/**
 * Not a check of the rules: times ticks of a big battle (10 seats, ~1000 units) and prints the
 * milliseconds per tick, so a change to target finding can be measured (KAN-78).
 */
describe('tick benchmark', () => {
  it('10 seats, ~1000 units: ms per tick', () => {
    const game = crowd();
    const n = game.world.units.length;
    expect(n).toBeGreaterThanOrEqual(SEATS * UNITS_PER_SEAT);
    for (let i = 0; i < 5; i++) game.step(); // warm-up
    const ticks = 100;
    let units = 0;
    let ms = 0;
    for (let i = 0; i < ticks; i++) {
      units += game.world.units.length;
      const t0 = performance.now();
      game.step();
      ms += performance.now() - t0;
    }
    ms /= ticks;
    console.log(
      `[bench] ${n} units at start, ${Math.round(units / ticks)} on average over ${ticks} ticks: ` +
        `${ms.toFixed(2)} ms/tick, hash ${game.hash()}`,
    );
    expect(ms).toBeGreaterThan(0);
  });
});
