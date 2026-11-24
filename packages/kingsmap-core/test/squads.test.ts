import { describe, expect, it } from 'vitest';
import type { UnitType } from '@kingmap-rts/kingsmap-types';
import { createGame, rules, type Game } from '../src/index';
import { memberLoss } from '../src/sim/systems/squads';

const start = () =>
  createGame({ seed: 21, headless: true, humans: { 0: 'a' } });
function hire(game: Game, type: UnitType, n: number) {
  const G = game.world;
  const p = G.players[0];
  p.res.wood = p.res.steel = p.res.food = 2000;
  p.pop = 200;
  p.labor = 0;
  const before = new Set(G.units.map(u => u.id));
  for (let i = 0; i < n; i++)
    expect(game.apply(0, { t: 'train', type })).toBeNull();
  return G.units.filter(
    u => u.owner === 0 && u.type === type && !before.has(u.id),
  );
}
const mine = (game: Game, type: UnitType) =>
  game.world.units.filter(u => !u.dead && u.owner === 0 && u.type === type);
const run = (game: Game, ticks: number) => {
  for (let i = 0; i < ticks; i++) game.step();
};

describe('squads (one unit, several soldiers)', () => {
  it('idle soldiers of one type merge into one unit of at most 5', () => {
    const game = start();
    hire(game, 'inf', 7);
    run(game, 120);
    const inf = mine(game, 'inf');
    expect(rules.soldierCount(inf)).toBe(10); // 3 starting + 7 hired, nobody lost
    expect(Math.max(...inf.map(u => u.n))).toBe(5);
    expect(inf.length).toBeLessThan(10);
  });

  it('a squad has the summed health of its soldiers', () => {
    const game = start();
    hire(game, 'inf', 5);
    run(game, 120);
    const sq = mine(game, 'inf').find(u => u.n === 5)!;
    expect(sq).toBeTruthy();
    expect(sq.maxhp).toBeCloseTo(5 * rules.UNITS.inf.hp);
  });

  it('soldiers fall one by one as the squad loses health', () => {
    const game = start();
    hire(game, 'inf', 5);
    run(game, 120);
    const sq = mine(game, 'inf').find(u => u.n === 5)!;
    const lost0 = game.world.players[0].stats.unitsLost;
    sq.hp = sq.mhp * 3.5;
    memberLoss(sq, 1);
    expect(sq.n).toBe(4);
    expect(game.world.players[0].stats.unitsLost).toBe(lost0 + 1);
  });

  it('heavy units squad by 3; disband splits back and they stay single until grouped by hand', () => {
    const game = start();
    hire(game, 'siege', 3);
    run(game, 120);
    const sq = mine(game, 'siege').find(u => u.n === 3)!;
    expect(sq).toBeTruthy();
    expect(game.apply(0, { t: 'unsquad', ids: [sq.id] })).toBeNull();
    expect(rules.soldierCount(mine(game, 'siege'))).toBe(3);
    expect(mine(game, 'siege').length).toBe(3);
    run(game, 120);
    expect(mine(game, 'siege').every(u => u.n === 1)).toBe(true);
    expect(
      game.apply(0, { t: 'squad', ids: mine(game, 'siege').map(u => u.id) }),
    ).toBeNull();
    run(game, 150);
    expect(mine(game, 'siege').length).toBe(1);
  });

  it('an order moves the squad as one unit', () => {
    const game = start();
    hire(game, 'inf', 5);
    run(game, 120);
    const sq = mine(game, 'inf').find(u => u.n === 5)!;
    const hq = game.world.players[0].hq;
    game.apply(0, {
      t: 'move',
      ids: [sq.id],
      x: hq.x + 6,
      y: hq.y,
      mode: 'move',
    });
    expect(sq.dest).toBeTruthy();
  });
});
