// KAN-43: a road that runs through a hostile kingdom's land does not link the posts.
import { describe, expect, it } from 'vitest';
import { createGame, rules, type Game } from '../src/index';
import type { Building } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { addBuilding } from '../src/sim/world/entities';
import { recomputeNetwork } from '../src/sim/systems/network';
import { roadRoute, roadTiles } from '../src/sim/systems/roads';
import { terrainMap } from '../src/sim/state';

const { MAP_W } = rules;

/** a game with only the castles of seats 0 and 1, on open plain, no units */
function emptyField(): { game: Game; h0: Building; h1: Building } {
  const game = createGame({ seed: 11, headless: true, humans: { 0: 'me' } });
  const G = game.world;
  for (const b of G.buildings)
    if (b.type !== 'hq' || b.owner > 1) b.dead = true;
  for (const u of G.units) u.dead = true;
  for (let k = 0; k < terrainMap.length; k++) terrainMap[k] = Terrain.Plain;
  return { game, h0: G.players[0].hq, h1: G.players[1].hq };
}

const place = (b: Building, x: number, y: number) => {
  b.x = x;
  b.y = y;
};

const linkOf = (game: Game, a: Building, b: Building) =>
  game.world.links.find(
    l => (l.a === a && l.b === b) || (l.a === b && l.b === a),
  );

/** posts of seat 0 at (28,40) and (37,40) from its castle at (20,40); a wedge of seat 1 between */
function wedge() {
  const { game, h0, h1 } = emptyField();
  place(h0, 20, 40);
  place(h1, 32, 51);
  // older than the posts it cuts, so its land is there first
  const w = addBuilding('depot', 1, 32, 44);
  const a1 = addBuilding('depot', 0, 28, 40);
  const a2 = addBuilding('depot', 0, 37, 40);
  recomputeNetwork();
  return { game, h0, h1, w, a1, a2 };
}

describe('roads through foreign land', () => {
  it('the wedge of another kingdom cuts the road: the post behind it is cut off and yields nothing', () => {
    const { game, w, a1, a2 } = wedge();
    const G = game.world;
    expect(w.linked).toBe(true);
    expect(a1.linked).toBe(true);
    // the road a1–a2 really runs over seat 1's land
    const tiles = roadTiles(terrainMap, a1.x, a1.y, a2.x, a2.y);
    expect([...tiles].some(k => G.own[k] === 1)).toBe(true);
    expect(linkOf(game, a1, a2)?.blocked).toBe(true);
    expect(a2.linked).toBe(false);
    expect(Object.values(a2.yld).every(v => v === 0)).toBe(true);
    expect(G.own[a2.y * MAP_W + a2.x]).not.toBe(0);
  });

  it('when the wedge is gone the posts are linked again', () => {
    const { game, w, a1, a2 } = wedge();
    w.dead = true;
    recomputeNetwork();
    expect(linkOf(game, a1, a2)?.blocked).toBe(false);
    expect(a2.linked).toBe(true);
    expect(Object.values(a2.yld).some(v => v > 0)).toBe(true);
  });

  it('allied land does not cut a road', () => {
    const { game, a1, a2 } = wedge();
    const G = game.world;
    G.pact[0][1] = G.pact[1][0] = G.t + 600;
    recomputeNetwork();
    expect(linkOf(game, a1, a2)?.blocked).toBe(false);
    expect(a2.linked).toBe(true);
  });

  it("a road ward and a king's highway are not cut by foreign land", () => {
    const ward = wedge();
    ward.game.world.players[0].wardUntil = ward.game.world.t + 60;
    recomputeNetwork();
    expect(linkOf(ward.game, ward.a1, ward.a2)?.blocked).toBe(false);
    expect(ward.a2.linked).toBe(true);

    const royal = wedge();
    const l = linkOf(royal.game, royal.a1, royal.a2)!;
    royal.game.world.royal.set(l.key, royal.game.world.t + 60);
    recomputeNetwork();
    expect(linkOf(royal.game, royal.a1, royal.a2)?.blocked).toBe(false);
    expect(royal.a2.linked).toBe(true);
  });

  it('tells the owner once when the road through foreign land cuts posts off', () => {
    const { game, w, a1, a2 } = wedge();
    const G = game.world;
    // first the wedge is not linked to its castle: the road is open
    const h1 = G.players[1].hq;
    place(h1, 100, 10);
    recomputeNetwork();
    expect(a2.linked).toBe(true);
    G.t = Math.max(G.t, 5);
    G.sim = false; // headless games keep no notices
    const before = G.notices.length;
    place(h1, 32, 51);
    recomputeNetwork();
    expect(w.linked).toBe(true);
    expect(a2.linked).toBe(false);
    expect(a1.linked).toBe(true);
    const ours = G.notices
      .slice(before)
      .filter(([seat, m]) => seat === 0 && m.key === 'notice.roadThroughLand');
    expect(ours).toHaveLength(1);
    expect(ours[0][1].params).toEqual({ owner: 1, amount: 1 });
    recomputeNetwork();
    expect(
      G.notices
        .slice(before)
        .filter(([, m]) => m.key === 'notice.roadThroughLand'),
    ).toHaveLength(1);
  });

  it('is stable: the same world gives the same network turn after turn, even when two roads cut each other', () => {
    const { game, h0, h1 } = emptyField();
    const G = game.world;
    // two roads that cross: each runs over land of the other kingdom's post at its far end.
    // The older posts claim first: b2 < a2 < a1 < b1.
    place(h0, 57, 40);
    place(h1, 30, 38);
    const b2 = addBuilding('depot', 1, 44, 44);
    const a2 = addBuilding('depot', 0, 40, 40);
    const a1 = addBuilding('depot', 0, 49, 40);
    const b1 = addBuilding('depot', 1, 38, 38);
    const snap = () =>
      JSON.stringify({
        linked: [a1, a2, b1, b2].map(b => b.linked),
        links: G.links.map(l => [l.key, l.blocked]),
        own: Array.from(G.own),
      });
    recomputeNetwork();
    const first = snap();
    for (let i = 0; i < 6; i++) {
      recomputeNetwork();
      expect(snap()).toBe(first);
    }
    // both far posts are cut off, neither kingdom gets them through the other's land
    expect(a1.linked && b1.linked).toBe(true);
    expect(a2.linked).toBe(false);
    expect(b2.linked).toBe(false);
  });

  it('the road is checked along the route the map draws: around a mountain, not over it', () => {
    const { h0 } = emptyField();
    place(h0, 20, 40);
    // a ridge across the straight line
    for (let y = 36; y <= 44; y++)
      terrainMap[y * MAP_W + 24] = Terrain.Mountain;
    const route = roadRoute(terrainMap, [20.5, 40.5], [28.5, 40.5]);
    expect(route.length).toBeGreaterThan(2);
    const tiles = roadTiles(terrainMap, 20, 40, 28, 40);
    // never over the ridge, and it goes round one of its ends
    for (const k of tiles) expect(terrainMap[k]).not.toBe(Terrain.Mountain);
    expect(
      [...tiles].some(
        k => Math.floor(k / MAP_W) < 36 || Math.floor(k / MAP_W) > 44,
      ),
    ).toBe(true);
  });
});
