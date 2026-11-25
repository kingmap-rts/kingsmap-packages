// KAN-30: a fort and the castle hold 1 to 3 archers; each added archer costs goods, shoots one more
// arrow a volley and strengthens the walls.
import { describe, expect, it } from 'vitest';
import { cleanIntent } from '@kingmap-rts/kingsmap-protocol';
import { createGame, rules, type Game } from '../src/index';
import type { Building, Unit } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { recomputeNetwork } from '../src/sim/systems/network';
import { terrainMap } from '../src/sim/state';

const { ARCHER_COST, ARCHER_HP, ARCHERS_MAX, ARROW_DMG } = rules;

/** open plain, castles of seats 0 (20,40) and 1 (90,40), seat 0's fort at (28,40); rich seat 0 */
function field(): { game: Game; hq: Building; fort: Building } {
  const game = createGame({
    seed: 11,
    headless: true,
    humans: { 0: 'me', 1: 'foe' },
  });
  const G = game.world;
  for (const b of G.buildings)
    if (b.type !== 'hq' || b.owner > 1) b.dead = true;
  for (const u of G.units) u.dead = true;
  for (const p of G.players) if (p.id > 1) p.alive = false;
  for (let k = 0; k < terrainMap.length; k++) terrainMap[k] = Terrain.Plain;
  const hq = G.players[0].hq;
  hq.x = 20;
  hq.y = 40;
  G.players[1].hq.x = 90;
  G.players[1].hq.y = 40;
  G.players[0].res = {
    wood: 1000,
    ore: 0,
    steel: 1000,
    food: 1000,
    crystal: 0,
  };
  const fort = addBuilding('depot', 0, 28, 40);
  recomputeNetwork();
  expect(game.apply(0, { t: 'spec', b: fort.id, s: 'fort' })).toBeNull();
  return { game, hq, fort };
}

const foe = (x: number, y: number, n = 1) => {
  const u = addUnit('inf', 1, x + 0.5, y + 0.5);
  u.n = n;
  u.hp = u.maxhp = u.mhp * n * 50; // they only stand and take arrows
  u.supplied = true;
  return u;
};

/** damage the foes take from the fort in `s` seconds (they stand still, nobody else shoots) */
function volleys(game: Game, us: Unit[], s: number) {
  const hp0 = us.map(u => u.hp);
  for (let i = 0; i < s * 10; i++) {
    for (const u of us) {
      u.path = null;
      u.tgt = 0;
      u.supplied = true;
    }
    game.step();
  }
  return us.map((u, i) => hp0[i] - u.hp);
}

describe('archers on forts and the castle (KAN-30)', () => {
  it('the castle starts with one archer, a fort gets one when it is made', () => {
    const { hq, fort } = field();
    expect(hq.arch).toBe(1);
    expect(fort.arch).toBe(1);
    expect(rules.archerCost(hq)).toEqual(ARCHER_COST.hq[0]);
    expect(rules.archerCost(fort)).toEqual(ARCHER_COST.fort[0]);
  });

  it('two more archers can be added, each for its price and with stronger walls; no fourth', () => {
    const { game, hq, fort } = field();
    const p = game.world.players[0];
    for (const [b, k] of [
      [fort, 'fort'],
      [hq, 'hq'],
    ] as const) {
      for (let lvl = 2; lvl <= ARCHERS_MAX; lvl++) {
        const wood = p.res.wood;
        const steel = p.res.steel;
        const maxhp = b.maxhp;
        expect(game.apply(0, { t: 'arm', b: b.id })).toBeNull();
        expect(b.arch).toBe(lvl);
        expect(wood - p.res.wood).toBe(ARCHER_COST[k][lvl - 2].wood);
        expect(steel - p.res.steel).toBe(ARCHER_COST[k][lvl - 2].steel);
        expect(b.maxhp - maxhp).toBe(ARCHER_HP[k]);
      }
      expect(rules.archerCost(b)).toBeNull();
      expect(game.apply(0, { t: 'arm', b: b.id })).toEqual({
        key: 'error.notAllowed',
      });
      expect(b.arch).toBe(3);
    }
  });

  it('refused for a plain post, a foreign building, a cut-off fort and without the goods', () => {
    const { game, fort } = field();
    const G = game.world;
    const p = G.players[0];
    const post = addBuilding('depot', 0, 20, 48);
    recomputeNetwork();
    expect(game.apply(0, { t: 'arm', b: post.id })?.key).toBe(
      'error.notAllowed',
    );
    expect(game.apply(0, { t: 'arm', b: G.players[1].hq.id })?.key).toBe(
      'error.notAllowed',
    );
    p.res.wood = 0;
    expect(game.apply(0, { t: 'arm', b: fort.id })?.key).toBe(
      'error.noResources',
    );
    p.res.wood = 1000;
    fort.linked = false;
    expect(game.apply(0, { t: 'arm', b: fort.id })?.key).toBe('error.postCut');
    expect(fort.arch).toBe(1);
  });

  it('each archer shoots once a volley: three foes in reach take an arrow each', () => {
    const { game, fort } = field();
    const us = [foe(30, 41), foe(31, 39), foe(26, 42)];
    const one = volleys(game, us, 4);
    // one archer: only the nearest foe is hit
    expect(one.filter(d => d > 0)).toHaveLength(1);
    game.apply(0, { t: 'arm', b: fort.id });
    game.apply(0, { t: 'arm', b: fort.id });
    const three = volleys(game, us, 4);
    expect(three.every(d => d > 0)).toBe(true);
    // a volley a second, an arrow per archer
    const total = three.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(3 * 3 * ARROW_DMG.fort);
    expect(total).toBeLessThanOrEqual(3 * 5 * ARROW_DMG.fort);
  });

  it('a lone foe takes every arrow: three archers deal three times the damage', () => {
    const { game, fort } = field();
    const u = foe(30, 40, 5);
    const [one] = volleys(game, [u], 5);
    game.apply(0, { t: 'arm', b: fort.id });
    game.apply(0, { t: 'arm', b: fort.id });
    const [three] = volleys(game, [u], 5);
    // (a window may catch one volley more or less, and a resting squad heals a little)
    expect(three / one).toBeGreaterThan(2.4);
    expect(three / one).toBeLessThan(3.6);
  });

  it('the castle shoots with its archers too', () => {
    const { game, hq } = field();
    const u = foe(22, 41);
    const [one] = volleys(game, [u], 3);
    game.apply(0, { t: 'arm', b: hq.id });
    const [two] = volleys(game, [u], 3);
    expect(one).toBeGreaterThan(0);
    expect(two / one).toBeGreaterThan(1.6);
    expect(two / one).toBeLessThan(2.4);
  });

  it('the protocol passes a clean arm intent and rejects a broken one', () => {
    expect(cleanIntent({ t: 'arm', b: 7, x: 1 })).toEqual({ t: 'arm', b: 7 });
    expect(cleanIntent({ t: 'arm' })).toBeNull();
    expect(cleanIntent({ t: 'arm', b: 'x' })).toBeNull();
  });

  it('bots add archers to their forts and castles', () => {
    const game = createGame({ seed: 1001, headless: true, humans: {} });
    for (let i = 0; i < 9000; i++) game.step();
    const armed = game.world.buildings.filter(
      b => !b.dead && (b.arch || 0) > 1,
    );
    expect(armed.length).toBeGreaterThan(0);
  });
});
