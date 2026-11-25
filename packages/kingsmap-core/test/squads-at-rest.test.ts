import { describe, expect, it } from 'vitest';
import type { Unit } from '@kingmap-rts/kingsmap-types';
import { createGame, type Game } from '../src/index';
import { campaign, standsAt } from '../src/sim/ai/campaign';
import { bodyR } from '../src/sim/systems/combat';
import { orderMove } from '../src/sim/systems/movement';
import { findPath } from '../src/sim/systems/pathfinding';
import { addUnit } from '../src/sim/world/entities';
import { walkable } from '../src/sim/world/terrain';

/** seat 1 is a bot whose own brain is kept quiet: the test gives its orders */
function start() {
  const game = createGame({ seed: 21, headless: true, humans: { 0: 'a' } });
  for (const p of game.world.players) {
    p.res.food = 1e5;
    p.ai.next = 1e9;
  }
  return game;
}

/** a walkable tile near the bot's castle with mountains (or water) close on several sides */
function byMountains(game: Game, seat: number): [number, number] {
  const hq = game.world.players[seat].hq;
  let best: [number, number] = [hq.x, hq.y];
  let bs = -1;
  for (let y = hq.y - 12; y <= hq.y + 12; y++)
    for (let x = hq.x - 12; x <= hq.x + 12; x++) {
      if (
        !walkable(x, y) ||
        Math.hypot(x - hq.x, y - hq.y) > 8 ||
        !findPath(hq.x, hq.y + 1, x, y)
      )
        continue;
      let blocked = 0;
      for (let oy = -2; oy <= 2; oy++)
        for (let ox = -2; ox <= 2; ox++)
          if (!walkable(x + ox, y + oy)) blocked++;
      // hemmed in, but with room for the squads to stand
      if (blocked > bs && blocked <= 12) {
        bs = blocked;
        best = [x, y];
      }
    }
  expect(bs).toBeGreaterThan(4);
  return best;
}

/** n full squads of foot soldiers of a seat beside its castle */
function squads(game: Game, seat: number, n: number) {
  const hq = game.world.players[seat].hq;
  const us: Unit[] = [];
  for (let i = 0; us.length < n && i < 200; i++) {
    const x = hq.x + 0.5 + (i % 6) * 1.1 - 2.5;
    const y = hq.y + 2 + Math.floor(i / 6) * 1.1;
    if (!walkable(x | 0, y | 0)) continue;
    const u = addUnit('inf', seat, x, y);
    u.n = 5;
    u.maxhp = u.hp = 5 * u.mhp;
    us.push(u);
  }
  return us;
}

/** steps `seconds`; `each` (if given) runs every 1.4 s, as often as a bot thinks */
function run(game: Game, seconds: number, each?: () => void) {
  const ticks = Math.round(seconds * 10);
  for (let i = 0; i < ticks; i++) {
    if (each && i % 14 === 0) each();
    game.step();
  }
}

/** how far the units move over `seconds`, summed, and the worst overlap of two bodies at the end */
function restless(game: Game, us: Unit[], seconds: number, each?: () => void) {
  let moved = 0;
  const ticks = Math.round(seconds * 10);
  for (let i = 0; i < ticks; i++) {
    const at = us.map(u => [u.x, u.y]);
    if (each && i % 14 === 0) each();
    game.step();
    us.forEach((u, k) => (moved += Math.hypot(u.x - at[k][0], u.y - at[k][1])));
  }
  let overlap = 0;
  for (let i = 0; i < us.length; i++)
    for (let j = i + 1; j < us.length; j++) {
      const a = us[i];
      const b = us[j];
      const o = bodyR(a) + bodyR(b) - Math.hypot(a.x - b.x, a.y - b.y);
      if (o > overlap) overlap = o;
    }
  return { moved, overlap };
}

describe('squads at rest stand still (KAN-57)', () => {
  it('8 bot squads sent to a hemmed-in spot by the mountains settle and stand still', () => {
    const game = start();
    const [x, y] = byMountains(game, 1);
    const us = squads(game, 1, 8);
    orderMove(us, x, y);
    run(game, 30);
    expect(us.every(u => !(u.path && u.path.length))).toBe(true);
    // the bot thinks every 1.4 s and sends on only those not yet standing round the spot
    const { moved, overlap } = restless(game, us, 6, () =>
      orderMove(
        us.filter(u => !standsAt(u, x, y, us.length)),
        x,
        y,
      ),
    );
    expect(moved).toBeLessThan(0.5);
    expect(overlap).toBeLessThan(0.1);
  });

  it('a group ordered again onto the spot it stands on (open ground) stays put', () => {
    const game = start();
    const hq = game.world.players[0].hq;
    const us = squads(game, 0, 8);
    const [x, y] = [hq.x - 4, hq.y + 6];
    orderMove(us, x, y);
    run(game, 25);
    expect(us.every(u => !(u.path && u.path.length))).toBe(true);
    const { moved, overlap } = restless(game, us, 6, () => orderMove(us, x, y));
    expect(moved).toBeLessThan(1);
    expect(overlap).toBeLessThan(0.1);
  });

  it("a bot's campaign group standing round its objective is not sent to it again", () => {
    const game = start();
    const G = game.world;
    const p = G.players[1];
    const foe = G.players[0];
    const tb = foe.hq;
    const us = squads(game, 1, 8);
    for (const u of us) {
      u.x = tb.x + 4 + (u.x - p.hq.x) * 0.5;
      u.y = tb.y + 4 + (u.y - p.hq.y) * 0.5;
    }
    orderMove(us, tb.x, tb.y);
    for (const u of us) u.job = 'push';
    run(game, 10);
    const ai = p.ai;
    ai.tfoe = foe.id;
    ai.tfoeUntil = 1e9;
    ai.gT = tb.id;
    ai.gProgT = G.t;
    ai.gLast = [tb.x, tb.y];
    ai.gPeak = 40;
    const ends = us.map(u => u.end);
    const stand = us.filter(u => !u.tgt && !(u.path && u.path.length));
    campaign(p, us, [], [], [foe], null, 1e9);
    // nobody standing in the ranks gets a new place
    for (const u of stand) expect(u.end).toBe(ends[us.indexOf(u)]);
  });
});
