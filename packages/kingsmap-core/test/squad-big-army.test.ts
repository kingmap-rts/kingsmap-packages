import { describe, expect, it } from 'vitest';
import type { Unit } from '@kingmap-rts/kingsmap-types';
import { createGame, type Game } from '../src/index';
import { addUnit } from '../src/sim/world/entities';
import { walkable } from '../src/sim/world/terrain';
import { squadSize } from '../src/sim/systems/squads';

/** seat 0 is a human, seat 1 a bot whose own brain is kept quiet */
function start() {
  const game = createGame({ seed: 21, headless: true, humans: { 0: 'a' } });
  game.world.players[1].ai.next = 1e9;
  for (const p of game.world.players) p.res.food = 1e5;
  return game;
}
const inf = (game: Game, seat: number) =>
  game.world.units.filter(u => !u.dead && u.owner === seat && u.type === 'inf');

/** n single foot soldiers scattered (a fixed pattern) over a patch next to a seat's castle */
function scatter(game: Game, seat: number, n: number, ox: number, oy: number) {
  const hq = game.world.players[seat].hq;
  let s = 7;
  const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const placed: Unit[] = [];
  while (placed.length < n) {
    const x = hq.x + ox + next() * 7;
    const y = hq.y + oy + next() * 7;
    if (walkable(x | 0, y | 0)) placed.push(addUnit('inf', seat, x, y));
  }
  return placed;
}

/**
 * steps until nobody of the seat is on its way to a squad (or the time runs out); returns the
 * seconds it took and how far the joiners walked, tiles
 */
function formUp(game: Game, seat: number, seconds: number) {
  const G = game.world;
  const t0 = G.t;
  const at = new Map(inf(game, seat).map(u => [u.id, [u.x, u.y]]));
  let walked = 0;
  while (G.t - t0 < seconds && inf(game, seat).some(u => u.joinTo)) {
    game.step();
    for (const u of inf(game, seat)) {
      const l = at.get(u.id)!;
      walked += Math.hypot(u.x - l[0], u.y - l[1]);
      at.set(u.id, [u.x, u.y]);
    }
  }
  return { took: G.t - t0, walked };
}
/** at most one squad of the seat is not full */
const formed = (game: Game, seat: number) =>
  inf(game, seat).filter(u => u.n < squadSize('inf')).length <= 1;

describe('a big army forms squads (KAN-45)', () => {
  it('50+ soldiers squad up by one «Squad» in a few seconds, each with its nearest mates', () => {
    const game = start();
    scatter(game, 0, 50, -2, 1);
    const ids = inf(game, 0).map(u => u.id);
    expect(ids.length).toBeGreaterThanOrEqual(50);
    expect(game.apply(0, { t: 'squad', ids })).toBeNull();
    const { took, walked } = formUp(game, 0, 10);
    expect(took).toBeLessThan(4);
    expect(formed(game, 0)).toBe(true);
    // nobody crosses the crowd: the soldiers walk a couple of tiles each on average
    expect(walked / ids.length).toBeLessThan(2);
  });

  it('a move order to the whole selection right after «Squad» does not call the forming off', () => {
    const game = start();
    scatter(game, 0, 50, -2, 1);
    const ids = inf(game, 0).map(u => u.id);
    expect(game.apply(0, { t: 'squad', ids })).toBeNull();
    game.step();
    const hq = game.world.players[0].hq;
    game.apply(0, { t: 'move', ids, x: hq.x + 8, y: hq.y - 4 });
    const { took } = formUp(game, 0, 15);
    expect(took).toBeLessThan(15);
    expect(formed(game, 0)).toBe(true);
  });

  it('soldiers on their way to their squad do not turn aside for foes nearby', () => {
    const game = start();
    scatter(game, 0, 50, -2, 1);
    // an enemy band right next to the crowd
    const hq = game.world.players[0].hq;
    for (let i = 0; i < 6; i++) addUnit('inf', 1, hq.x + 6 + i * 0.6, hq.y + 9);
    const ids = inf(game, 0).map(u => u.id);
    expect(game.apply(0, { t: 'squad', ids })).toBeNull();
    let distracted = 0;
    const t0 = game.world.t;
    while (game.world.t - t0 < 6 && inf(game, 0).some(u => u.joinTo)) {
      game.step();
      distracted += inf(game, 0).filter(u => u.joinTo && u.tgt).length;
    }
    expect(distracted).toBe(0);
    expect(inf(game, 0).some(u => u.joinTo)).toBe(false);
  });

  it('a bot gathers a big idle army into squads on its own in a few seconds', () => {
    const game = start();
    scatter(game, 1, 50, -2, 1);
    for (let i = 0; i < 60; i++) game.step();
    const short = inf(game, 1).filter(u => u.n < squadSize('inf'));
    expect(short.length).toBeLessThanOrEqual(1);
  });
});
