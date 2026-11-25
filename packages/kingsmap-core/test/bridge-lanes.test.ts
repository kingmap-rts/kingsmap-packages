// KAN-53: a bridge is narrower than a squad, so troops on it walk its middle line in single file and
// nobody ends up over the water beside the planks: squads of every size, mates passing each other,
// and a fight in the middle of a bridge.
import { describe, expect, it } from 'vitest';
import { createGame, rules, type Game } from '../src/index';
import type { Unit, UnitType } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { recomputeNetwork } from '../src/sim/systems/network';
import { bridgeLanes } from '../src/sim/systems/roads';
import { bridgeMap, terrainMap } from '../src/sim/state';

const { MAP_W } = rules;

/** the half width of the planks the map draws, tiles (12 px of a 20 px tile) */
const PLANKS = 0.3;

/**
 * Open plain with a river 3 tiles wide down x = 30..32 (y = 10..69); castles of seats 0 (20,40)
 * and 1 (70,40); seat 0's posts at `a` and `b` on both banks, so their road crosses on a bridge.
 */
function river(a: [number, number], b: [number, number]) {
  const game = createGame({
    seed: 11,
    headless: true,
    humans: { 0: 'me', 1: 'foe' },
  });
  const G = game.world;
  for (const bd of G.buildings)
    if (bd.type !== 'hq' || bd.owner > 1) bd.dead = true;
  for (const u of G.units) u.dead = true;
  for (const p of G.players) if (p.id > 1) p.alive = false;
  for (let k = 0; k < terrainMap.length; k++) terrainMap[k] = Terrain.Plain;
  for (let y = 10; y < 70; y++)
    for (let x = 30; x <= 32; x++) terrainMap[y * MAP_W + x] = Terrain.Water;
  G.players[0].hq.x = 20;
  G.players[0].hq.y = 40;
  G.players[1].hq.x = 70;
  G.players[1].hq.y = 40;
  addBuilding('depot', 0, a[0], a[1]);
  addBuilding('depot', 0, b[0], b[1]);
  recomputeNetwork();
  const lanes = bridgeLanes(terrainMap, a[0], a[1], b[0], b[1]);
  expect(lanes.length).toBe(4);
  return { game, lane: [...lanes] as [number, number, number, number] };
}

const squad = (
  owner: number,
  x: number,
  y: number,
  n: number,
  type: UnitType = 'inf',
) => {
  const u = addUnit(type, owner, x + 0.5, y + 0.5);
  u.n = n;
  u.hp = u.maxhp = u.mhp * n;
  u.supplied = true;
  return u;
};

/** distance from (x, y) to the segment of the lane, tiles */
function offLane([x0, y0, x1, y1]: number[], x: number, y: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = Math.max(
    0,
    Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(x - x0 - dx * t, y - y0 - dy * t);
}

const overWater = (u: Unit) =>
  terrainMap[(u.y | 0) * MAP_W + (u.x | 0)] === Terrain.Water;

/**
 * Steps the match `secs` seconds; every tick, every live unit over the water must stand on a bridge
 * within `room` of its middle line. Returns the farthest any unit over the water got from it.
 */
function watch(
  game: Game,
  lane: number[],
  secs: number,
  room: number,
  keep?: Unit[],
) {
  let worst = 0;
  for (let i = 0; i < secs * 10; i++) {
    for (const u of keep || []) u.supplied = true;
    game.step();
    for (const u of game.world.units) {
      if (u.dead || !overWater(u)) continue;
      const k = (u.y | 0) * MAP_W + (u.x | 0);
      if (bridgeMap[k] !== 1) expect.fail(`unit ${u.id} in the water`);
      const d = offLane(lane, u.x, u.y);
      worst = Math.max(worst, d);
      if (d > room)
        expect.fail(
          `unit ${u.id} (${u.n}) ${d.toFixed(2)} off the bridge's middle at ${u.x.toFixed(2)},${u.y.toFixed(2)}`,
        );
    }
  }
  return worst;
}

/** a squad of n drawn in single file is this wide: the middle within this of the line keeps it on */
const ROOM = 0.06;

describe('bridge lanes (KAN-53)', () => {
  for (const [name, a, b] of [
    ['straight', [26, 40], [35, 40]],
    ['slanting', [27, 38], [35, 42]],
  ] as [string, [number, number], [number, number]][])
    it(`squads of 1 to 5 and a heavy squad cross a ${name} bridge on its middle line`, () => {
      const { game, lane } = river(a, b);
      const us = [
        squad(0, 23, a[1] - 1, 5),
        squad(0, 22, a[1], 3),
        squad(0, 23, a[1] + 1, 1),
        squad(0, 21, a[1] + 1, 2),
        squad(0, 20, a[1] - 1, 3, 'golem'),
      ];
      game.apply(0, {
        t: 'move',
        ids: us.map(u => u.id),
        x: 40,
        y: b[1],
        mode: 'move',
      });
      watch(game, lane, 50, ROOM, us);
      // everyone is over (the bridge is the way: the river's ends are 30 tiles off)
      for (const u of us) expect(u.x).toBeGreaterThan(36);
      expect(ROOM).toBeLessThan(PLANKS);
    });

  it('mates crossing the other way pass each other on the bridge', () => {
    const { game, lane } = river([26, 40], [35, 40]);
    const east = squad(0, 23, 40, 5);
    const west = squad(0, 38, 40, 5);
    game.apply(0, { t: 'move', ids: [east.id], x: 40, y: 40, mode: 'move' });
    game.apply(0, { t: 'move', ids: [west.id], x: 22, y: 40, mode: 'move' });
    watch(game, lane, 40, ROOM, [east, west]);
    expect(east.x).toBeGreaterThan(37);
    expect(west.x).toBeLessThan(25);
  });

  it('a fight in the middle of a bridge keeps both squads on its middle line', () => {
    const { game, lane } = river([26, 40], [35, 40]);
    const ours = squad(0, 27, 40, 5);
    const foe = squad(1, 35, 40, 5);
    game.apply(0, { t: 'move', ids: [ours.id], x: 40, y: 40, mode: 'amove' });
    game.apply(1, { t: 'move', ids: [foe.id], x: 22, y: 40, mode: 'amove' });
    let met = false;
    for (let s = 0; s < 60 && !(ours.dead || foe.dead); s++) {
      watch(game, lane, 1, ROOM, [ours, foe]);
      if (ours.tgt === foe.id && overWater(ours)) met = true;
    }
    expect(met).toBe(true);
    expect(ours.dead || foe.dead).toBe(true);
  });
});
