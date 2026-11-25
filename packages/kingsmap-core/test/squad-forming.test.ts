import { describe, expect, it } from 'vitest';
import type { UnitType } from '@kingmap-rts/kingsmap-types';
import { createGame, rules, type Game } from '../src/index';
import { addUnit } from '../src/sim/world/entities';

/** seat 0 is a human, seat 1 a bot */
const start = () =>
  createGame({ seed: 21, headless: true, humans: { 0: 'a' } });
const run = (game: Game, ticks: number) => {
  for (let i = 0; i < ticks; i++) game.step();
};
const of = (game: Game, seat: number, type: UnitType) =>
  game.world.units.filter(u => !u.dead && u.owner === seat && u.type === type);
/** lines up n single soldiers right next to a player's castle */
function place(game: Game, seat: number, type: UnitType, n: number) {
  const hq = game.world.players[seat].hq;
  for (let i = 0; i < n; i++) addUnit(type, seat, hq.x + 2 + i * 0.7, hq.y + 2);
}
/** keeps the bot's own brain quiet so only the squad logic moves its units */
const muteBot = (game: Game) => {
  game.world.players[1].ai.next = 1e9;
};

describe('forming squads (KAN-39)', () => {
  it("a human player's idle soldiers stay single next to each other", () => {
    const game = start();
    muteBot(game);
    place(game, 0, 'inf', 4);
    place(game, 0, 'siege', 3);
    run(game, 200);
    const inf = of(game, 0, 'inf');
    expect(rules.soldierCount(inf)).toBe(7); // 3 starting + 4 placed
    expect(inf.every(u => u.n === 1 && !u.joinTo)).toBe(true);
    expect(of(game, 0, 'siege').every(u => u.n === 1)).toBe(true);
  });

  it('hired recruits do not walk over to fill a squad on their own', () => {
    const game = start();
    muteBot(game);
    const G = game.world;
    const p = G.players[0];
    expect(
      game.apply(0, { t: 'squad', ids: of(game, 0, 'inf').map(u => u.id) }),
    ).toBeNull();
    run(game, 100);
    expect(of(game, 0, 'inf').map(u => u.n)).toEqual([3]);
    p.res.wood = p.res.steel = p.res.food = 2000;
    p.pop = 200;
    p.labor = 0;
    expect(game.apply(0, { t: 'train', type: 'inf' })).toBeNull();
    run(game, 200);
    expect(
      of(game, 0, 'inf')
        .map(u => u.n)
        .sort(),
    ).toEqual([1, 3]);
  });

  it('pressing «Squad» merges them by the rules: one type, 5 light / 3 heavy', () => {
    const game = start();
    muteBot(game);
    place(game, 0, 'inf', 4);
    place(game, 0, 'siege', 4);
    const ids = [...of(game, 0, 'inf'), ...of(game, 0, 'siege')].map(u => u.id);
    expect(game.apply(0, { t: 'squad', ids })).toBeNull();
    run(game, 200);
    expect(
      of(game, 0, 'inf')
        .map(u => u.n)
        .sort(),
    ).toEqual([2, 5]);
    expect(
      of(game, 0, 'siege')
        .map(u => u.n)
        .sort(),
    ).toEqual([1, 3]);
    // and nothing tops the leftovers up afterwards
    run(game, 200);
    expect(
      of(game, 0, 'inf')
        .map(u => u.n)
        .sort(),
    ).toEqual([2, 5]);
  });

  it("a bot's idle soldiers still gather into squads on their own", () => {
    const game = start();
    muteBot(game);
    place(game, 1, 'inf', 4);
    place(game, 1, 'siege', 3);
    run(game, 200);
    const inf = of(game, 1, 'inf');
    expect(rules.soldierCount(inf)).toBe(7);
    expect(Math.max(...inf.map(u => u.n))).toBe(5);
    expect(of(game, 1, 'siege').map(u => u.n)).toEqual([3]);
  });

  it('a bot with noSquad keeps its soldiers single', () => {
    const game = createGame({
      seed: 21,
      headless: true,
      humans: { 0: 'a' },
      botParams: { 1: { noSquad: true } },
    });
    muteBot(game);
    place(game, 1, 'inf', 4);
    run(game, 200);
    expect(of(game, 1, 'inf').every(u => u.n === 1)).toBe(true);
  });

  it('a player who left is played by the bot and squads on its own again', () => {
    const game = start();
    muteBot(game);
    place(game, 0, 'inf', 2);
    expect(game.apply(0, { t: 'leave' })).toBeNull();
    game.world.players[0].ai.next = 1e9;
    run(game, 200);
    expect(of(game, 0, 'inf').map(u => u.n)).toEqual([5]);
  });
});
