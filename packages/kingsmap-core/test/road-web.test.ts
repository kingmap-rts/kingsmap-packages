// KAN-54: no road a–b while a post of the realm stands between them (the Gabriel rule);
// KAN-56: the roads a new post would get and take away, by the same rule.
import { describe, expect, it } from 'vitest';
import { createGame, rules, type Game } from '../src/index';
import type { Building } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { addBuilding } from '../src/sim/world/entities';
import {
  newPostRoads,
  recomputeNetwork,
  roadPairs,
  roadPreview,
  type RoadPost,
} from '../src/sim/systems/network';
import { roadRoute } from '../src/sim/systems/roads';
import { terrainMap } from '../src/sim/state';

const { ROAD_LEN } = rules;

/** a game with only the castles of seats 0 and 1, on open plain, no units */
function emptyField(): { game: Game; h0: Building; h1: Building } {
  const game = createGame({ seed: 11, headless: true, humans: { 0: 'me' } });
  const G = game.world;
  for (const b of G.buildings)
    if (b.type !== 'hq' || b.owner > 1) b.dead = true;
  for (const u of G.units) u.dead = true;
  for (let k = 0; k < terrainMap.length; k++) terrainMap[k] = Terrain.Plain;
  const h0 = G.players[0].hq;
  const h1 = G.players[1].hq;
  h0.x = 20;
  h0.y = 40;
  h1.x = 100;
  h1.y = 10;
  return { game, h0, h1 };
}

const linkOf = (game: Game, a: Building, b: Building) =>
  game.world.links.find(
    l => (l.a === a && l.b === b) || (l.a === b && l.b === a),
  );

/** the castle at (20,40), a fort at (26,40), a post at (30,42), a forge at (34,40) */
function fortPostForge() {
  const { game, h0, h1 } = emptyField();
  const fort = addBuilding('depot', 0, 26, 40);
  fort.spec = 'fort';
  const post = addBuilding('depot', 0, 30, 42);
  const forge = addBuilding('depot', 0, 34, 40);
  forge.spec = 'forge';
  recomputeNetwork();
  return { game, h0, h1, fort, post, forge };
}

/** a few hundred posts in clusters, from a fixed little generator (no game rng involved) */
function scatter(seed: number, n: number): RoadPost[] {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const out: RoadPost[] = [];
  while (out.length < n) {
    const x = Math.floor(next() * 40);
    const y = Math.floor(next() * 30);
    if (out.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < 9)) continue;
    out.push({ id: out.length + 1, x, y });
  }
  return out;
}

/** the groups of posts joined by the given pairs (labels per post) */
function groups(n: number, pairs: [number, number][]): number[] {
  const lab = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number =>
    lab[i] === i ? i : (lab[i] = find(lab[i]));
  for (const [i, j] of pairs) lab[find(i)] = find(j);
  return lab.map((_, i) => find(i));
}

const cross = (a: RoadPost, b: RoadPost, c: RoadPost, d: RoadPost) => {
  if ([a, b].some(p => p === c || p === d)) return false;
  const o = (p: RoadPost, q: RoadPost, r: RoadPost) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

describe('the road web (KAN-54)', () => {
  it('no straight road from the fort to the forge past the post between them: the way runs through the post', () => {
    const { game, h0, fort, post, forge } = fortPostForge();
    expect(linkOf(game, fort, forge)).toBeUndefined();
    expect(linkOf(game, fort, post)).toBeDefined();
    expect(linkOf(game, post, forge)).toBeDefined();
    expect(linkOf(game, h0, fort)).toBeDefined();
    expect(forge.linked).toBe(true);
  });

  it('when the post between them is taken, the straight road comes back (and the new land may cut it)', () => {
    const { game, fort, post, forge } = fortPostForge();
    post.owner = 1;
    recomputeNetwork();
    const l = linkOf(game, fort, forge);
    expect(l).toBeDefined();
    expect(l!.owner).toBe(0);
    // the post is gone altogether: the road is back and open
    post.dead = true;
    recomputeNetwork();
    expect(linkOf(game, fort, forge)?.blocked).toBe(false);
    expect(forge.linked).toBe(true);
  });

  it('never cuts off a post a road could reach, and the roads never cross', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const posts = scatter(seed, 60);
      const all: [number, number][] = [];
      for (let i = 0; i < posts.length; i++)
        for (let j = i + 1; j < posts.length; j++)
          if (
            (posts[i].x - posts[j].x) ** 2 + (posts[i].y - posts[j].y) ** 2 <=
            ROAD_LEN * ROAD_LEN
          )
            all.push([i, j]);
      const web = roadPairs(posts, ROAD_LEN);
      expect(web.length).toBeLessThan(all.length);
      const g0 = groups(posts.length, all);
      const g1 = groups(posts.length, web);
      for (let i = 0; i < posts.length; i++)
        for (let j = i + 1; j < posts.length; j++)
          expect(g1[i] === g1[j]).toBe(g0[i] === g0[j]);
      for (let a = 0; a < web.length; a++)
        for (let b = a + 1; b < web.length; b++) {
          const [i, j] = web[a];
          const [k, l] = web[b];
          expect(cross(posts[i], posts[j], posts[k], posts[l])).toBe(false);
        }
    }
  });

  it('four posts on one circle keep the sides, never both crossing diagonals', () => {
    const posts: RoadPost[] = [
      { id: 1, x: 48, y: 61 },
      { id: 2, x: 56, y: 61 },
      { id: 3, x: 52, y: 57 },
      { id: 4, x: 52, y: 65 },
    ];
    const web = roadPairs(posts, ROAD_LEN);
    expect(web).toEqual([
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
    ]);
  });

  it('is a pure function of the posts: the same roads in any order of the posts', () => {
    const posts = scatter(7, 40);
    const ids = (ps: RoadPost[]) =>
      roadPairs(ps, ROAD_LEN)
        .map(([i, j]) => [ps[i].id, ps[j].id].sort((a, b) => a - b).join('-'))
        .sort();
    const once = ids(posts);
    expect(ids(posts)).toEqual(once);
    expect(ids([...posts].reverse())).toEqual(once);
    const shuffled = [...posts].sort(
      (a, b) => ((a.id * 37) % 41) - ((b.id * 37) % 41),
    );
    expect(ids(shuffled)).toEqual(once);
  });

  it('newPostRoads gives the roads roadPairs would give the new post', () => {
    const posts = scatter(9, 50);
    for (const [x, y] of [
      [10, 10],
      [20, 15],
      [33, 4],
      [5, 25],
    ]) {
      const n = posts.length;
      const all = roadPairs([...posts, { id: -1, x, y }], ROAD_LEN)
        .filter(([, j]) => j === n)
        .map(([i]) => i);
      expect(newPostRoads(posts, x, y, ROAD_LEN)).toEqual(all);
    }
  });
});

describe('the road preview (KAN-56)', () => {
  it('shows the roads a post between two others gets and the straight road it takes away, changing nothing', () => {
    const { game, h0 } = emptyField();
    const fort = addBuilding('depot', 0, 26, 40);
    const forge = addBuilding('depot', 0, 34, 40);
    recomputeNetwork();
    expect(linkOf(game, fort, forge)).toBeDefined();
    const G = game.world;
    const links = G.links.length;
    const buildings = G.buildings.length;
    const res = { ...G.players[0].res };
    const pv = game.roadPreview(0, 30, 42)!;
    expect(pv).not.toBeNull();
    expect(pv.add.map(r => r.b).sort((a, b) => a - b)).toEqual(
      [fort.id, forge.id].sort((a, b) => a - b),
    );
    for (const r of pv.add) {
      expect(r.a).toBe(-1);
      expect(r.cut).toBe(-1);
      const b = G.buildings.find(x => x.id === r.b)!;
      expect(r.route).toEqual(
        roadRoute(terrainMap, [30.5, 42.5], [b.x + 0.5, b.y + 0.5]),
      );
    }
    expect(pv.drop).toHaveLength(1);
    expect([pv.drop[0].a, pv.drop[0].b].sort()).toEqual(
      [fort.id, forge.id].sort(),
    );
    // the castle–fort road stays
    expect(pv.drop.some(d => d.a === h0.id || d.b === h0.id)).toBe(false);
    expect(G.links.length).toBe(links);
    expect(G.buildings.length).toBe(buildings);
    expect(G.players[0].res).toEqual(res);
  });

  it('is null where the post may not stand', () => {
    const { game } = emptyField();
    expect(game.roadPreview(0, 21, 40)).toBeNull(); // too close to the castle
    expect(game.roadPreview(0, 60, 40)).toBeNull(); // too far from any post
    expect(game.roadPreview(0, 27, 40)).not.toBeNull();
  });

  it('marks a road that would run through hostile land (cut at once, KAN-43)', () => {
    // the wedge of road-land.test: seat 1's post at (32,44) holds the land between (28,40) and (37,40)
    const { game, h1 } = emptyField();
    h1.x = 32;
    h1.y = 51;
    addBuilding('depot', 1, 32, 44);
    const a1 = addBuilding('depot', 0, 28, 40);
    recomputeNetwork();
    const pv = roadPreview(game.world.players[0], 37, 40);
    const r = pv.add.find(x => x.b === a1.id);
    expect(r?.cut).toBe(1);
  });
});
