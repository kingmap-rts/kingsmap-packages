import { describe, expect, it } from 'vitest';
import { createGame, rules } from '../src/index';

// two humans so bots do not take part in the diplomacy under test
const start = (seed = 11) =>
  createGame({ seed, headless: true, humans: { 0: 'a', 1: 'b' } });
type G = ReturnType<typeof start>;
const ally = (game: G) => {
  expect(game.apply(0, { t: 'ally', to: 1 })).toBeNull();
  expect(game.apply(1, { t: 'ally', to: 0 })).toBeNull();
};

describe('alliances', () => {
  it('an offer becomes a pact only when the other side accepts', () => {
    const game = start();
    game.apply(0, { t: 'ally', to: 1 });
    expect(game.allied(0, 1)).toBe(false);
    expect(game.world.reqs.length).toBe(1);
    game.apply(1, { t: 'ally', to: 0 });
    expect(game.allied(0, 1)).toBe(true);
    expect(game.allied(1, 0)).toBe(true);
    expect(game.hostile(0, 2)).toBe(true);
  });

  it('allies never pick each other as targets', () => {
    const game = start();
    ally(game);
    const mine = game.world.units.find(u => u.owner === 0)!;
    const theirs = game.world.units.find(u => u.owner === 1)!;
    theirs.x = mine.x + 0.8;
    theirs.y = mine.y;
    for (let i = 0; i < 20; i++) game.step();
    expect(mine.tgt === theirs.id || theirs.tgt === mine.id).toBe(false);
    expect(
      game.apply(0, { t: 'attack', ids: [mine.id], target: theirs.id }),
    ).toEqual({ key: 'error.ally' });
  });

  it('the pact ends after 8 minutes unless both renew', () => {
    const game = start();
    const G = game.world;
    ally(game);
    const x = game.pact(0, 1)!;
    game.apply(0, { t: 'renew', to: 1 });
    expect(x.until).toBeCloseTo(G.t + rules.PACT_TIME, 0);
    const until0 = x.until;
    G.t += 100;
    game.apply(0, { t: 'renew', to: 1 });
    game.apply(1, { t: 'renew', to: 0 });
    expect(x.until).toBeGreaterThan(until0);
    G.t = x.until + 1;
    game.step();
    expect(game.allied(0, 1)).toBe(false);
    expect(G.pacts.length).toBe(0);
  });

  it('breaking a pact makes you a traitor for 2 minutes', () => {
    const game = start();
    const G = game.world;
    ally(game);
    expect(game.apply(0, { t: 'unally', to: 1 })).toBeNull();
    expect(game.allied(0, 1)).toBe(false);
    expect(G.players[0].traitorUntil).toBeCloseTo(G.t + rules.TRAITOR_TIME, 0);
    expect(game.apply(0, { t: 'ally', to: 2 })?.key).toBe('error.traitor');
    expect(G.players[0].stats.betrayals).toBe(1);
  });

  it('a gift caravan travels to the ally castle and pays out there', () => {
    const game = start();
    const G = game.world;
    ally(game);
    const p = G.players[0];
    const q = G.players[1];
    const w0 = p.res.wood;
    expect(game.apply(0, { t: 'gift', to: 1, res: 'wood' })).toBeNull();
    expect(p.res.wood).toBeCloseTo(w0 - rules.GIFT_AMOUNT.wood);
    const c = G.convoys.find(c => c.giftTo === 1)!;
    expect(c).toBeTruthy();
    const before = q.res.wood;
    for (let i = 0; i < 3000 && !c.dead; i++) game.step();
    expect(c.dead).toBe(true);
    expect(q.stats.giftsGot).toBe(rules.GIFT_AMOUNT.wood);
    expect(q.res.wood).toBeGreaterThan(before);
    expect(game.apply(0, { t: 'gift', to: 2, res: 'wood' })).toEqual({
      key: 'error.giftsAlliesOnly',
    });
  });

  it('a gift of crystals counts in giftsGot', () => {
    const game = start();
    const G = game.world;
    ally(game);
    const p = G.players[0];
    const q = G.players[1];
    p.res.crystal = rules.GIFT_AMOUNT.crystal;
    const before = q.res.crystal;
    expect(game.apply(0, { t: 'gift', to: 1, res: 'crystal' })).toBeNull();
    const c = G.convoys.find(c => c.giftTo === 1)!;
    for (let i = 0; i < 3000 && !c.dead; i++) game.step();
    expect(c.dead).toBe(true);
    expect(q.stats.giftsGot).toBe(rules.GIFT_AMOUNT.crystal);
    expect(p.stats.giftsSent).toBe(q.stats.giftsGot);
    expect(q.res.crystal).toBeGreaterThanOrEqual(
      before + rules.GIFT_AMOUNT.crystal,
    );
  });

  it('pings are kept for a few seconds', () => {
    const game = start();
    expect(game.apply(0, { t: 'ping', x: 10, y: 10, k: 'attack' })).toBeNull();
    expect(game.world.pings.length).toBe(1);
    for (let i = 0; i < 100; i++) game.step();
    expect(game.world.pings.length).toBe(0);
  });

  it('allied land feeds your troops', () => {
    const game = start();
    const G = game.world;
    ally(game);
    const q = G.players[1];
    const mine = G.units.find(u => u.owner === 0)!;
    mine.x = q.hq.x + 1.5;
    mine.y = q.hq.y + 1.5;
    mine.path = null;
    mine.dest = null;
    G.netT = 0;
    for (let i = 0; i < 6; i++) game.step();
    expect(mine.supplied).toBe(true);
  });

  it('a messenger delivers a short message and bots answer', () => {
    const game = createGame({ seed: 11, headless: false, humans: { 0: 'a' } });
    game.drainNotices();
    expect(game.apply(0, { t: 'say', to: 3, k: 'hi' })).toBeNull();
    const notes = game.drainNotices();
    expect(notes).toContainEqual([
      3,
      { key: 'notice.say', params: { player: 0, say: 'hi' } },
    ]);
    expect(notes).toContainEqual([
      0,
      { key: 'notice.replyLikewise', params: { player: 3 } },
    ]);
    expect(game.apply(0, { t: 'say', to: 3, k: 'hi' })).toEqual({
      key: 'error.messengerBusy',
    });
  });
});

describe('market', () => {
  it('trades 30 for 10 at the castle and refuses bad trades', () => {
    const game = createGame({
      seed: 7,
      diff: 1,
      humans: { 0: 'A' },
      headless: true,
    });
    const p = game.world.players[0];
    p.res.wood = 100;
    p.res.steel = 5;
    expect(game.apply(0, { t: 'trade', from: 'wood', to: 'steel' })).toBeNull();
    expect(p.res.wood).toBe(70);
    expect(p.res.steel).toBe(15);
    p.res.ore = 10;
    expect(game.apply(0, { t: 'trade', from: 'ore', to: 'food' })).toEqual({
      key: 'error.tradeNeeds',
      params: { amount: rules.MARKET_GIVE },
    });
    expect(game.apply(0, { t: 'trade', from: 'wood', to: 'wood' })).toEqual({
      key: 'error.badTrade',
    });
  });
});
