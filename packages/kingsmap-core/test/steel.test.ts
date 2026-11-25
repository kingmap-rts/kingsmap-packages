// KAN-48: the castle makes no steel by itself but holds one forge of its own (it smelts ore as fast
// as a forge post); a realm starts with 25 steel; a man-at-arms costs 12. The militia stays the land
// path's own unit, opened by its `levies` node.
import { describe, expect, it } from 'vitest';
import { createGame, rules, type Game } from '../src/index';
import { Terrain } from '../src/sim/config/map';
import { terrainMap } from '../src/sim/state';
import { FORGE_RATE, HQ_FORGE } from '../src/sim/config/economy';

const { UNITS, PATHS, PERKS } = rules;

/** open plain, only seat 0's castle */
function field(): Game {
  const game = createGame({ seed: 11, headless: true, humans: { 0: 'me' } });
  const G = game.world;
  for (const b of G.buildings)
    if (b.type !== 'hq' || b.owner > 0) b.dead = true;
  for (const u of G.units) u.dead = true;
  for (const p of G.players) if (p.id > 0) p.alive = false;
  for (let k = 0; k < terrainMap.length; k++) terrainMap[k] = Terrain.Plain;
  const p = G.players[0];
  p.res = { wood: 1000, ore: 0, steel: 1000, food: 1000, crystal: 200 };
  p.pop = 100;
  return game;
}

describe('steel: from ore, the castle a forge of its own (KAN-48)', () => {
  it('a realm starts with 25 steel; a man-at-arms is dear: 12 steel', () => {
    const game = createGame({ seed: 3, headless: true, humans: { 0: 'me' } });
    for (const p of game.world.players) expect(p.res.steel).toBe(25);
    expect(UNITS.inf).toMatchObject({ steel: 12, wood: 9, food: 4 });
  });

  it('the castle makes no steel from nothing and smelts ore like one forge', () => {
    expect(HQ_FORGE).toBe(FORGE_RATE);
    expect(FORGE_RATE).toBe(1.2);
    const game = field();
    const p = game.world.players[0];
    p.res.steel = 0;
    for (let i = 0; i < 100; i++) {
      p.res.ore = 0; // no ore at hand: nothing to smelt
      game.step();
    }
    expect(p.res.steel).toBe(0);
    for (let i = 0; i < 100; i++) {
      p.res.ore = 100;
      game.step();
    }
    expect(p.res.steel).toBeCloseTo(HQ_FORGE * 10, 1);
  });
});

describe('militia: the land path own unit', () => {
  it('needs no steel and is opened by levies', () => {
    expect(UNITS.militia).toMatchObject({
      hp: 70,
      dmg: 6,
      steel: 0,
      wood: 5,
      food: 3,
      doc: 'land',
    });
    expect(PATHS.land.unit).toBe('militia');
    expect(PERKS.levies.unit).toBe('militia');
    const game = field();
    expect(game.apply(0, { t: 'train', type: 'militia' })?.key).toBe(
      'error.otherPath',
    );
    for (const id of ['claim', 'bread', 'levies'] as const)
      expect(game.apply(0, { t: 'perk', id })).toBeNull();
    const before = new Set(game.world.units.map(u => u.id));
    expect(game.apply(0, { t: 'train', type: 'militia' })).toBeNull();
    const m = game.world.units.find(u => !before.has(u.id))!;
    expect(m.type).toBe('militia');
    expect(m.maxhp).toBe(70);
  });
});
