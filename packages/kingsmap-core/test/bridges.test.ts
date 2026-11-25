// KAN-36: a road across water is a bridge, and troops walk it.
import { describe, expect, it } from 'vitest';
import { createGame, rules, type Game } from '../src/index';
import type { Building, Unit } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { recomputeNetwork } from '../src/sim/systems/network';
import { findPath } from '../src/sim/systems/pathfinding';
import { bridgeTiles, roadTiles } from '../src/sim/systems/roads';
import { bridgeMap, terrainMap } from '../src/sim/state';
import { dry, walkable } from '../src/sim/world/terrain';

const { MAP_W, MAP_H } = rules;

/**
 * Open plain with a river 3 tiles wide down x = 30..32 from y = 10 to y = 69 (it can be walked
 * round at either end); castles of seats 0 (20,40) and 1 (70,40), nothing else. Optionally seat 0's
 * posts on both banks, (26,40) and (35,40): their road crosses the river on a bridge.
 */
function river(withRoad: boolean) {
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
  for (let y = 10; y < 70; y++)
    for (let x = 30; x <= 32; x++) terrainMap[y * MAP_W + x] = Terrain.Water;
  const h0 = G.players[0].hq;
  const h1 = G.players[1].hq;
  h0.x = 20;
  h0.y = 40;
  h1.x = 70;
  h1.y = 40;
  const a = withRoad ? addBuilding('depot', 0, 26, 40) : null;
  const b = withRoad ? addBuilding('depot', 0, 35, 40) : null;
  recomputeNetwork();
  return { game, a, b };
}

const linkOf = (game: Game, a: Building, b: Building) =>
  game.world.links.find(
    l => (l.a === a && l.b === b) || (l.a === b && l.b === a),
  )!;

const soldier = (owner: number, x: number, y: number) => {
  const u = addUnit('inf', owner, x + 0.5, y + 0.5);
  u.supplied = true;
  return u;
};

/** steps until every unit stops walking (or `max` seconds pass); keeps them fed and whole */
function walk(game: Game, us: Unit[], max = 60, each?: () => void) {
  for (let i = 0; i < max * 10; i++) {
    for (const u of us) {
      u.hp = u.maxhp;
      u.supplied = true;
    }
    game.step();
    each?.();
    if (us.every(u => !u.path || !u.path.length)) return i / 10;
  }
  return max;
}

const pathLen = (p: [number, number][] | null) => (p ? p.length : 1e9);

describe('bridges (KAN-36)', () => {
  it('the water under a road becomes a bridge troops can stand on', () => {
    const { game, a, b } = river(true);
    const l = linkOf(game, a!, b!);
    expect(l.blocked).toBe(false);
    const ts = bridgeTiles(terrainMap, l.a.x, l.a.y, l.b.x, l.b.y);
    expect([...ts].sort((p, q) => p - q)).toEqual([
      40 * MAP_W + 30,
      40 * MAP_W + 31,
      40 * MAP_W + 32,
    ]);
    for (let x = 30; x <= 32; x++) {
      expect(walkable(x, 40)).toBe(true);
      // still water: nothing is built on a bridge
      expect(dry(x, 40)).toBe(false);
      expect(walkable(x, 41)).toBe(false);
    }
  });

  it('a squad crosses the river on the bridge; without the road it walks round', () => {
    const go = (withRoad: boolean) => {
      const { game } = river(withRoad);
      const u = soldier(0, 25, 44);
      game.apply(0, { t: 'move', ids: [u.id], x: 38, y: 44, mode: 'move' });
      const crossed = u.path!.some(([x, y]) => x === 31 && y === 40);
      const len = u.path!.length;
      const time = walk(game, [u], 120);
      expect(Math.hypot(u.x - 38.5, u.y - 44.5)).toBeLessThan(0.7);
      return { crossed, len, time };
    };
    const over = go(true);
    const round = go(false);
    expect(over.crossed).toBe(true);
    expect(round.crossed).toBe(false);
    expect(over.len).toBeLessThan(20);
    expect(round.len).toBeGreaterThan(50);
    expect(over.time * 3).toBeLessThan(round.time);
  });

  it('a whole squad (one unit of 5) crosses as a column and arrives', () => {
    const { game } = river(true);
    const u = soldier(0, 24, 40);
    u.n = 5;
    u.hp = u.maxhp = u.maxhp * 5;
    game.apply(0, { t: 'move', ids: [u.id], x: 40, y: 41, mode: 'move' });
    walk(game, [u], 60);
    expect(u.x).toBeGreaterThan(38);
  });

  it('a burnt road takes its bridge: the way is closed and walkers go round', () => {
    const { game, a, b } = river(true);
    const G = game.world;
    const u = soldier(0, 25, 44);
    game.apply(0, { t: 'move', ids: [u.id], x: 38, y: 44, mode: 'move' });
    expect(u.path!.some(([x, y]) => x === 31 && y === 40)).toBe(true);
    G.sab.set(linkOf(game, a!, b!).key, G.t + 1000);
    recomputeNetwork();
    for (let x = 30; x <= 32; x++) expect(walkable(x, 40)).toBe(false);
    // it already looks for another way, round the river
    expect(u.path!.some(([x, y]) => x === 31 && y === 40)).toBe(false);
    expect(pathLen(u.path)).toBeGreaterThan(50);
    walk(game, [u], 120);
    expect(Math.hypot(u.x - 38.5, u.y - 44.5)).toBeLessThan(0.7);
  });

  it('troops on a bridge that burns wade to the nearest shore and walk on', () => {
    const { game, a, b } = river(true);
    const G = game.world;
    const u = soldier(0, 26, 40);
    const idle = soldier(0, 32, 40);
    game.apply(0, { t: 'move', ids: [u.id], x: 38, y: 40, mode: 'move' });
    // walk onto the bridge
    for (let i = 0; i < 60 && (u.x | 0) !== 30; i++) game.step();
    expect(u.x | 0).toBe(30);
    G.sab.set(linkOf(game, a!, b!).key, G.t + 1000);
    recomputeNetwork();
    let wet = 0;
    walk(game, [u, idle], 120, () => {
      if (!walkable(u.x | 0, u.y | 0)) wet += 0.1;
    });
    expect(wet).toBeLessThan(3);
    // the one on the far end stepped onto the far bank, the one going on went round
    expect(dry(idle.x | 0, idle.y | 0)).toBe(true);
    expect(idle.x).toBeGreaterThan(32.9);
    expect(Math.hypot(u.x - 38.5, u.y - 40.5)).toBeLessThan(0.7);
  });

  it('a road blocked by troops keeps its bridge, and a foe can cross mine', () => {
    const { game, a, b } = river(true);
    const foe = soldier(1, 37, 40);
    game.apply(1, { t: 'move', ids: [foe.id], x: 24, y: 40, mode: 'move' });
    expect(foe.path!.some(([x, y]) => x === 31 && y === 40)).toBe(true);
    let cut = false;
    walk(game, [foe], 30, () => {
      cut ||= linkOf(game, a!, b!).blocked;
      expect(walkable(31, 40)).toBe(true);
    });
    // standing on my road it cut it, yet walked the bridge to the other bank
    expect(cut).toBe(true);
    expect(foe.x).toBeLessThan(25.5);
  });

  it('a bridge built while troops walk round puts them on it', () => {
    const { game } = river(false);
    const u = soldier(0, 25, 44);
    game.apply(0, { t: 'move', ids: [u.id], x: 38, y: 44, mode: 'move' });
    expect(pathLen(u.path)).toBeGreaterThan(50);
    game.step();
    addBuilding('depot', 0, 26, 40);
    addBuilding('depot', 0, 35, 40);
    recomputeNetwork();
    expect(u.path!.some(([x, y]) => x === 31 && y === 40)).toBe(true);
  });

  it('on real maps a bridge covers every water tile of its road and can be walked end to end', () => {
    let checked = 0;
    for (const seed of [1001, 1002, 1003, 42, 7]) {
      const game = createGame({ seed, headless: true, humans: {} });
      const terrain = game.map.terrain;
      const ok = (k: number) => dry(k % MAP_W, (k / MAP_W) | 0);
      // every pair of dry tiles up to a road's length apart, a few hundred of them, seeded
      let s = seed;
      const r = (n: number) => (s = (s * 1103515245 + 12345) & 0x7fffffff) % n;
      for (let i = 0; i < 4000 && checked < 60 * (seed === 7 ? 5 : 1); i++) {
        const ax = r(MAP_W);
        const ay = r(MAP_H);
        const bx = ax + r(19) - 9;
        const by = ay + r(19) - 9;
        if (bx < 0 || by < 0 || bx >= MAP_W || by >= MAP_H) continue;
        if (!ok(ay * MAP_W + ax) || !ok(by * MAP_W + bx)) continue;
        const road = roadTiles(terrain, ax, ay, bx, by);
        if (![...road].some(k => terrain[k] === Terrain.Water)) continue;
        const br = new Set(bridgeTiles(terrain, ax, ay, bx, by));
        // the road never runs over water off its bridge
        for (const k of road)
          if (terrain[k] === Terrain.Water) expect(br.has(k)).toBe(true);
        for (const k of br) expect(terrain[k]).toBe(Terrain.Water);
        // A* (its rules: no corner cutting) along the road and its bridge gets from a to b
        const on = (x: number, y: number) =>
          x >= 0 &&
          y >= 0 &&
          x < MAP_W &&
          y < MAP_H &&
          (ok(y * MAP_W + x) || br.has(y * MAP_W + x));
        // the road's tiles, its bridge and the dry land right beside the road
        const inRoad = new Set<number>([...road, ...br]);
        for (const k of road)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (on((k % MAP_W) + dx, ((k / MAP_W) | 0) + dy))
                inRoad.add(k + dy * MAP_W + dx);
        const seen = new Set([ay * MAP_W + ax]);
        const q = [ay * MAP_W + ax];
        while (q.length) {
          const k = q.shift()!;
          const x = k % MAP_W;
          const y = (k / MAP_W) | 0;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]) {
            const n = (y + dy) * MAP_W + x + dx;
            if (seen.has(n) || !inRoad.has(n) || !on(x + dx, y + dy)) continue;
            if (dx && dy && (!on(x + dx, y) || !on(x, y + dy))) continue;
            seen.add(n);
            q.push(n);
          }
        }
        expect(seen.has(by * MAP_W + bx)).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('bot matches lay bridges and send troops over them', () => {
    const game = createGame({ seed: 1001, headless: true, humans: {} });
    let crossings = 0;
    let most = 0;
    for (let i = 0; i < 6000; i++) {
      game.step();
      if (i % 10) continue;
      let n = 0;
      for (let k = 0; k < bridgeMap.length; k++) n += bridgeMap[k];
      most = Math.max(most, n);
      for (const u of game.world.units)
        if (bridgeMap[(u.y | 0) * MAP_W + (u.x | 0)]) crossings++;
    }
    expect(most).toBeGreaterThan(0);
    expect(crossings).toBeGreaterThan(0);
    // findPath is the bots' pathfinder too: nothing else to check here
    expect(findPath(0, 0, 1, 1)).not.toBeUndefined();
  });
});
