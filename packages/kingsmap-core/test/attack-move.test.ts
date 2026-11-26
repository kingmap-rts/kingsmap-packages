import { describe, expect, it } from 'vitest';
import { Terrain } from '@kingmap-rts/kingsmap-types';
import { cleanIntent } from '@kingmap-rts/kingsmap-protocol';
import { createGame, type Game } from '../src/index';
import type { Unit, UnitType } from '../src/sim/world/types';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { roadMap, roadSum } from '../src/sim/state';

/** an empty plain with two realms and nothing else on it */
function field() {
  const game = createGame({
    seed: 3,
    headless: true,
    humans: { 0: 'a', 1: 'b' },
  });
  const G = game.world;
  game.map.terrain.fill(Terrain.Plain);
  G.units = [];
  G.convoys = [];
  G.buildings = [];
  G.links = [];
  G.byId.clear();
  G.bAt.fill(-1);
  roadMap.fill(0);
  roadSum.fill(0);
  for (const p of G.players) {
    p.alive = p.id < 2;
    p.res = { wood: 9e5, ore: 0, steel: 9e5, food: 9e5, crystal: 0 };
  }
  return game;
}

function squad(
  owner: number,
  x: number,
  y: number,
  n = 5,
  type: UnitType = 'inf',
) {
  const u = addUnit(type, owner, x, y);
  u.n = n;
  u.maxhp = u.hp = n * u.mhp;
  u.solo = true;
  return u;
}

/** one tick with everyone supplied (no network on an empty field) */
function step(game: Game, n = 1) {
  for (let i = 0; i < n; i++) {
    game.world.netT = 1e9;
    for (const u of game.world.units) {
      u.supplied = true;
      u.ammo = 99;
    }
    game.step();
  }
}

/** steps until done() or the seconds run out; returns the seconds it took */
function runUntil(game: Game, seconds: number, done: () => boolean) {
  const t0 = game.world.t;
  while (game.world.t - t0 < seconds && !done()) step(game);
  return game.world.t - t0;
}

const ids = (a: Unit[]) => a.map(u => u.id);
const alive = (a: Unit[]) => a.filter(u => !u.dead);
/** at rest: no foe, no way left to walk, at its own spot */
const settled = (u: Unit) =>
  !u.tgt &&
  !(u.path && u.path.length) &&
  !u.wps &&
  !!u.end &&
  Math.hypot(u.x - u.end[0], u.y - u.end[1]) < 1.5;

describe('attack-move (KAN-61)', () => {
  it('a big army of squads and single soldiers beats every foe on the way and at the spot, then stands there', () => {
    const game = field();
    const army: Unit[] = [];
    for (let i = 0; i < 6; i++)
      army.push(squad(0, 18 + (i % 3) * 1.5, 28 + Math.floor(i / 3) * 1.5));
    for (let i = 0; i < 12; i++)
      army.push(squad(0, 15 + (i % 4), 27 + Math.floor(i / 4) * 1.2, 1));
    const foes = [
      squad(1, 30, 30, 1),
      squad(1, 36, 28.5, 1),
      squad(1, 42, 31, 1, 'militia'),
      squad(1, 48, 29, 2),
      squad(1, 60, 29.5, 2),
      squad(1, 61, 31, 1),
      squad(1, 59, 27.5, 1, 'militia'),
    ];
    game.apply(0, { t: 'move', ids: ids(army), x: 60, y: 29, mode: 'amove' });
    const took = runUntil(
      game,
      90,
      () => alive(foes).length === 0 && alive(army).every(settled),
    );
    expect(alive(foes)).toEqual([]);
    // nobody is stuck after a fight: everyone stands at its spot by the target
    expect(alive(army).every(settled)).toBe(true);
    expect(alive(army).every(u => Math.hypot(u.x - 60, u.y - 29) < 8)).toBe(
      true,
    );
    expect(took).toBeLessThan(60);
  });

  it('a marching group turns on a foe a little off its way; a plain move walks past it', () => {
    for (const mode of ['amove', 'move'] as const) {
      const game = field();
      const group = [squad(0, 20, 30), squad(0, 20, 31.5)];
      // the front unit walks along y = 30.5; the foe stands 4.2 tiles off that line: beyond what a
      // standing soldier looks (3.5) and what the foe itself looks (3)
      const foe = squad(1, 40, 30.5 - 4.2, 3, 'militia');
      game.apply(0, { t: 'move', ids: ids(group), x: 60, y: 30, mode });
      runUntil(game, 45, () => !!foe.dead);
      expect(!!foe.dead).toBe(mode === 'amove');
    }
  });

  it('a soldier on attack-move answers a trebuchet that shells it from out of its sight; a stopped one does not', () => {
    for (const stopped of [false, true]) {
      const game = field();
      const us = squad(0, 30, 30, 3, 'militia');
      game.apply(0, { t: 'move', ids: [us.id], x: 30, y: 30, mode: 'amove' });
      if (stopped) game.apply(0, { t: 'stop', ids: [us.id] });
      const treb = squad(1, 34.8, 30, 1, 'siege');
      treb.deployT = 99;
      runUntil(game, 30, () => !!treb.dead || !!us.dead);
      expect(!!treb.dead).toBe(!stopped);
    }
  });

  it('never strikes an enemy building by itself (KAN-41): a depot by the way stays whole', () => {
    const game = field();
    const store = addBuilding('depot', 1, 40, 33);
    const group = [squad(0, 20, 30), squad(0, 20, 31.5), squad(0, 21.5, 30.5)];
    game.apply(0, { t: 'move', ids: ids(group), x: 60, y: 31, mode: 'amove' });
    runUntil(game, 40, () => group.every(settled));
    expect(group.every(settled)).toBe(true);
    expect(store.hp).toBe(store.maxhp);
    expect(store.owner).toBe(1);
  });
});

describe('queued points, Shift+click (KAN-61)', () => {
  it('the group walks to each point in turn, fights at them, and keeps its shape', () => {
    const game = field();
    const group = [squad(0, 20, 30), squad(0, 20, 31.5), squad(0, 21.5, 30.5)];
    const id = ids(group);
    game.apply(0, { t: 'move', ids: id, x: 30, y: 30, mode: 'amove' });
    game.apply(0, { t: 'move', ids: id, x: 30, y: 50, queue: true });
    game.apply(0, {
      t: 'move',
      ids: id,
      x: 50,
      y: 50,
      mode: 'move',
      queue: true,
    });
    expect(group.every(u => u.wps?.length === 2)).toBe(true);
    const foe = squad(1, 31, 50, 1);
    let passedB = false;
    runUntil(game, 120, () => {
      if (group.some(u => Math.hypot(u.x - 30.5, u.y - 50.5) < 3))
        passedB = true;
      return group.every(settled) && !!foe.dead;
    });
    expect(passedB).toBe(true);
    expect(foe.dead).toBe(true);
    expect(group.every(settled)).toBe(true);
    // all of them by the last point, still a group (each on its own spot, nobody piled on another)
    for (const u of group)
      expect(Math.hypot(u.x - 50.5, u.y - 50.5)).toBeLessThan(4);
    const spots = new Set(group.map(u => `${u.x | 0},${u.y | 0}`));
    expect(spots.size).toBe(group.length);
  });

  it('a plain order (or stop) drops the queue; a queued click on idle troops is a plain order', () => {
    const game = field();
    const group = [squad(0, 20, 30), squad(0, 20, 31.5)];
    const id = ids(group);
    game.apply(0, { t: 'move', ids: id, x: 40, y: 30, queue: true });
    expect(group.every(u => !u.wps && u.path && u.path.length)).toBe(true);
    game.apply(0, { t: 'move', ids: id, x: 40, y: 40, queue: true });
    expect(group.every(u => u.wps?.length === 1)).toBe(true);
    game.apply(0, { t: 'move', ids: id, x: 10, y: 10 });
    expect(group.every(u => !u.wps)).toBe(true);
    game.apply(0, { t: 'move', ids: id, x: 40, y: 40, queue: true });
    game.apply(0, { t: 'stop', ids: id });
    expect(group.every(u => !u.wps)).toBe(true);
  });

  it('the protocol keeps the queue flag only when it is true', () => {
    const base = { t: 'move', ids: [1], x: 3, y: 4 };
    expect(cleanIntent({ ...base, queue: true })).toMatchObject({
      queue: true,
    });
    expect(cleanIntent({ ...base, queue: 'yes' })).not.toHaveProperty('queue');
    expect(cleanIntent(base)).not.toHaveProperty('queue');
  });
});
