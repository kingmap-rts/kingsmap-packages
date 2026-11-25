import { describe, expect, it } from 'vitest';
import { Terrain } from '@kingmap-rts/kingsmap-types';
import { createGame, type Game } from '../src/index';
import type { Unit, UnitType } from '../src/sim/world/types';
import { addUnit } from '../src/sim/world/entities';
import { blowBonus, strikers } from '../src/sim/systems/combat';
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
  // no roads either (the network is never recomputed here, see step)
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

const heads = (a: Unit[]) =>
  a.filter(u => !u.dead).reduce((s, u) => s + u.n, 0);

describe('a group on the march', () => {
  it('walks at one pace and halts together in ranks across the way, the front rank at the target', () => {
    const game = field();
    const group = [
      squad(0, 30, 30),
      squad(0, 31.5, 31.5),
      squad(0, 29, 32.5),
      squad(0, 32, 34),
      squad(0, 30, 35.5),
      squad(0, 28.5, 34.5),
    ];
    game.apply(0, {
      t: 'move',
      ids: group.map(u => u.id),
      x: 55,
      y: 32,
      mode: 'move',
    });
    const arrived = new Map<number, number>();
    for (let i = 0; i < 400 && arrived.size < group.length; i++) {
      step(game);
      for (const u of group)
        if (!arrived.has(u.id) && !(u.path && u.path.length))
          arrived.set(u.id, game.world.t);
    }
    const t = [...arrived.values()];
    expect(t).toHaveLength(6);
    // they set off scattered, yet all halt within a second of each other
    expect(Math.max(...t) - Math.min(...t)).toBeLessThan(1);
    // two ranks across the way (east): four at x = 55.5, two a rank behind
    const xs = group.map(u => Math.round(u.x * 2) / 2).sort((a, b) => a - b);
    expect(xs.filter(x => x === 55.5)).toHaveLength(4);
    expect(xs.filter(x => x < 55)).toHaveLength(2);
    // nobody on top of another, and every squad faces the way it came
    for (const a of group)
      for (const b of group)
        if (a !== b)
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
    for (const u of group) expect(u.hx).toBeGreaterThan(0.7);
  });
});

describe('melee', () => {
  it('two squads ordered at each other meet front to front, shoulder to shoulder', () => {
    const game = field();
    const a = squad(0, 57.5, 40.5);
    const b = squad(1, 63.5, 40.5);
    game.apply(0, { t: 'attack', ids: [a.id], target: b.id });
    game.apply(1, { t: 'attack', ids: [b.id], target: a.id });
    step(game, 30);
    expect(a.slot).toBe(0);
    expect(b.slot).toBe(0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1.4);
    // they face each other
    expect(a.hx).toBeGreaterThan(0.9);
    expect(b.hx).toBeLessThan(-0.9);
  });

  it('two lines meet squad to squad: nobody pushes in between the foes onto their flanks', () => {
    const game = field();
    const ours: Unit[] = [];
    const theirs: Unit[] = [];
    for (let i = 0; i < 4; i++) {
      ours.push(squad(0, 50.5, 36 + i * 1.5));
      theirs.push(squad(1, 66.5, 36 + i * 1.5));
    }
    game.apply(0, {
      t: 'move',
      ids: ours.map(u => u.id),
      x: 66,
      y: 38,
      mode: 'amove',
    });
    game.apply(1, {
      t: 'move',
      ids: theirs.map(u => u.id),
      x: 50,
      y: 38,
      mode: 'amove',
    });
    step(game, 90);
    // every squad fights, nearly all from the front (only the outer flank of a line's end is open)
    for (const u of [...ours, ...theirs]) {
      expect(u.tgt).toBeGreaterThan(0);
      expect(u.slot).toBeGreaterThanOrEqual(0);
    }
    expect(
      [...ours, ...theirs].filter(u => u.slot === 0).length,
    ).toBeGreaterThanOrEqual(6);
    // the lines stay lines: nobody got round behind the foe it fights
    const byId = new Map([...ours, ...theirs].map(u => [u.id, u]));
    for (const u of ours) expect(u.x).toBeLessThan(byId.get(u.tgt)!.x + 0.3);
    for (const u of theirs)
      expect(u.x).toBeGreaterThan(byId.get(u.tgt)!.x - 0.3);
  });

  it('a blow in the flank or the back lands harder, so does the first blow of a charge', () => {
    const game = field();
    const foe = squad(1, 60.5, 40.5);
    const front = squad(0, 59.5, 40.5);
    const side = squad(0, 60.5, 39.5);
    const back = squad(0, 61.5, 40.5);
    foe.tgt = front.id; // the foe faces its fight: west
    expect(blowBonus(front, foe)).toBe(1);
    expect(blowBonus(side, foe)).toBe(1.25);
    expect(blowBonus(back, foe)).toBe(1.5);
    front.chg = 2;
    expect(blowBonus(front, foe)).toBe(1.5);
    void game;
  });

  it('only the front rank of a squad strikes fully: five on three is not a massacre', () => {
    const game = field();
    expect(strikers(squad(0, 50, 50, 5))).toBe(4);
    expect(strikers(squad(0, 52, 50, 3))).toBe(3);
    const a = squad(0, 57.5, 40.5, 5);
    const b = squad(1, 63.5, 40.5, 3);
    game.apply(0, { t: 'attack', ids: [a.id], target: b.id });
    game.apply(1, { t: 'attack', ids: [b.id], target: a.id });
    for (let i = 0; i < 300 && !b.dead; i++) step(game);
    expect(b.dead).toBe(true);
    // the winner pays for it: at least one of its five falls
    expect(a.n).toBeLessThan(5);
  });

  it('two squads of five fight it out in about ten seconds, not half a minute', () => {
    const game = field();
    const a = squad(0, 57.5, 40.5);
    const b = squad(1, 63.5, 40.5);
    game.apply(0, { t: 'attack', ids: [a.id], target: b.id });
    game.apply(1, { t: 'attack', ids: [b.id], target: a.id });
    let met = -1;
    for (let i = 0; i < 600 && !a.dead && !b.dead; i++) {
      step(game);
      if (met < 0 && (a.lastHit > 0 || b.lastHit > 0)) met = game.world.t;
    }
    expect(a.dead || b.dead).toBe(true);
    const fight = game.world.t - met;
    expect(fight).toBeGreaterThan(6);
    expect(fight).toBeLessThan(16);
  });
});

describe('leaving a fight', () => {
  it('costs a free blow from the foe, and a foe without an order gives the chase up', () => {
    const game = field();
    const a = squad(0, 57.5, 40.5);
    const b = squad(1, 63.5, 40.5);
    game.apply(0, { t: 'move', ids: [a.id], x: 63, y: 40, mode: 'amove' });
    game.apply(1, { t: 'move', ids: [b.id], x: 57, y: 40, mode: 'amove' });
    step(game, 30);
    expect(b.tgt).toBe(a.id);
    const hp = a.hp;
    game.apply(0, { t: 'move', ids: [a.id], x: 40, y: 40, mode: 'move' });
    // the parting blow lands at once
    expect(a.hp).toBeLessThan(hp);
    step(game, 120);
    // it got away: the foe stopped running after it
    expect(a.dead).toBeFalsy();
    expect(b.tgt).toBe(0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(5);
  });

  it('wounds do not heal on the march, only at rest', () => {
    const game = field();
    const a = squad(0, 40.5, 40.5);
    a.hp = a.maxhp - 200;
    a.lastHit = -10;
    game.apply(0, { t: 'move', ids: [a.id], x: 60, y: 40, mode: 'move' });
    step(game, 50);
    expect(a.hp).toBe(a.maxhp - 200);
    step(game, 200);
    expect(a.path?.length ?? 0).toBe(0);
    expect(a.hp).toBeGreaterThan(a.maxhp - 200);
  });
});

describe('the field stays fair to both sides', () => {
  it('in a battle of many squads nobody stands idle next to a foe', () => {
    const game = field();
    const ours: Unit[] = [];
    const theirs: Unit[] = [];
    for (let i = 0; i < 6; i++) {
      ours.push(squad(0, 48.5 + (i % 2) * 1.5, 34 + ((i / 2) | 0) * 2));
      theirs.push(squad(1, 70.5 - (i % 2) * 1.5, 34 + ((i / 2) | 0) * 2));
    }
    game.apply(0, {
      t: 'move',
      ids: ours.map(u => u.id),
      x: 70,
      y: 38,
      mode: 'amove',
    });
    game.apply(1, {
      t: 'move',
      ids: theirs.map(u => u.id),
      x: 48,
      y: 38,
      mode: 'amove',
    });
    const start = heads(ours) + heads(theirs);
    for (let i = 0; i < 300; i++) {
      step(game);
      if (i % 20 !== 19) continue;
      for (const u of [...ours, ...theirs]) {
        if (u.dead) continue;
        const foes = (u.owner ? ours : theirs).filter(o => !o.dead);
        const d = Math.min(...foes.map(o => Math.hypot(o.x - u.x, o.y - u.y)));
        // a foe within its reach of sight: it is fighting someone
        if (d < 3) expect(u.tgt).toBeGreaterThan(0);
      }
    }
    // and the fight takes its toll: most soldiers have fallen by then
    expect(heads(ours) + heads(theirs)).toBeLessThan(start / 2);
  });
});
