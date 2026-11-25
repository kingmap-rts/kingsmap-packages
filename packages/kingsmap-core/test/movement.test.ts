import { describe, expect, it } from 'vitest';
import { createGame, type Game } from '../src/index';
import type { Unit } from '../src/sim/world/types';
import { walkable } from '../src/sim/world/terrain';

/** a match where only seat 0 plays: no bots, no fights, nobody starves */
function calm(seed: number) {
  const game = createGame({ seed, headless: true, humans: { 0: 'a' } });
  for (const p of game.world.players) if (p.id !== 0) p.alive = false;
  return game;
}
const keepAlive = (us: Unit[]) => {
  for (const u of us) {
    u.hp = u.maxhp;
    u.supplied = true;
  }
};
const mine = (game: Game) =>
  game.world.units.filter(u => !u.dead && u.owner === 0 && u.type === 'inf');
const near = (u: Unit, x: number, y: number) =>
  Math.hypot(u.x - x - 0.5, u.y - y - 0.5) < 0.6;

/** n walkable tiles in a row with walkable rows above and below */
function openRow(n: number): [number, number] {
  for (let y = 10; y < 70; y++)
    for (let x = 10; x < 110 - n; x++) {
      let ok = true;
      for (let k = 0; k < n && ok; k++)
        ok =
          walkable(x + k, y - 1) &&
          walkable(x + k, y) &&
          walkable(x + k, y + 1);
      if (ok) return [x, y];
    }
  throw new Error('no open row');
}

describe('movement', () => {
  it('a unit on a long walk moves every tick and reaches the goal', () => {
    const game = calm(21);
    const u = mine(game)[0];
    game.apply(0, { t: 'move', ids: [u.id], x: 110, y: 10, mode: 'move' });
    expect(u.path!.length).toBeGreaterThan(80);
    let ticks = 0;
    while (u.path && u.path.length && ticks < 2000) {
      const x = u.x;
      const y = u.y;
      keepAlive([u]);
      game.step();
      ticks++;
      // never a tick standing still on the way (it used to lose one at every tile)
      if (u.path && u.path.length)
        expect(Math.hypot(u.x - x, u.y - y)).toBeGreaterThan(0.05);
    }
    expect(near(u, u.dest![0], u.dest![1])).toBe(true);
  });

  it('two units walking head-on step around each other', () => {
    const game = calm(25);
    const [x, y] = openRow(10);
    const [a, b] = mine(game);
    a.x = x + 0.5;
    b.x = x + 9.5;
    a.y = b.y = y + 0.5;
    game.apply(0, { t: 'move', ids: [a.id], x: x + 9, y, mode: 'move' });
    game.apply(0, { t: 'move', ids: [b.id], x, y, mode: 'move' });
    for (let i = 0; i < 200; i++) {
      keepAlive([a, b]);
      game.step();
    }
    expect(near(a, x + 9, y)).toBe(true);
    expect(near(b, x, y)).toBe(true);
  });

  it('a group sent far away arrives whole, nobody stalls on a shared waypoint', () => {
    for (const seed of [17, 25, 40]) {
      const game = calm(seed);
      const p = game.world.players[0];
      p.res.wood = p.res.steel = p.res.food = 5000;
      p.pop = 300;
      p.labor = 0;
      for (let i = 0; i < 8; i++) game.apply(0, { t: 'train', type: 'inf' });
      const us = mine(game);
      for (const u of us) u.solo = true; // walk as single soldiers, not merged into squads
      const tx = us[0].x < 60 ? 105 : 15;
      const ty = us[0].y < 40 ? 65 : 15;
      game.apply(0, {
        t: 'move',
        ids: us.map(u => u.id),
        x: tx,
        y: ty,
        mode: 'move',
      });
      // how far from its goal each soldier was when it stopped walking
      const off = new Map<number, number>();
      for (let i = 0; i < 1500 && off.size < us.length; i++) {
        keepAlive(us);
        game.step();
        for (const u of us)
          if (!off.has(u.id) && !(u.path && u.path.length))
            off.set(
              u.id,
              // a group march ends at the unit's own place in the ranks
              Math.hypot(u.x - u.end![0], u.y - u.end![1]),
            );
      }
      expect(off.size).toBe(us.length);
      for (const d of off.values()) expect(d).toBeLessThan(0.6);
    }
  });

  it('a goal cut off by mountains or water still sends the unit to its nearest edge', () => {
    const game = calm(6);
    const u = mine(game)[0];
    game.apply(0, { t: 'move', ids: [u.id], x: 14, y: 25, mode: 'move' });
    expect(u.path?.length).toBeGreaterThan(5);
    for (let i = 0; i < 600 && u.path && u.path.length; i++) {
      keepAlive([u]);
      game.step();
    }
    expect(Math.hypot(u.x - 14.5, u.y - 25.5)).toBeLessThan(2.5);
  });
});
