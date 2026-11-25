// KAN-55: a caravan drives its road as the road runs (around the mountains) at a steady pace, so a
// road winding around a mountain takes longer; it used to drive the straight line between the
// posts (through the mountain) while the map showed it racing along the detour.
import { describe, expect, it } from 'vitest';
import { Lockstep } from '@kingmap-rts/kingsmap-types';
import { createGame, rules, type Game } from '../src/index';
import type { Building, Convoy } from '../src/sim/world/types';
import { Terrain } from '../src/sim/config/map';
import { CONVOY_SPEED } from '../src/sim/config/economy';
import { addBuilding } from '../src/sim/world/entities';
import { recomputeNetwork } from '../src/sim/systems/network';
import { sendCaravan } from '../src/sim/systems/logistics';
import {
  routeLeft,
  routeLength,
  stepAlong,
} from '../src/sim/systems/roadTravel';
import { roadRoute, type RoadPt } from '../src/sim/systems/roads';
import { segmentDist } from '../src/sim/util/geometry';
import { terrainMap } from '../src/sim/state';

const { MAP_W } = rules;

/** seat 0's castle at (20, 40) and a post at (27, 40), a mountain wall between them (x 23–24) */
function wall(): { game: Game; h0: Building; post: Building } {
  const game = createGame({ seed: 11, headless: true, humans: { 0: 'me' } });
  const G = game.world;
  for (const b of G.buildings)
    if (b.type !== 'hq' || b.owner > 0) b.dead = true;
  for (const u of G.units) u.dead = true;
  for (let k = 0; k < terrainMap.length; k++) terrainMap[k] = Terrain.Plain;
  for (let y = 34; y <= 46; y++)
    for (let x = 23; x <= 24; x++) terrainMap[y * MAP_W + x] = Terrain.Mountain;
  const h0 = G.players[0].hq;
  h0.x = 20;
  h0.y = 40;
  const post = addBuilding('depot', 0, 27, 40);
  recomputeNetwork();
  return { game, h0, post };
}

/** the distance from a point to a route */
const offRoute = (pts: RoadPt[], x: number, y: number) => {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++)
    d = Math.min(
      d,
      segmentDist(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]),
    );
  return d;
};

describe('a caravan on a road around a mountain', () => {
  it('drives the whole route at its steady pace, never through the mountain', () => {
    const { game, h0, post } = wall();
    const G = game.world;
    expect(post.linked).toBe(true);
    const route = roadRoute(
      terrainMap,
      [post.x + 0.5, post.y + 0.5],
      [h0.x + 0.5, h0.y + 0.5],
    );
    const chord = 7;
    const len = routeLength(route);
    // the road really winds: well over the straight line between the posts
    expect(len).toBeGreaterThan(chord * 1.5);
    post.stock.wood = 60;
    post.idle = 9;
    sendCaravan(post);
    const c = G.convoys.find(k => !k.dead) as Convoy;
    expect(c.to).toBe(h0.id);
    expect(c.L0).toBeCloseTo(len, 6);
    // the drawn road, from the end the caravan left
    const link = G.links.find(l => l.key === c.key)!;
    const drawn = roadRoute(
      terrainMap,
      [link.a.x + 0.5, link.a.y + 0.5],
      [link.b.x + 0.5, link.b.y + 0.5],
    );
    let t = 0;
    while (!c.dead && t < 60) {
      game.step();
      t += Lockstep.TickSeconds;
      if (c.dead) break;
      expect(offRoute(drawn, c.x, c.y)).toBeLessThan(1e-6);
      expect(terrainMap[(c.y | 0) * MAP_W + (c.x | 0)]).not.toBe(
        Terrain.Mountain,
      );
    }
    expect(c.dead).toBe(true);
    // the time is the route's length at the caravan's pace (not the straight line's)
    const T = len / CONVOY_SPEED;
    expect(t).toBeGreaterThan(T - 2 * Lockstep.TickSeconds);
    expect(t).toBeLessThan(T + 2 * Lockstep.TickSeconds);
    expect(t).toBeGreaterThan((chord / CONVOY_SPEED) * 1.5);
  });
});

describe('stepAlong / routeLeft', () => {
  const pts: RoadPt[] = [
    [0, 0],
    [4, 0],
    [4, 3],
  ];

  it('walks around the corners', () => {
    expect(stepAlong(pts, 0, 0, 1)).toEqual([1, 0]);
    expect(stepAlong(pts, 3, 0, 2)).toEqual([4, 1]);
    expect(stepAlong(pts, 4, 0, 1)).toEqual([4, 1]);
    expect(stepAlong(pts, 4, 2, 1)).toBeNull();
  });

  it('what is left of the route from a point on it', () => {
    expect(routeLength(pts)).toBe(7);
    expect(routeLeft(pts, 0, 0)).toBe(7);
    expect(routeLeft(pts, 4, 1)).toBe(2);
    expect(routeLeft(pts, 4, 3)).toBe(0);
  });
});
