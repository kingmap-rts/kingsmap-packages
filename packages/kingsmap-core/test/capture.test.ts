import { describe, expect, it } from 'vitest';
import { cleanIntent } from '@kingmap-rts/kingsmap-protocol';
import { createGame, type Game } from '../src/index';
import type { Building, Unit } from '../src/sim/world/types';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { acquireTarget } from '../src/sim/systems/combat';
import { walkable } from '../src/sim/world/terrain';
import { ROAD_LEN } from '../src/sim/config/network';

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

  it('a plain move next to the post starts shooting it (what capture avoids)', () => {
    const { game, post, mine } = stage();
    const ids = mine.map(u => u.id);
    game.apply(0, { t: 'move', ids, x: post.x, y: post.y, mode: 'move' });
    run(game, mine, 30, () => !!post.dead || post.owner === 0);
    expect(post.hp).toBeLessThan(post.maxhp);
  });

  it('the order lapses when the post is linked again: back to normal, the post is a target', () => {
    const { game, post, mine } = stage();
    const ids = mine.map(u => u.id);
    game.apply(0, { t: 'capture', ids, target: post.id });
    run(game, mine, 30, () =>
      mine.every(u => Math.hypot(u.x - post.x - 0.5, u.y - post.y - 0.5) < 2.5),
    );
    expect(post.owner).toBe(1);
    const u = mine[0];
    acquireTarget(u);
    expect(u.capB).toBe(post.id);
    expect(u.tgt).toBe(0);
    // the enemy reconnects it (kept linked every tick here): it can no longer be taken
    for (let i = 0; i < 100 && !post.dead; i++) {
      post.linked = true;
      game.step();
      post.linked = true;
      acquireTarget(u);
    }
    expect(mine.every(m => !m.capB)).toBe(true);
    expect(post.hp).toBeLessThan(post.maxhp);
    expect(post.owner).toBe(1);
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

describe('the capture intent on the wire (KAN-28)', () => {
  it('the protocol passes a clean copy and rejects a broken one', () => {
    const x = { t: 'capture', ids: [1, 2], target: 7, extra: 1 };
    expect(cleanIntent(x)).toEqual({ t: 'capture', ids: [1, 2], target: 7 });
    expect(cleanIntent({ t: 'capture', ids: [1] })).toBeNull();
    expect(cleanIntent({ t: 'capture', ids: 'x', target: 7 })).toBeNull();
  });
});
