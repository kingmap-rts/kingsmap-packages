// KAN-37: troops walk faster on roads, and take a road when it goes their way.
import { describe, expect, it } from 'vitest';
import { createGame, rules, type Game } from '../src/index';
import type { Building, Unit } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { recomputeNetwork } from '../src/sim/systems/network';
import { bridgeTiles, roadTiles } from '../src/sim/systems/roads';
import { roadMap, terrainMap } from '../src/sim/state';

const { MAP_W, ROAD_PACE } = rules;

/**
 * Open plain; castles of seats 0 (10,20) and 1 (100,70), nothing else. Seat 0's posts along y = 40
 * from x = 20 to x = 60, 8 tiles apart: one straight road. `water` puts a river 3 tiles wide across
 * it at x = 40..42 (the road bridges it), `mountain` a ridge on it at x = 31..33, y = 37..43 (the
 * road bends round it).
 */
function field(
  o: { water?: boolean; mountain?: boolean; owner?: number } = {},
) {
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
  if (o.water)
    for (let y = 10; y < 70; y++)
      for (let x = 40; x <= 42; x++) terrainMap[y * MAP_W + x] = Terrain.Water;
  if (o.mountain)
    for (let y = 37; y <= 43; y++)
      for (let x = 31; x <= 33; x++)
        terrainMap[y * MAP_W + x] = Terrain.Mountain;
  const own = o.owner ?? 0;
  G.players[0].hq.x = 10;
  G.players[0].hq.y = 20;
  G.players[1].hq.x = 100;
  G.players[1].hq.y = 70;
  const hq = G.players[own].hq;
  hq.x = 20;
  hq.y = 40;
  const posts: Building[] = [hq];
  for (let x = 28; x <= 60; x += 8)
    posts.push(addBuilding('depot', own, x, 40));
  recomputeNetwork();
  return { game, posts };
}

const soldier = (owner: number, x: number, y: number, n = 1) => {
  const u = addUnit('inf', owner, x + 0.5, y + 0.5);
  u.supplied = true;
  if (n > 1) {
    u.n = n;
    u.hp = u.maxhp = u.maxhp * n;
  }
  return u;
};

/** steps until every unit stops walking (or `max` seconds pass): the time each one took */
function walk(game: Game, us: Unit[], max = 120) {
  const done = new Map<Unit, number>();
  for (let i = 1; i <= max * 10; i++) {
    for (const u of us) {
      u.hp = u.maxhp;
      u.supplied = true;
    }
    game.step();
    for (const u of us)
      if (!done.has(u) && (!u.path || !u.path.length)) done.set(u, i / 10);
    if (done.size === us.length) break;
  }
  return us.map(u => done.get(u) ?? max);
}

const onRoad = (x: number, y: number) => roadMap[y * MAP_W + x] === 1;

const linkOf = (game: Game, a: Building, b: Building) =>
  game.world.links.find(
    l => (l.a === a && l.b === b) || (l.a === b && l.b === a),
  )!;

describe('roads speed troops up (KAN-37)', () => {
  it('the tiles under a standing road are road tiles, and only they', () => {
    const { game } = field();
    let n = 0;
    for (const l of game.world.links)
      for (const k of roadTiles(terrainMap, l.a.x, l.a.y, l.b.x, l.b.y)) {
        expect(roadMap[k]).toBe(1);
        n++;
      }
    expect(n).toBeGreaterThan(30);
    for (let x = 20; x <= 60; x++) expect(onRoad(x, 40)).toBe(true);
    for (let x = 20; x <= 60; x++) expect(onRoad(x, 42)).toBe(false);
  });

  it('a squad on the road arrives sooner than its neighbour on the grass', () => {
    const { game } = field();
    const road = soldier(0, 22, 40, 5);
    const grass = soldier(0, 22, 46, 5);
    game.apply(0, { t: 'move', ids: [road.id], x: 58, y: 40, mode: 'move' });
    game.apply(0, { t: 'move', ids: [grass.id], x: 58, y: 46, mode: 'move' });
    const [tr, tg] = walk(game, [road, grass]);
    expect(Math.hypot(road.x - 58.5, road.y - 40.5)).toBeLessThan(0.7);
    expect(Math.hypot(grass.x - 58.5, grass.y - 46.5)).toBeLessThan(0.7);
    // 36 tiles: the road's pace, give or take the first and last steps
    expect(tg / tr).toBeGreaterThan(ROAD_PACE * 0.93);
    expect(tg / tr).toBeLessThan(ROAD_PACE * 1.02);
  });

  it('a unit takes a road a few tiles off its straight way when it is quicker', () => {
    const { game } = field();
    const u = soldier(0, 22, 43);
    const v = soldier(0, 22, 50);
    game.apply(0, { t: 'move', ids: [u.id], x: 58, y: 43, mode: 'move' });
    game.apply(0, { t: 'move', ids: [v.id], x: 58, y: 50, mode: 'move' });
    const via = u.path!.filter(([x, y]) => onRoad(x, y)).length;
    expect(via).toBeGreaterThan(20);
    // far from the road the way stays straight
    expect(v.path!.some(([x, y]) => onRoad(x, y))).toBe(false);
    const [tu, tv] = walk(game, [u, v]);
    expect(tu).toBeLessThan(tv * 0.9);
  });

  it('a road bent round a mountain speeds along the bend, the way the map draws it', () => {
    const { game, posts } = field({ mountain: true });
    const l = linkOf(game, posts[1], posts[2]);
    const tiles = roadTiles(terrainMap, l.a.x, l.a.y, l.b.x, l.b.y);
    // it does not run straight through the ridge
    for (const k of tiles) expect(terrainMap[k]).not.toBe(Terrain.Mountain);
    expect([...tiles].some(k => ((k / MAP_W) | 0) !== 40)).toBe(true);
    for (const k of tiles) expect(roadMap[k]).toBe(1);
    const u = soldier(0, 22, 40);
    game.apply(0, { t: 'move', ids: [u.id], x: 44, y: 40, mode: 'move' });
    const off = u.path!.filter(([x, y]) => !onRoad(x, y)).length;
    expect(off).toBeLessThan(3);
    walk(game, [u]);
    expect(Math.hypot(u.x - 44.5, u.y - 40.5)).toBeLessThan(0.7);
  });

  it('a bridge is road too; a burnt road speeds no one', () => {
    const { game, posts } = field({ water: true });
    const l = linkOf(game, posts[2], posts[3]);
    const br = bridgeTiles(terrainMap, l.a.x, l.a.y, l.b.x, l.b.y);
    expect(br.length).toBeGreaterThan(2);
    for (const k of br) expect(roadMap[k]).toBe(1);
    const G = game.world;
    G.sab.set(l.key, G.t + 1000);
    recomputeNetwork();
    // (the posts at its ends stand on their other roads too)
    for (const k of roadTiles(terrainMap, l.a.x, l.a.y, l.b.x, l.b.y))
      if (k % MAP_W > l.a.x + 1 && k % MAP_W < l.b.x - 1)
        expect(roadMap[k]).toBe(0);
    for (const k of br) expect(roadMap[k]).toBe(0);
    // the other roads still stand
    expect(onRoad(22, 40)).toBe(true);
  });

  it("anyone's road: a foe marches faster on mine, and a road it blocks still speeds it", () => {
    const { game, posts } = field();
    const foe = soldier(1, 58, 40, 5);
    const grass = soldier(1, 58, 46, 5);
    game.apply(1, { t: 'move', ids: [foe.id], x: 22, y: 40, mode: 'move' });
    game.apply(1, { t: 'move', ids: [grass.id], x: 22, y: 46, mode: 'move' });
    let cut = false;
    const each = () => {
      for (let i = 1; i < posts.length; i++)
        cut ||= linkOf(game, posts[i - 1], posts[i]).blocked;
    };
    const t = { foe: 0, grass: 0 };
    for (let i = 1; i <= 1200 && !(t.foe && t.grass); i++) {
      for (const u of [foe, grass]) u.hp = u.maxhp;
      game.step();
      each();
      if (!t.foe && !foe.path?.length) t.foe = i / 10;
      if (!t.grass && !grass.path?.length) t.grass = i / 10;
    }
    expect(cut).toBe(true);
    expect(t.grass / t.foe).toBeGreaterThan(ROAD_PACE * 0.9);
  });

  it('a group march takes the road as a column and keeps together', () => {
    const { game } = field();
    const us = [
      soldier(0, 22, 40, 5),
      soldier(0, 22, 42, 5),
      soldier(0, 22, 44, 5),
    ];
    game.apply(0, {
      t: 'move',
      ids: us.map(u => u.id),
      x: 56,
      y: 42,
      mode: 'move',
    });
    // all three file onto the road (it is quicker even for the one 4 tiles off)
    for (const u of us)
      expect(u.path!.filter(([x, y]) => onRoad(x, y)).length).toBeGreaterThan(
        25,
      );
    let spread = 0;
    const times = new Map<Unit, number>();
    for (let i = 1; i <= 1200 && times.size < us.length; i++) {
      game.step();
      const xs = us.map(u => u.x);
      if (i > 20) spread = Math.max(spread, Math.max(...xs) - Math.min(...xs));
      for (const u of us)
        if (!times.has(u) && !u.path?.length) times.set(u, i / 10);
    }
    const ts = [...times.values()];
    expect(ts.length).toBe(3);
    // the column's head and tail come in a column's length apart, a few seconds at most
    expect(Math.max(...ts) - Math.min(...ts)).toBeLessThan(3);
    // and nobody runs off ahead on the way: the column stays a squad's length per squad
    expect(spread).toBeLessThan(3.5);
    // quicker than over the grass: 34 tiles at the squad's pace would take 34 / speed
    expect(Math.max(...ts)).toBeLessThan(34 / rules.UNITS.inf.speed);
  });

  it('a road built beside a march puts the marchers on it', () => {
    const { game } = field();
    const u = soldier(0, 22, 63);
    game.apply(0, { t: 'move', ids: [u.id], x: 60, y: 63, mode: 'move' });
    expect(u.path!.some(([x, y]) => onRoad(x, y))).toBe(false);
    game.step();
    const hq = game.world.players[0].hq;
    hq.y = 62;
    hq.x = 20;
    for (let x = 28; x <= 60; x += 8) addBuilding('depot', 0, x, 62);
    recomputeNetwork();
    expect(onRoad(40, 62)).toBe(true);
    expect(u.path!.filter(([x, y]) => onRoad(x, y)).length).toBeGreaterThan(20);
  });

  it('in bot matches troops walk the roads', () => {
    const game = createGame({ seed: 1001, headless: true, humans: {} });
    let on = 0;
    let all = 0;
    const was = new Map<number, number>();
    for (let i = 0; i < 6000; i++) {
      game.step();
      if (i % 10) continue;
      for (const u of game.world.units) {
        const k = (u.y | 0) * MAP_W + (u.x | 0);
        // a unit on the move (in another tile than a second ago)
        if (
          !u.dead &&
          u.type !== 'wagon' &&
          was.has(u.id) &&
          was.get(u.id) !== k
        ) {
          all++;
          if (roadMap[k]) on++;
        }
        was.set(u.id, k);
      }
    }
    expect(all).toBeGreaterThan(1000);
    expect(on / all).toBeGreaterThan(0.1);
  });
});
