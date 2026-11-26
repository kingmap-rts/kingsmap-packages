// KAN-81: builders mend a building of their realm they stand by; repair crews double that and let a
// building left alone mend itself.
import { describe, expect, it } from 'vitest';
import { Lockstep } from '@kingmap-rts/kingsmap-types';
import { createGame, rules, type Game } from '../src/index';
import type { Building, Unit } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { addBuilding, addUnit } from '../src/sim/world/entities';
import { recomputeNetwork } from '../src/sim/systems/network';
import { terrainMap } from '../src/sim/state';

const { BUILDER_REPAIR, REPAIR_CALM, REPAIR_SELF, REPAIR_CREW_MAX } = rules;

/** open plain, castles of seats 0 and 1 far apart, a damaged post of seat 0 at (28,40) */
function field(): { game: Game; post: Building } {
  const game = createGame({
    seed: 12,
    headless: true,
    humans: { 0: 'me', 1: 'foe' },
  });
  const G = game.world;
  for (const b of G.buildings)
    if (b.type !== 'hq' || b.owner > 1) b.dead = true;
  for (const u of G.units) u.dead = true;
  for (const p of G.players) if (p.id > 1) p.alive = false;
  for (let k = 0; k < terrainMap.length; k++) terrainMap[k] = Terrain.Plain;
  G.players[0].hq.x = 20;
  G.players[0].hq.y = 40;
  G.players[1].hq.x = 90;
  G.players[1].hq.y = 40;
  const post = addBuilding('depot', 0, 28, 40);
  recomputeNetwork();
  post.hp = post.maxhp / 2;
  post.lastHit = G.t;
  return { game, post };
}

/** run the game for `s` seconds */
function run(game: Game, s: number) {
  const n = Math.round(s / Lockstep.TickSeconds);
  for (let i = 0; i < n; i++) game.step();
}

const builders = (n: number, owner = 0): Unit[] =>
  Array.from({ length: n }, () => addUnit('builder', owner, 28.5, 41.5));

describe('repair', () => {
  it('a damaged building stays damaged with no builder and no repair crews', () => {
    const { game, post } = field();
    const hp = post.hp;
    run(game, REPAIR_CALM + 4);
    expect(post.hp).toBe(hp);
  });

  it('a builder by the building mends it', () => {
    const { game, post } = field();
    builders(1);
    const hp = post.hp;
    run(game, 4);
    expect(post.hp - hp).toBeGreaterThan(BUILDER_REPAIR * 3);
    expect(post.hp - hp).toBeLessThan(BUILDER_REPAIR * 5);
  });

  it('at most a few builders work on one building', () => {
    const { game, post } = field();
    builders(REPAIR_CREW_MAX + 3);
    const hp = post.hp;
    run(game, 2);
    expect(post.hp - hp).toBeLessThanOrEqual(
      BUILDER_REPAIR * REPAIR_CREW_MAX * 2 + 1,
    );
  });

  it("an enemy's builder does not mend it", () => {
    const { game, post } = field();
    builders(2, 1);
    const hp = post.hp;
    run(game, 3);
    expect(post.owner).toBe(0);
    expect(post.hp).toBe(hp);
  });

  it('repair crews: builders twice as fast, and a building left alone mends itself', () => {
    const { game, post } = field();
    game.world.players[0].perks.push('repair');
    const hp = post.hp;
    run(game, REPAIR_CALM - 1);
    expect(post.hp).toBe(hp);
    run(game, 5);
    expect(post.hp).toBeGreaterThan(hp + REPAIR_SELF * 2);
    const { game: g2, post: p2 } = field();
    g2.world.players[0].perks.push('repair');
    builders(1);
    const h2 = p2.hp;
    run(g2, 2);
    expect(p2.hp - h2).toBeGreaterThan(BUILDER_REPAIR * 2 * 1.5);
  });

  it('never above full health', () => {
    const { game, post } = field();
    builders(3);
    run(game, 60);
    expect(post.hp).toBe(post.maxhp);
  });
});
