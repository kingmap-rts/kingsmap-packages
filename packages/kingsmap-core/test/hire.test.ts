import { describe, expect, it } from 'vitest';
import { createGame, type Game } from '../src/index';
import { HIRE_SPOTS } from '../src/sim/commands/build';

const start = () =>
  createGame({ seed: 21, headless: true, humans: { 0: 'a' } });
function hire(game: Game, n: number) {
  const G = game.world;
  const p = G.players[0];
  p.res.wood = p.res.steel = p.res.food = 5000;
  p.pop = 300;
  p.labor = 0;
  const before = new Set(G.units.map(u => u.id));
  for (let i = 0; i < n; i++)
    expect(game.apply(0, { t: 'train', type: 'inf' })).toBeNull();
  return G.units.filter(u => u.owner === 0 && !before.has(u.id));
}

describe('hiring (KAN-17: new troops stand in front of the building)', () => {
  it('a hired unit appears below the castle on screen, not behind it', () => {
    const game = start();
    const hq = game.world.players[0].hq;
    const [u] = hire(game, 1);
    expect(u.y).toBeGreaterThan(hq.y + 1);
    expect(Math.abs(u.x - (hq.x + 0.5))).toBeLessThan(1);
  });

  it('the first ten hires all stand in the two rows in front of it', () => {
    const game = start();
    const hq = game.world.players[0].hq;
    for (const u of hire(game, 10)) {
      expect(u.y).toBeGreaterThan(hq.y + 1);
      expect(u.y).toBeLessThan(hq.y + 3);
    }
  });

  it('every spot around the building is still tried, the front ones first', () => {
    expect(HIRE_SPOTS.slice(0, 3)).toEqual([
      [0, 1],
      [-1, 1],
      [1, 1],
    ]);
    expect(HIRE_SPOTS.slice(0, 10).every(([, dy]) => dy >= 1)).toBe(true);
    const key = ([x, y]: readonly [number, number]) => `${x},${y}`;
    expect(new Set(HIRE_SPOTS.map(key)).size).toBe(HIRE_SPOTS.length);
    expect(HIRE_SPOTS.length).toBe(120); // the spiral of radius 5 without its centre
  });
});
