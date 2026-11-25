import { describe, expect, it } from 'vitest';
import { cleanIntent } from '@kingmap-rts/kingsmap-protocol';
import { createGame, type Game } from '../src/index';
import type { Building, Unit } from '../src/sim/world/types';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { acquireTarget } from '../src/sim/systems/combat';
import { walkable } from '../src/sim/world/terrain';
import {
  CAPTURE_HOLD_TIME,
  CAPTURE_TIME,
  ROAD_LEN,
} from '../src/sim/config/network';
import { kill } from '../src/sim/systems/combat';

/** an open box whose post spot (x + 10, y + 5) is beyond road reach of seat 1's buildings */
function openBox(w: number, h: number, far: Building[]): [number, number] {
  for (let y = 5; y < 75 - h; y++)
    for (let x = 5; x < 115 - w; x++) {
      let ok = far.every(
        b => Math.hypot(b.x - x - 10, b.y - y - 5) > ROAD_LEN + 4,
      );
      for (let dy = 0; dy < h && ok; dy++)
        for (let dx = 0; dx < w && ok; dx++) ok = walkable(x + dx, y + dy);
      if (ok) return [x, y];
    }
  throw new Error('no open box');
}

/** three squads of seat 0 a few tiles from a cut-off post of seat 1 (no roads, no defenders) */
function stage(): { game: Game; post: Building; mine: Unit[] } {
  const game = createGame({
    seed: 3,
    headless: true,
    humans: { 0: 'a', 1: 'b' },
  });
  const G = game.world;
  for (const p of G.players) if (p.id > 1) p.alive = false;
  const [bx, by] = openBox(
    14,
    10,
    G.buildings.filter(b => b.owner === 1),
  );
  const post = addBuilding('depot', 1, bx + 10, by + 5);
  const mine: Unit[] = [];
  for (let i = 0; i < 3; i++) {
    const u = addUnit('inf', 0, bx + 2, by + 4 + i);
    u.n = 5;
    u.maxhp = u.hp = 5 * u.mhp;
    u.solo = true;
    mine.push(u);
  }
  return { game, post, mine };
}

/**
 * a post of seat 1 linked by road to its castle (8 tiles off, out of the castle's reach), seat 1's
 * own troops gone, and three squads of seat 0 four tiles beyond it
 */
function linkedStage(spec?: 'forge' | 'fort', types = ['inf', 'inf', 'inf']) {
  const game = createGame({
    seed: 3,
    headless: true,
    humans: { 0: 'a', 1: 'b' },
  });
  const G = game.world;
  for (const p of G.players) if (p.id > 1) p.alive = false;
  for (const u of G.units) if (u.owner === 1) kill(u, true);
  // a road ward: troops standing by the post do not cut its road (that would cut the post off,
  // and a cut-off post falls to anyone in CAPTURE_TIME)
  G.players[1].wardUntil = 1e9;
  const hq = G.players[1].hq!;
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, 1],
    [0, -1],
  ]) {
    let ok = true;
    for (let k = 4; k <= 13 && ok; k++)
      for (let s = -1; s <= 1 && ok; s++)
        ok = walkable(hq.x + dx * k + dy * s, hq.y + dy * k + dx * s);
    if (!ok) continue;
    const post = addBuilding('depot', 1, hq.x + dx * 8, hq.y + dy * 8);
    if (spec) post.spec = spec;
    const mine: Unit[] = types.map((t, i) => {
      const u = addUnit(
        t as Unit['type'],
        0,
        post.x + 0.5 + dx * 4 + dy * (i - 1) * 1.2,
        post.y + 0.5 + dy * 4 + dx * (i - 1) * 1.2,
      );
      u.solo = true;
      return u;
    });
    for (let i = 0; i < 5; i++) game.step();
    if (!post.linked) throw new Error('the post is not linked');
    return { game, post, mine };
  }
  throw new Error('no open side by the castle');
}

function run(game: Game, mine: Unit[], seconds: number, until?: () => boolean) {
  for (let i = 0; i < seconds * 10; i++) {
    for (const u of mine) {
      u.supplied = true;
      u.ammo = 99;
    }
    game.step();
    if (until?.()) return;
  }
}

describe('capturing a post (KAN-28)', () => {
  it('troops ordered to capture take the post whole and never shoot it', () => {
    const { game, post, mine } = stage();
    const ids = mine.map(u => u.id);
    expect(game.apply(0, { t: 'capture', ids, target: post.id })).toBeNull();
    expect(mine.every(u => u.capB === post.id)).toBe(true);
    run(game, mine, 30, () => post.owner === 0);
    expect(post.dead).toBeFalsy();
    expect(post.owner).toBe(0);
    expect(post.hp).toBe(post.maxhp);
    // the order is done: the troops stay as plain idle troops by their new post
    run(game, mine, 0.5);
    expect(mine.every(u => !u.capB && !u.tgt)).toBe(true);
  });

  it('an attack order destroys the post as before', () => {
    const { game, post, mine } = stage();
    const ids = mine.map(u => u.id);
    game.apply(0, { t: 'attack', ids, target: post.id });
    run(game, mine, 30, () => !!post.dead);
    expect(post.dead).toBe(true);
    expect(post.owner).toBe(1);
  });

  it('a plain move next to a cut-off post never shoots it: standing there takes it whole (KAN-41)', () => {
    const { game, post, mine } = stage();
    const ids = mine.map(u => u.id);
    game.apply(0, { t: 'move', ids, x: post.x, y: post.y, mode: 'move' });
    run(game, mine, 30, () => !!post.dead || post.owner === 0);
    expect(post.owner).toBe(0);
    expect(post.hp).toBe(post.maxhp);
  });

  it('a fort capture order lapses when the fort is linked again, and nobody shoots it', () => {
    const { game, post, mine } = stage();
    post.spec = 'fort';
    const ids = mine.map(u => u.id);
    expect(game.apply(0, { t: 'capture', ids, target: post.id })).toBeNull();
    const u = mine[0];
    // the enemy reconnects it: a linked fort can only be attacked
    post.linked = true;
    acquireTarget(u);
    expect(mine.some(m => !m.capB)).toBe(true);
    expect(u.tgt).toBe(0);
  });

  it('the order lapses when the post is destroyed or another order is given', () => {
    const { game, post, mine } = stage();
    const ids = mine.map(u => u.id);
    game.apply(0, { t: 'capture', ids, target: post.id });
    game.apply(0, { t: 'stop', ids: [mine[0].id] });
    expect(mine[0].capB).toBe(0);
    game.apply(0, { t: 'move', ids: [mine[1].id], x: 1, y: 1 });
    expect(mine[1].capB).toBe(0);
    post.dead = true;
    acquireTarget(mine[2]);
    expect(mine[2].capB).toBe(0);
  });

  it('refuses posts that cannot be captured, and ignores own buildings', () => {
    const { game, post, mine } = stage();
    const ids = mine.map(u => u.id);
    post.linked = true;
    post.spec = 'fort';
    expect(game.apply(0, { t: 'capture', ids, target: post.id })?.key).toBe(
      'error.notCapturable',
    );
    const hq = game.world.players[1].hq!;
    expect(game.apply(0, { t: 'capture', ids, target: hq.id })?.key).toBe(
      'error.notCapturable',
    );
    const own = game.world.players[0].hq!;
    expect(game.apply(0, { t: 'capture', ids, target: own.id })).toBeNull();
    expect(mine.every(u => !u.capB)).toBe(true);
  });
});

describe('buildings are attacked only by order; linked posts are captured (KAN-41)', () => {
  it('troops next to an enemy store do not attack it by themselves; an attack order does', () => {
    const { game, post, mine } = linkedStage();
    const ids = mine.map(u => u.id);
    game.apply(0, { t: 'move', ids, x: post.x, y: post.y, mode: 'amove' });
    run(game, mine, 25);
    expect(
      mine.every(u => Math.hypot(u.x - post.x - 0.5, u.y - post.y - 0.5) < 3),
    ).toBe(true);
    expect(post.hp).toBe(post.maxhp);
    expect(post.owner).toBe(1);
    expect(mine.every(u => !u.tgt)).toBe(true);
    game.apply(0, { t: 'attack', ids, target: post.id });
    run(game, mine, 40, () => !!post.dead);
    expect(post.dead).toBe(true);
  });

  it('foot soldiers ordered to capture take a linked forge whole after CAPTURE_HOLD_TIME', () => {
    const { game, post, mine } = linkedStage('forge');
    const ids = mine.map(u => u.id);
    expect(game.apply(0, { t: 'capture', ids, target: post.id })).toBeNull();
    let from = -1;
    for (let i = 0; i < 600 && post.owner === 1; i++) {
      run(game, mine, 0.1);
      if (from < 0 && post.cap > 0) from = game.world.t;
    }
    expect(post.owner).toBe(0);
    expect(post.spec).toBe('forge');
    expect(post.hp).toBe(post.maxhp);
    // about the hold time (checked every 0.4 s, the squads still settling, and chasing off the
    // castle's recruits down its road, which they walk fast: KAN-37), far longer than a cut-off post
    const took = game.world.t - from;
    expect(took).toBeGreaterThan(CAPTURE_HOLD_TIME - 1);
    expect(took).toBeLessThan(CAPTURE_HOLD_TIME + 8);
    expect(CAPTURE_HOLD_TIME).toBeGreaterThan(CAPTURE_TIME * 2);
  });

  it('a linked post needs a foot soldier: a trebuchet alone is refused, with one soldier it counts', () => {
    const solo = linkedStage(undefined, ['siege']);
    expect(
      solo.game.apply(0, {
        t: 'capture',
        ids: solo.mine.map(u => u.id),
        target: solo.post.id,
      })?.key,
    ).toBe('error.captureFoot');
    const raid = linkedStage(undefined, ['raid']);
    expect(
      raid.game.apply(0, {
        t: 'capture',
        ids: raid.mine.map(u => u.id),
        target: raid.post.id,
      })?.key,
    ).toBe('error.captureFoot');
    const mixed = linkedStage(undefined, ['raid', 'inf']);
    expect(
      mixed.game.apply(0, {
        t: 'capture',
        ids: mixed.mine.map(u => u.id),
        target: mixed.post.id,
      }),
    ).toBeNull();
    run(mixed.game, mixed.mine, 40, () => mixed.post.owner === 0);
    expect(mixed.post.owner).toBe(0);
  });

  it('troops passing by a linked post, or standing there without the order, never take it', () => {
    const { game, post, mine } = linkedStage();
    const ids = mine.map(u => u.id);
    game.apply(0, { t: 'move', ids, x: post.x, y: post.y, mode: 'move' });
    run(game, mine, 40);
    expect(post.owner).toBe(1);
    expect(post.cap).toBe(0);
  });

  it('a linked fort and the castle cannot be captured, only attacked', () => {
    const { game, post, mine } = linkedStage('fort');
    const ids = mine.map(u => u.id);
    expect(game.apply(0, { t: 'capture', ids, target: post.id })?.key).toBe(
      'error.notCapturable',
    );
  });

  it('a trebuchet still shells enemy buildings in its range by itself (a siege engine)', () => {
    const { game, post, mine } = linkedStage(undefined, ['siege']);
    run(game, mine, 30, () => post.hp < post.maxhp);
    expect(post.hp).toBeLessThan(post.maxhp);
  });
});

describe('the capture intent on the wire (KAN-28)', () => {
  it('the protocol passes a clean copy and rejects a broken one', () => {
    const x = { t: 'capture', ids: [1, 2], target: 7, extra: 1 };
    expect(cleanIntent(x)).toEqual({ t: 'capture', ids: [1, 2], target: 7 });
    expect(cleanIntent({ t: 'capture', ids: [1] })).toBeNull();
    expect(cleanIntent({ t: 'capture', ids: 'x', target: 7 })).toBeNull();
  });
});
