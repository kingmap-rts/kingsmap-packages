import { describe, expect, it } from 'vitest';
import { createGame } from '../src/index';

/** Plays a fixed script: bots + a "human" seat 0 that trains and moves on fixed ticks. */
function play(seed: number, ticks: number, checkpoints: number[]) {
  const game = createGame({ seed, headless: true, humans: { 0: 'tester' } });
  const G = game.world;
  const hashes: string[] = [];
  for (let i = 1; i <= ticks; i++) {
    if (i % 50 === 0)
      game.apply(0, { t: 'train', type: i % 100 === 0 ? 'raid' : 'inf' });
    if (i % 120 === 0) {
      const mine = G.units.filter(u => u.owner === 0).map(u => u.id);
      const hq = G.players[0].hq;
      game.apply(0, {
        t: 'move',
        ids: mine,
        x: hq.x + ((i / 120) % 2 ? 6 : -6),
        y: hq.y,
        mode: 'amove',
      });
    }
    game.step();
    if (checkpoints.includes(i)) hashes.push(game.hash());
  }
  return hashes;
}

describe('determinism', () => {
  it('same seed + same intents → identical state at every checkpoint', () => {
    const cps = [10, 300, 1200, 2400];
    expect(play(4242, 2400, cps)).toEqual(play(4242, 2400, cps));
  });

  it('different seeds diverge', () => {
    expect(play(1, 100, [100])).not.toEqual(play(2, 100, [100]));
  });

  it('map generation depends only on the seed', () => {
    const castles = () =>
      createGame({ seed: 777, headless: true }).world.players.map(p => [
        p.hq.x,
        p.hq.y,
      ]);
    expect(castles()).toEqual(castles());
  });

  it('two games in one process do not disturb each other', () => {
    const solo = createGame({ seed: 9, headless: true });
    for (let i = 0; i < 600; i++) solo.step();
    const a = createGame({ seed: 9, headless: true });
    const b = createGame({ seed: 10, headless: true });
    for (let i = 0; i < 600; i++) {
      a.step();
      b.step();
    }
    expect(a.hash()).toBe(solo.hash());
  });
});
