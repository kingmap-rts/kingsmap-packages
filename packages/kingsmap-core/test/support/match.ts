// Runs one headless bot-vs-bot match and returns a compact summary.
import type { BotParams } from '@kingmap-rts/kingsmap-types';
import { createGame, rules } from '../../src/index';

export interface MatchSpec {
  seed: number;
  maxT: number;
  diff?: 0 | 1 | 2;
  botParams?: Record<number, Partial<BotParams>>;
  tag?: string;
  crystal?: number;
}

export async function runMatch(spec: MatchSpec) {
  rules.TUNE.crystal = spec.crystal ?? 1;
  const game = createGame({
    seed: spec.seed,
    diff: spec.diff ?? 1,
    headless: true,
    humans: {},
    botParams: spec.botParams,
  });
  const G = game.world;
  const players = () => G.players;
  // humans:{} makes every seat a bot; equalize difficulty multipliers like the prototype harness did
  for (const p of G.players) {
    p.mult = 1;
    p.ai.cap = 1;
  }
  const shares: number[][] = [];
  let nextMinute = 60;
  let nextSample = 30;
  const idle = new Array(10).fill(0);
  const armySamples = new Array(10).fill(0);
  let t30: number | null = null;
  let t40: number | null = null;
  const t0 = performance.now();
  let steps = 0;
  while (!G.over && G.t < spec.maxT) {
    game.step();
    // yield to the event loop now and then: one match takes over a minute on a slow CI runner,
    // and a blocked worker misses the test runner's RPC deadline
    if (++steps % 250 === 0) await new Promise(r => setImmediate(r));
    if (G.t >= nextMinute) {
      const row = players().map(p =>
        p.alive ? Math.round(p.land * 1000) / 10 : 0,
      );
      shares.push(row);
      const mx = Math.max(...row);
      if (t30 == null && mx >= 30) t30 = Math.round(G.t / 60);
      if (t40 == null && mx >= 40) t40 = Math.round(G.t / 60);
      nextMinute += 60;
    }
    if (G.t >= nextSample) {
      for (const u of G.units)
        if (!u.dead && (u.type === 'inf' || u.type === 'siege')) {
          armySamples[u.owner]++;
          if (
            !u.tgt &&
            (!u.path || !u.path.length) &&
            !(u.job && u.jobUntil > G.t)
          )
            idle[u.owner]++;
        }
      nextSample += 30;
    }
  }
  const r = game.result();
  const ps = players();
  const order = [...ps].sort((a, b) => {
    if (r.winner === a.id) return -1;
    if (r.winner === b.id) return 1;
    if (a.alive && b.alive) return b.land - a.land;
    if (a.alive) return -1;
    if (b.alive) return 1;
    return (b.stats.elimAt as number) - (a.stats.elimAt as number);
  });
  const events: Record<string, number> = {};
  for (const e of G.events) events[e.type] = (events[e.type] || 0) + 1;
  return {
    tag: spec.tag,
    seed: spec.seed,
    t: Math.round(G.t),
    ms: Math.round(performance.now() - t0),
    hash: game.hash(),
    nAlive: ps.filter(p => p.alive).length,
    winner: r.winner,
    reason: r.reason,
    shares,
    events,
    t30,
    t40,
    res: ps.map(p => {
      const units: Record<string, number> = {};
      for (const u of G.units)
        if (u.owner === p.id) units[u.type] = (units[u.type] || 0) + 1;
      return {
        id: p.id,
        doc: (p as any).doc,
        perks: (p as any).perks,
        crystalLeft: Math.round((p as any).res.crystal),
        rank: order.indexOf(p) + 1,
        alive: p.alive,
        land: p.land,
        units,
        stats: p.stats,
        P: (p as any).ai.P,
        idleShare: armySamples[p.id] ? idle[p.id] / armySamples[p.id] : null,
      };
    }),
  };
}
