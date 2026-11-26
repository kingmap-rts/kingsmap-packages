// KAN-59: allies never bar each other on a bridge's single file. A column of single units or of
// squads crosses a bridge both ways in time, past mates standing on it, and an order onto a bridge
// puts the group on the bank, not on the planks.
import { describe, expect, it } from 'vitest';
import { createGame, rules, type Game } from '../src/index';
import type { Unit } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { recomputeNetwork } from '../src/sim/systems/network';
import { onLane } from '../src/sim/systems/bridges';
import { bridgeMap, terrainMap } from '../src/sim/state';

const { MAP_W } = rules;

/** a river down x = x0..x1 (y = 10..69); seat 0's posts at `a` and `b` on both banks, bridged */
function river(
  a: [number, number],
  b: [number, number],
  x0: number,
  x1: number,
) {
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
    for (let x = x0; x <= x1; x++) terrainMap[y * MAP_W + x] = Terrain.Water;
  G.players[0].hq.x = 20;
  G.players[0].hq.y = 40;
  G.players[1].hq.x = 70;
  G.players[1].hq.y = 40;
  addBuilding('depot', 0, a[0], a[1]);
  addBuilding('depot', 0, b[0], b[1]);
  recomputeNetwork();
  expect(bridgeMap.some(v => v === 1)).toBe(true);
  return game;
}

const unit = (x: number, y: number, n: number) => {
  const u = addUnit('inf', 0, x, y);
  u.n = n;
  u.hp = u.maxhp = u.mhp * n;
  u.supplied = true;
  return u;
};

/** cols × rows units of n soldiers, a tile apart, from the tile (x, y) */
function block(x: number, y: number, cols: number, rows: number, n: number) {
  const us: Unit[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) us.push(unit(x + c + 0.5, y + r + 0.5, n));
  return us;
}

const wet = (u: Unit) =>
  terrainMap[(u.y | 0) * MAP_W + (u.x | 0)] === Terrain.Water;

/** steps until every group is done; the seconds it took, or fails naming who is left behind */
function cross(
  game: Game,
  groups: { us: Unit[]; done: (u: Unit) => boolean }[],
  secs: number,
) {
  for (let i = 0; i < secs * 10; i++) {
    for (const g of groups) for (const u of g.us) u.supplied = true;
    game.step();
    if (groups.every(g => g.us.every(u => u.dead || g.done(u))))
      return (i + 1) / 10;
  }
  const left = groups.flatMap(g => g.us.filter(u => !u.dead && !g.done(u)));
  return expect.fail(
    `${left.length} not over in ${secs} s: ` +
      left
        .slice(0, 5)
        .map(u => `${u.id}@${u.x.toFixed(2)},${u.y.toFixed(2)}`)
        .join(' '),
  );
}

const BRIDGES: [string, [number, number], [number, number], number, number][] =
  [
    ['straight', [26, 40], [35, 40], 30, 32],
    ['slanting', [27, 38], [35, 42], 30, 32],
    ['long', [27, 40], [36, 40], 30, 34],
  ];

/** the longest a column may take, seconds (single units take ~15 s, squads ~25–35 s) */
const SINGLE = 30;
const SQUADS = 60;

describe('a column crosses a bridge (KAN-59)', () => {
  for (const [name, a, b, x0, x1] of BRIDGES) {
    const east = (u: Unit) => u.x > x1 + 1;
    const west = (u: Unit) => u.x < x0;
    /** the middle line of the bridge over the water at x */
    const lane = (x: number) =>
      onLane(
        x,
        a[1] + ((b[1] - a[1]) * (x - a[0] - 0.5)) / (b[0] - a[0]) + 0.5,
      )!;

    for (const n of [1, 5])
      it(`${n === 1 ? 'single units' : 'squads'} cross the ${name} bridge both ways at once, past mates standing on it`, () => {
        const game = river(a, b, x0, x1);
        // two mates stopped on the planks
        const stand = [x0 + 0.3, x1 + 0.7].map(x => {
          const [lx, ly] = lane(x);
          return unit(lx, ly, n);
        });
        game.apply(0, { t: 'stop', ids: stand.map(u => u.id) });
        const e = block(13, a[1] - 2, 4, 3, n);
        const w = block(x1 + 8, b[1] - 2, 4, 3, n);
        game.apply(0, {
          t: 'move',
          ids: e.map(u => u.id),
          x: x1 + 10,
          y: b[1],
          mode: 'move',
        });
        game.apply(0, {
          t: 'move',
          ids: w.map(u => u.id),
          x: 14,
          y: a[1],
          mode: 'move',
        });
        cross(
          game,
          [
            { us: e, done: east },
            { us: w, done: west },
          ],
          n === 1 ? SINGLE : SQUADS,
        );
      });

    it(`12 squads each way meet head-on at the ${name} bridge and all get over`, () => {
      // (five starts a little apart: on core 0.18.0 two of them on the straight bridge jammed five
      // squads at its west end for good)
      for (let o = 0; o < 5; o++) {
        const game = river(a, b, x0, x1);
        const e = block(13 - (o % 2), a[1] - 4 + o, 4, 3, 5);
        const w = block(x1 + 8, b[1] - 2 - o, 4, 3, 5);
        game.apply(0, {
          t: 'move',
          ids: e.map(u => u.id),
          x: x1 + 10,
          y: b[1] - 2 + o,
          mode: 'move',
        });
        game.apply(0, {
          t: 'move',
          ids: w.map(u => u.id),
          x: 14,
          y: a[1] + 2 - o,
          mode: 'move',
        });
        cross(
          game,
          [
            { us: e, done: east },
            { us: w, done: west },
          ],
          SQUADS,
        );
      }
    });

    it(`a group ordered onto the ${name} bridge stands on the bank, off the planks`, () => {
      const game = river(a, b, x0, x1);
      const g = block(14, a[1] - 2, 4, 2, 5);
      const mx = (x0 + x1) >> 1;
      const [, ly] = lane(mx + 0.5);
      game.apply(0, {
        t: 'move',
        ids: g.map(u => u.id),
        x: mx,
        y: ly | 0,
        mode: 'move',
      });
      for (const u of g)
        expect(wet({ ...u, x: u.end![0], y: u.end![1] } as Unit)).toBe(false);
      cross(game, [{ us: g, done: u => !(u.path && u.path.length) }], SQUADS);
      for (const u of g) expect(wet(u)).toBe(false);
    });
  }
});
