// KAN-60: a unit sent to work an enemy road (burn, cut, trap) carries the order out to the end
// instead of running after the foes nearby.
import { describe, expect, it } from 'vitest';
import { cleanIntent } from '@kingmap-rts/kingsmap-protocol';
import { createGame, type Game } from '../src/index';
import type { Building, Link, Unit } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { recomputeNetwork } from '../src/sim/systems/network';
import { terrainMap } from '../src/sim/state';
import { segmentDist } from '../src/sim/util/geometry';

/** open plain, castles of seats 0 (20,40) and 1 (90,40); seat 1's road from (70,40) to (78,40) */
function field(): { game: Game; road: Link } {
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
  const place = (b: Building, x: number, y: number) => {
    b.x = x;
    b.y = y;
  };
  place(G.players[0].hq, 20, 40);
  place(G.players[1].hq, 90, 40);
  const a = addBuilding('depot', 1, 70, 40);
  const b = addBuilding('depot', 1, 78, 40);
  recomputeNetwork();
  const road = G.links.find(
    l => (l.a === a && l.b === b) || (l.a === b && l.b === a),
  );
  if (!road) throw new Error('no road between the posts');
  return { game, road };
}

const unit = (type: Unit['type'], owner: number, x: number, y: number) => {
  const u = addUnit(type, owner, x + 0.5, y + 0.5);
  u.supplied = true;
  return u;
};

/** how far u stands from road l, tiles */
const off = (u: Unit, l: Link) =>
  segmentDist(u.x, u.y, l.a.x + 0.5, l.a.y + 0.5, l.b.x + 0.5, l.b.y + 0.5);

const burning = (game: Game, l: Link) =>
  (game.world.sab.get(l.key) || 0) > game.world.t;

/** run the game for s seconds; `each` runs before every step */
function run(game: Game, s: number, each?: () => void, until?: () => boolean) {
  for (let i = 0; i < s * 10; i++) {
    each?.();
    game.step();
    if (until?.()) return true;
  }
  return false;
}

/** a foe that stands where it is and fights nobody (only a bait the raider might run after) */
const bait = (u: Unit) => () => {
  u.tgt = 0;
  u.ftgt = 0;
  u.path = null;
  u.scan = 99;
};

describe('a road task is carried out to the end (KAN-60)', () => {
  it('the intent is checked by the protocol', () => {
    expect(
      cleanIntent({ t: 'sabotage', ids: [1, 2], road: '12_34', x: 3.7, y: 4 }),
    ).toEqual({ t: 'sabotage', ids: [1, 2], road: '12_34', x: 3, y: 4 });
    expect(
      cleanIntent({ t: 'sabotage', ids: [1], road: 'x', x: 3, y: 4 }),
    ).toBeNull();
    expect(cleanIntent({ t: 'sabotage', ids: [1], x: 3, y: 4 })).toBeNull();
  });

  it('a plain move leaves the raider free to run after a foe nearby (the old way)', () => {
    const { game, road } = field();
    const r = unit('raid', 0, 74, 33);
    const foe = unit('inf', 1, 76, 38);
    game.apply(0, { t: 'move', ids: [r.id], x: 74, y: 40, mode: 'move' });
    const hold = bait(foe);
    const chased = run(game, 15, hold, () => r.tgt === foe.id);
    expect(chased).toBe(true);
    expect(off(r, road)).toBeGreaterThan(0);
  });

  it('a raider sent to burn a road burns it to the end with a foe nearby', () => {
    const { game, road } = field();
    const r = unit('raid', 0, 74, 33);
    const foe = unit('inf', 1, 76, 38);
    expect(
      game.apply(0, {
        t: 'sabotage',
        ids: [r.id],
        road: road.key,
        x: 74,
        y: 40,
      }),
    ).toBeNull();
    expect(r.task).toEqual({ kind: 'burn', road: road.key });
    const hold = bait(foe);
    let looked = false;
    let far = 0;
    const done = run(
      game,
      30,
      () => {
        hold();
        if (r.tgt === foe.id) looked = true;
        // once there it stays by the road
        if (!(r.path && r.path.length)) far = Math.max(far, off(r, road));
      },
      () => burning(game, road),
    );
    expect(done).toBe(true);
    expect(looked).toBe(false);
    expect(far).toBeLessThanOrEqual(1.1);
    expect(r.dead).toBeFalsy();
    // the road burns: the task is over and the raider is its own master again
    run(game, 1, hold);
    expect(r.task).toBeNull();
  });

  it('on its spot the raider strikes a foe within reach without leaving the road', () => {
    const { game, road } = field();
    const r = unit('raid', 0, 74, 40);
    game.apply(0, { t: 'sabotage', ids: [r.id], road: road.key, x: 74, y: 40 });
    run(game, 1);
    const foe = unit('inf', 1, 74, 41);
    foe.y = r.y + 1;
    foe.hp = foe.maxhp = 1e6;
    const hp0 = foe.hp;
    run(game, 3, bait(foe));
    expect(r.tgt).toBe(foe.id);
    expect(foe.hp).toBeLessThan(hp0);
    expect(off(r, road)).toBeLessThanOrEqual(1.1);
  });

  it('other troops hold the road: it stays cut while they stand', () => {
    const { game, road } = field();
    const s = unit('inf', 0, 72, 34);
    const foe = unit('inf', 1, 76, 37);
    game.apply(0, { t: 'sabotage', ids: [s.id], road: road.key, x: 74, y: 40 });
    expect(s.task?.kind).toBe('cut');
    let looked = false;
    run(game, 20, () => {
      bait(foe)();
      if (s.tgt === foe.id) looked = true;
    });
    expect(looked).toBe(false);
    expect(s.task?.kind).toBe('cut');
    expect(off(s, road)).toBeLessThanOrEqual(1.1);
    expect(game.world.links.find(l => l.key === road.key)?.blocked).toBe(true);
  });

  it('an arsonist hides its trap on the road, then is free', () => {
    const { game, road } = field();
    const a = unit('arsonist', 0, 76, 34);
    game.apply(0, { t: 'sabotage', ids: [a.id], road: road.key, x: 74, y: 40 });
    expect(a.task?.kind).toBe('trap');
    const set = run(game, 20, undefined, () => game.world.traps.has(road.key));
    expect(set).toBe(true);
    expect(a.task).toBeNull();
  });

  it('a new order ends the task', () => {
    const { game, road } = field();
    const r = unit('raid', 0, 74, 33);
    const foe = unit('inf', 1, 80, 30);
    const go = () =>
      game.apply(0, {
        t: 'sabotage',
        ids: [r.id],
        road: road.key,
        x: 74,
        y: 40,
      });
    go();
    run(game, 3);
    game.apply(0, { t: 'move', ids: [r.id], x: 60, y: 30 });
    expect(r.task).toBeNull();
    go();
    game.apply(0, { t: 'attack', ids: [r.id], target: foe.id });
    expect(r.task).toBeNull();
    go();
    game.apply(0, { t: 'stop', ids: [r.id] });
    expect(r.task).toBeNull();
    // and the raider does go elsewhere
    go();
    run(game, 2);
    game.apply(0, { t: 'move', ids: [r.id], x: 60, y: 30 });
    run(game, 10, bait(foe));
    expect(off(r, road)).toBeGreaterThan(5);
    expect(burning(game, road)).toBe(false);
  });

  it('the task ends when the road is gone; no task on a road of our own or an ally', () => {
    const { game, road } = field();
    const r = unit('raid', 0, 74, 33);
    game.apply(0, { t: 'sabotage', ids: [r.id], road: road.key, x: 74, y: 40 });
    road.a.dead = true;
    run(game, 1);
    expect(r.task).toBeNull();
    const G = game.world;
    G.pact[0][1] = G.pact[1][0] = G.t + 600;
    const l = G.links.find(q => q.owner === 1);
    if (l) {
      const res = game.apply(0, {
        t: 'sabotage',
        ids: [r.id],
        road: l.key,
        x: 74,
        y: 40,
      });
      expect(res?.key).toBe('error.ally');
      expect(r.task).toBeFalsy();
    }
  });

  it('bots send their raiders with the same task', async () => {
    const game = createGame({ seed: 3, diff: 1, headless: true, humans: {} });
    const G = game.world;
    let seen = false;
    for (let i = 0; i < 6000 && !seen && !G.over; i++) {
      game.step();
      if (i % 10 === 0)
        seen = G.units.some(u => u.type === 'raid' && u.task?.kind === 'burn');
      if (i % 500 === 0) await new Promise(r => setImmediate(r));
    }
    expect(seen).toBe(true);
  });
});
