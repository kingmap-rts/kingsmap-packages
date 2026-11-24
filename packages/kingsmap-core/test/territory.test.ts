import { describe, expect, it } from 'vitest';
import { createGame, rules } from '../src/index';
import { computeTerritory } from '../src/sim/systems/network';
import { addBuilding } from '../src/sim/world/entities';

const { MAP_W } = rules;

describe('territory', () => {
  it('a new post never takes land that already belongs to another kingdom', () => {
    const game = createGame({ seed: 5, headless: true, humans: { 0: 'me' } });
    const G = game.world;
    const h1 = G.players[1].hq;
    const ownBy = (o: number) => {
      const s = new Set<number>();
      G.own.forEach((v, k) => {
        if (v === o) s.add(k);
      });
      return s;
    };
    const before = ownBy(1);
    // an enemy post right next to kingdom 1's castle, already in the network
    const b = addBuilding('depot', 0, h1.x + 9, h1.y);
    b.linked = true;
    computeTerritory();
    const after = ownBy(1);
    for (const k of before)
      expect(
        after.has(k),
        `tile ${k % MAP_W},${Math.floor(k / MAP_W)} stayed with its owner`,
      ).toBe(true);
    // the new post still gets the free land around it
    expect(
      [...ownBy(0)].some(
        k =>
          Math.abs((k % MAP_W) - (h1.x + 12)) < 2 &&
          Math.abs(Math.floor(k / MAP_W) - h1.y) < 2,
      ),
    ).toBe(true);
  });

  it('the older post keeps its land when the newer one is the neighbour', () => {
    const game = createGame({ seed: 8, headless: true, humans: { 0: 'me' } });
    const G = game.world;
    const h = G.players[2].hq;
    const a = addBuilding('depot', 3, h.x + 20, h.y);
    a.linked = true;
    computeTerritory();
    const mid = h.x + 16;
    const o1 = G.own[h.y * MAP_W + mid];
    const b = addBuilding('depot', 4, h.x + 14, h.y);
    b.linked = true;
    computeTerritory();
    expect(G.own[h.y * MAP_W + mid]).toBe(o1);
  });
});
