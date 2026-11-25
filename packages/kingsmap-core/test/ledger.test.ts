import { describe, expect, it } from 'vitest';
import type { Resource, ResourceFlow } from '@kingmap-rts/kingsmap-types';
import { createGame, rules } from '../src/index';

const sum = (o: Partial<Record<string, number>>) =>
  Object.values(o).reduce<number>((a, v) => a + (v ?? 0), 0);
const net = (f: ResourceFlow) => sum(f.in) - sum(f.out);

/** a bot match with a "human" seat 0 that hires, trades and gifts on fixed ticks */
function play(seed: number, ticks: number, headless: boolean) {
  const game = createGame({ seed, headless, humans: { 0: 'tester' } });
  const G = game.world;
  /** [time, stock of every seat and resource] after every tick */
  const hist: [number, number[][]][] = [];
  for (let i = 1; i <= ticks; i++) {
    if (i % 50 === 0)
      game.apply(0, { t: 'train', type: i % 100 === 0 ? 'raid' : 'inf' });
    if (i % 300 === 0) game.apply(0, { t: 'trade', from: 'wood', to: 'food' });
    game.step();
    hist.push([G.t, G.players.map(p => rules.RESOURCES.map(k => p.res[k]))]);
  }
  return { game, hist };
}

describe('resource ledger', () => {
  const { game, hist } = play(4242, 3000, false);
  const G = game.world;

  it('sources minus sinks equal the change of every stock over the window', () => {
    const now = Math.floor(G.t);
    // the stock before the first tick the window holds
    const start = hist.filter(([t]) => Math.floor(t) < now - 59).pop()![1];
    const end = hist[hist.length - 1][1];
    for (const p of G.players) {
      const L = game.ledger(p.id);
      expect(L.window).toBeGreaterThan(59);
      expect(L.window).toBeLessThanOrEqual(60);
      rules.RESOURCES.forEach((k: Resource, r) => {
        const want = end[p.id][r] - start[p.id][r];
        expect(net(L.res[k])).toBeCloseTo(want, 6);
      });
    }
  });

  it('books (almost) everything to a named source or sink', () => {
    for (const p of G.players) {
      const L = game.ledger(p.id);
      for (const k of rules.RESOURCES) {
        expect(L.res[k].in.other ?? 0).toBeLessThan(1e-6);
        expect(L.res[k].out.other ?? 0).toBeLessThan(1e-6);
      }
    }
  });

  it('names the expected flows of the castle', () => {
    const L = game.ledger(0);
    expect(L.res.wood.in.castle).toBeCloseTo(0.25 * L.window, 1);
    expect(L.res.food.out.people).toBeGreaterThan(0);
    expect(L.res.food.out.army).toBeGreaterThan(0);
  });

  it('does not change the simulation (same hash as a headless match without a ledger)', () => {
    const h = play(4242, 3000, true).game;
    expect(h.hash()).toBe(game.hash());
    const L = h.ledger(0);
    for (const k of rules.RESOURCES) expect(net(L.res[k])).toBe(0);
  });

  it('starts with a short window early in the match', () => {
    const g = createGame({ seed: 7, humans: { 0: '' } });
    for (let i = 0; i < 100; i++) g.step();
    const L = g.ledger(0);
    expect(L.window).toBeCloseTo(g.time, 6);
    expect(L.res.wood.in.castle).toBeCloseTo(0.25 * g.time, 6);
  });
});
