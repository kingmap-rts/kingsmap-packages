// KAN-48: the militia (a peasant with an axe) is every realm's cheap starting unit; steel comes
// mostly from forges; the land's `levies` node strengthens the militia and hires them at any post.
import { describe, expect, it } from 'vitest';
import { createGame, rules, type Game } from '../src/index';
import type { Building } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { recomputeNetwork } from '../src/sim/systems/network';
import { terrainMap } from '../src/sim/state';
import { fire } from '../src/sim/systems/combat';
import {
  FORGE_RATE,
  HQ_FORGE,
  MILITIA_STEEL_MARGIN,
} from '../src/sim/config/economy';

const { UNITS, PATHS, PERKS } = rules;

/** open plain, seat 0's castle at (20,40) and its post at (28,40) */
function field(): { game: Game; hq: Building; post: Building } {
  const game = createGame({ seed: 11, headless: true, humans: { 0: 'me' } });
  const G = game.world;
  for (const b of G.buildings)
    if (b.type !== 'hq' || b.owner > 0) b.dead = true;
  for (const u of G.units) u.dead = true;
  for (const p of G.players) if (p.id > 0) p.alive = false;
  for (let k = 0; k < terrainMap.length; k++) terrainMap[k] = Terrain.Plain;
  const p = G.players[0];
  p.hq.x = 20;
  p.hq.y = 40;
  p.res = { wood: 1000, ore: 0, steel: 1000, food: 1000, crystal: 200 };
  p.pop = 100;
  const post = addBuilding('depot', 0, 28, 40);
  recomputeNetwork();
  return { game, hq: p.hq, post };
}

const hireOne = (game: Game, type: 'militia' | 'inf') => {
  const before = new Set(game.world.units.map(u => u.id));
  expect(game.apply(0, { t: 'train', type })).toBeNull();
  return game.world.units.find(u => !before.has(u.id))!;
};

describe('militia: the starting unit (KAN-48)', () => {
  it('needs no steel and no path; the man-at-arms costs 10 steel', () => {
    expect(UNITS.militia).toMatchObject({
      hp: 80,
      dmg: 7,
      steel: 0,
      wood: 7,
      food: 3,
    });
    expect(UNITS.militia.doc).toBeUndefined();
    expect(UNITS.inf.steel).toBe(10);
    const { game } = field();
    const p = game.world.players[0];
    expect(p.perks).toEqual([]);
    p.res.steel = 0;
    const u = hireOne(game, 'militia');
    expect(u.type).toBe('militia');
    expect(u.maxhp).toBe(80);
    expect(game.apply(0, { t: 'train', type: 'inf' })?.key).toBe(
      'error.noResources',
    );
  });

  it('a realm starts with 25 steel', () => {
    const game = createGame({ seed: 3, headless: true, humans: { 0: 'me' } });
    for (const p of game.world.players) expect(p.res.steel).toBe(25);
  });
});

describe('steel: mostly from forges (KAN-48)', () => {
  it('the castle makes no steel from nothing and smelts ore slower than a forge', () => {
    expect(HQ_FORGE).toBe(0.5);
    expect(FORGE_RATE).toBe(1.2);
    const { game } = field();
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

describe('levies: the land strengthens its militia (KAN-48)', () => {
  it('is a boon node with no unit of its own', () => {
    expect(PATHS.land.unit).toBeUndefined();
    expect(PERKS.levies).toMatchObject({ branch: 'land', tier: 3 });
    expect(PERKS.levies.unit).toBeUndefined();
  });

  it('gives militia +25% hp and +1 damage', () => {
    const { game } = field();
    const p = game.world.players[0];
    for (const id of ['claim', 'bread', 'levies'] as const)
      expect(game.apply(0, { t: 'perk', id })).toBeNull();
    const m = hireOne(game, 'militia');
    expect(m.maxhp).toBeCloseTo(100);
    const i = hireOne(game, 'inf');
    expect(i.maxhp).toBe(100);
    // one blow on a dummy: 8 instead of 7 (before the melee pace and flank multipliers)
    const dummy = addUnit('wagon', 1, m.x + 1, m.y);
    const plain = addUnit('militia', 1, m.x - 1, m.y);
    expect(p.perks).toContain('levies');
    const hit = (who: typeof m) => {
      dummy.hp = dummy.maxhp = 1e6;
      fire(who, dummy);
      return 1e6 - dummy.hp;
    };
    expect(hit(m) / hit(plain)).toBeCloseTo(8 / 7, 5);
  });

  it('hires militia at any post of its own; others still come from the castle', () => {
    const { game, hq, post } = field();
    expect(rules.canHireHere(post, 'militia')).toBe(false);
    for (const id of ['claim', 'bread', 'levies'] as const)
      expect(game.apply(0, { t: 'perk', id })).toBeNull();
    expect(rules.canHireHere(post, 'militia')).toBe(true);
    expect(rules.canHireHere(post, 'inf')).toBe(false);
    expect(game.apply(0, { t: 'spawn', b: post.id })).toBeNull();
    expect(game.world.players[0].spawn).toBe(post.id);
    const m = hireOne(game, 'militia');
    expect(Math.abs(m.x - post.x)).toBeLessThan(3);
    const i = hireOne(game, 'inf');
    expect(Math.abs(i.x - hq.x)).toBeLessThan(3);
  });

  it('without levies a plain post cannot be the rally point', () => {
    const { game, post } = field();
    expect(game.apply(0, { t: 'spawn', b: post.id })).toBeNull();
    expect(game.world.players[0].spawn).toBeFalsy();
  });
});

describe('auto-hire and bots pick militia when steel is short (KAN-48)', () => {
  it('auto-hire hires militia below the man-at-arms price plus the margin', () => {
    const { game } = field();
    const p = game.world.players[0];
    p.auto = true;
    p.labor = 0;
    p.res.steel = UNITS.inf.steel + MILITIA_STEEL_MARGIN - 1;
    p.res.ore = 0;
    for (let i = 0; i < 25; i++) game.step();
    const mine = game.world.units.filter(u => !u.dead && u.owner === 0);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every(u => u.type === 'militia')).toBe(true);
  });

  it('bots hire militia early in a match', () => {
    const game = createGame({ seed: 5, headless: true, humans: {} });
    for (let i = 0; i < 1200; i++) game.step();
    const militia = game.world.units.filter(
      u => !u.dead && u.type === 'militia' && !u.expire,
    );
    expect(militia.length).toBeGreaterThan(0);
  });
});
