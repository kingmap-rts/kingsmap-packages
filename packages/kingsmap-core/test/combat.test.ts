import { describe, expect, it } from 'vitest';
import { createGame } from '../src/index';
import type { Unit } from '../src/sim/world/types';
import { addUnit } from '../src/sim/world/entities';
import { walkable } from '../src/sim/world/terrain';

function openBox(w: number, h: number): [number, number] {
  for (let y = 5; y < 75 - h; y++)
    for (let x = 5; x < 115 - w; x++) {
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++)
        for (let dx = 0; dx < w && ok; dx++) ok = walkable(x + dx, y + dy);
      if (ok) return [x, y];
    }
  throw new Error('no open box');
}

/**
 * Squads of 5 of seat 0 packed in a blob, foes of seat 1 standing still; nobody dies.
 * Returns how many times each of our squads struck in 30 seconds.
 */
function battle(
  ours: number,
  foes: number,
  how: 'attack' | 'amove',
  gap = 1.1,
) {
  const game = createGame({
    seed: 3,
    headless: true,
    humans: { 0: 'a', 1: 'b' },
  });
  const G = game.world;
  for (const p of G.players) if (p.id > 1) p.alive = false;
  const [bx, by] = openBox(16, 14);
  const squad = (owner: number, x: number, y: number) => {
    const u = addUnit('inf', owner, x, y);
    u.n = 5;
    u.maxhp = u.hp = 5 * u.mhp;
    u.solo = true;
    return u;
  };
  const mine: Unit[] = [];
  const them: Unit[] = [];
  for (let i = 0; i < ours; i++)
    mine.push(squad(0, bx + 2 + (i % 3) * 1.1, by + 4 + ((i / 3) | 0) * 1.1));
  for (let i = 0; i < foes; i++) {
    const t = squad(1, bx + 10, by + 4.5 + i * gap);
    // flank and charge blows of several squads can fell a squad within one tick: make them unbreakable
    t.maxhp = t.hp = 1e6;
    them.push(t);
  }
  const ids = mine.map(u => u.id);
  if (how === 'attack') game.apply(0, { t: 'attack', ids, target: them[0].id });
  else
    game.apply(0, {
      t: 'move',
      ids,
      x: them[0].x | 0,
      y: them[0].y | 0,
      mode: 'amove',
    });
  const hits = new Map<number, number>();
  for (let i = 0; i < 300; i++) {
    const cd = mine.map(u => u.cd);
    for (const u of [...mine, ...them]) {
      u.supplied = true;
      u.ammo = 99;
      u.hp = u.maxhp;
    }
    game.step();
    mine.forEach((u, k) => {
      if (u.cd > cd[k] + 0.05) hits.set(u.id, (hits.get(u.id) ?? 0) + 1);
    });
  }
  return { hits: mine.map(u => hits.get(u.id) ?? 0), mine, them };
}

describe('combat', () => {
  it('squads ordered onto one foe walk around their own troops and all strike', () => {
    // 6 squads on one foe used to leave two of them pressing on the backs of the others
    const { hits } = battle(6, 2, 'attack');
    for (const h of hits) expect(h).toBeGreaterThan(5);
  });

  it('attack-moving squads take the open sides of each foe, the rest wait close behind', () => {
    // 10 squads on 2 foes standing side by side: a foe has a front, two flanks and a rear, one squad
    // on each, but the flank toward its neighbour is the neighbour's place
    const { hits, mine, them } = battle(10, 2, 'amove');
    expect(hits.filter(h => h > 10).length).toBeGreaterThanOrEqual(6);
    for (const t of them) {
      const on = mine.filter(u => u.tgt === t.id && u.slot >= 0);
      expect(new Set(on.map(u => u.slot)).size).toBeGreaterThanOrEqual(3);
    }
    // the ones left over stand ready next to the fight, not stuck far behind their own troops
    for (const u of mine) {
      const d = Math.min(...them.map(t => Math.hypot(t.x - u.x, t.y - u.y)));
      expect(d).toBeLessThan(2.6);
    }
  });

  it('attack-moving squads spread over the foes instead of queueing for the nearest', () => {
    const { mine, them } = battle(10, 4, 'amove', 2);
    // (one may strike a building of the foe's nearby instead)
    const on = mine.map(u => u.tgt).filter(id => them.some(t => t.id === id));
    expect(new Set(on).size).toBe(4);
  });
});
