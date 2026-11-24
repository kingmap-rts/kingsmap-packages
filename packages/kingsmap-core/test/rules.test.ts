import { describe, expect, it } from 'vitest';
import { Lockstep, Terrain } from '@kingmap-rts/kingsmap-types';
import { createGame, rules } from '../src/index';

describe('intents', () => {
  it('train spends resources and population and adds a unit', () => {
    const game = createGame({ seed: 99, headless: true, humans: { 0: 'me' } });
    const p = game.world.players[0];
    const before = { steel: p.res.steel, wood: p.res.wood, pop: p.pop };
    const n0 = game.world.units.filter(u => u.owner === 0).length;
    expect(game.apply(0, { t: 'train', type: 'inf' })).toBeNull();
    const U = rules.UNITS.inf;
    expect(game.world.units.filter(u => u.owner === 0).length).toBe(n0 + 1);
    expect(p.res.steel).toBeCloseTo(before.steel - U.steel);
    expect(p.res.wood).toBeCloseTo(before.wood - U.wood);
    expect(p.pop).toBeCloseTo(before.pop - 1);
  });

  it('build accepts a valid depot spot and rejects water / far spots', () => {
    const game = createGame({ seed: 5, headless: true, humans: { 0: 'me' } });
    const G = game.world;
    const hq = G.players[0].hq;
    let spot: [number, number] | null = null;
    for (let dy = -7; dy <= 7 && !spot; dy++)
      for (let dx = -7; dx <= 7 && !spot; dx++)
        if (!game.buildError(0, hq.x + dx, hq.y + dy))
          spot = [hq.x + dx, hq.y + dy];
    expect(spot).not.toBeNull();
    const nb = G.buildings.length;
    expect(game.apply(0, { t: 'build', x: spot![0], y: spot![1] })).toBeNull();
    expect(G.buildings.length).toBe(nb + 1);
    expect(game.apply(0, { t: 'build', x: hq.x + 40, y: hq.y })?.key).toMatch(
      /^error\./,
    );
  });

  it('commands for units the seat does not own are ignored', () => {
    const game = createGame({ seed: 7, headless: true, humans: { 0: 'me' } });
    const foe = game.world.units.find(u => u.owner === 1)!;
    game.apply(0, { t: 'move', ids: [foe.id], x: 0, y: 0, mode: 'move' });
    expect(foe.dest).toBeNull();
  });

  it('one simulation tick is one server turn', () => {
    expect(Lockstep.TickSeconds * 1000).toBe(Lockstep.TurnMs);
  });
});

describe('invariants over a 15-minute bot match', () => {
  it('holds every tick sample', async () => {
    const game = createGame({ seed: 31337, headless: true, humans: {} });
    const G = game.world;
    const { terrain } = game.map;
    const walkable = (t: number) => t === Terrain.Plain || t === Terrain.Forest;
    for (let i = 1; i <= 9000; i++) {
      if (i % 250 === 0) await new Promise(res => setImmediate(res));
      game.step();
      if (i % 300 !== 0) continue;
      for (const p of G.players) {
        for (const k of ['wood', 'ore', 'steel', 'food'] as const) {
          expect(p.res[k]).toBeGreaterThanOrEqual(0);
          // the cap is clamped once per tick, income arriving later in the same tick may overshoot by <1 tick of income
          if (p.alive && p.store)
            expect(p.res[k]).toBeLessThanOrEqual(p.store * 1.01);
        }
        expect(p.pop).toBeGreaterThanOrEqual(0);
      }
      for (const u of G.units) {
        expect(u.hp).toBeLessThanOrEqual(u.maxhp + 1e-9);
        expect(walkable(terrain[(u.y | 0) * rules.MAP_W + (u.x | 0)])).toBe(
          true,
        ); // never water/mountain
        expect(G.players[u.owner].alive).toBe(true);
      }
      for (const b of G.buildings)
        expect(walkable(terrain[b.y * rules.MAP_W + b.x])).toBe(true);
    }
  });
});
