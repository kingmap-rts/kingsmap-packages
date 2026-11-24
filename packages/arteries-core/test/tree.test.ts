import { describe, expect, it } from 'vitest';
import { createGame, rules } from '../src/index';

const start = () => {
  const game = createGame({ seed: 11, headless: true, humans: { 0: 'me' } });
  const p = game.world.players[0];
  p.res.crystal = 200;
  return { game, p };
};

describe('skill tree', () => {
  it('every node but the roots needs a node above it in its branch', () => {
    for (const id of rules.PERK_IDS) {
      const n = rules.PERKS[id];
      if (n.tier === 1) expect(n.req).toBeUndefined();
      else
        for (const r of n.req!) {
          expect(rules.PERKS[r].branch).toBe(n.branch);
          expect(rules.PERKS[r].tier).toBe(n.tier - 1);
        }
    }
  });

  it('nodes open in order and cost more with every node taken', () => {
    const { game, p } = start();
    expect(game.apply(0, { t: 'perk', id: 'carav' })?.key).toBe(
      'error.perkLocked',
    );
    const m0 = p.res.crystal;
    expect(game.apply(0, { t: 'perk', id: 'harvest' })).toBeNull();
    expect(p.res.crystal).toBe(m0 - rules.nodeCost(0));
    expect(p.doc).toBeNull();
    expect(game.apply(0, { t: 'perk', id: 'longroads' })).toBeNull();
    expect(p.res.crystal).toBe(m0 - rules.nodeCost(0) - rules.nodeCost(1));
    // the first node of a path names the realm's path
    expect(p.doc).toBe('guild');
    expect(game.apply(0, { t: 'perk', id: 'longroads' })?.key).toBe(
      'error.perkTaken',
    );
    expect(game.apply(0, { t: 'perk', id: 'carav' })).toBeNull();
    expect(game.apply(0, { t: 'perk', id: 'cheap' })).toBeNull();
  });

  it("a path's unit is hired only after its node", () => {
    const { game, p } = start();
    p.res.wood = p.res.steel = p.res.food = 500;
    game.apply(0, { t: 'perk', id: 'longroads' });
    game.apply(0, { t: 'perk', id: 'carav' });
    expect(game.apply(0, { t: 'train', type: 'builder' })?.key).toBe(
      'error.otherPath',
    );
    expect(game.apply(0, { t: 'perk', id: 'wrights' })).toBeNull();
    expect(game.apply(0, { t: 'train', type: 'builder' })).toBeNull();
  });

  it('a realm takes only one ability, from any branch', () => {
    const { game, p } = start();
    for (const id of ['claim', 'bread', 'levies', 'labor', 'pitch'] as const)
      expect(game.apply(0, { t: 'perk', id })).toBeNull();
    expect(rules.ultimateOf(p)).toBe('pitch');
    expect(game.apply(0, { t: 'perk', id: 'charter' })?.key).toBe(
      'error.oneAbility',
    );
    // other branches stay open, the old intent takes a path's root
    expect(game.apply(0, { t: 'doctrine', d: 'forge' })).toBeNull();
    expect(p.perks).toContain('bellows');
    expect(p.doc).toBe('land');
  });

  it('refuses a node it cannot pay for', () => {
    const { game, p } = start();
    p.res.crystal = 1;
    expect(game.apply(0, { t: 'perk', id: 'harvest' })?.key).toBe(
      'error.needMana',
    );
  });
});
