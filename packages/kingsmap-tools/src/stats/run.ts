// Re-simulate a match statistics file with the core and collect stats along the way.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createGame } from '@kingmap-rts/kingsmap-core';
import type { MatchStats } from '@kingmap-rts/kingsmap-types';

export function loadStats(file: string): MatchStats {
  const buf = readFileSync(file);
  return JSON.parse(
    (file.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8'),
  );
}

export interface MinuteRow {
  minute: number;
  seat: number;
  human: boolean;
  alive: boolean;
  land: number;
  army: number;
  inf: number;
  raid: number;
  siege: number;
  wagon: number;
  depots: number;
  pop: number;
  eff: number;
  wood: number;
  ore: number;
  steel: number;
  food: number;
}
export interface StatsRun {
  /** every stored hash matched */
  ok: boolean;
  checked: number;
  mismatchAt: number | null;
  minutes: MinuteRow[];
  intents: { seat: number; tick: number; t: string }[];
  players: {
    seat: number;
    name: string;
    human: boolean;
    alive: boolean;
    land: number;
    stats: Record<string, unknown>;
  }[];
  result: { winner: number | null; reason: string | null; t: number };
}

/** Same loop as the client: apply turn n's intents, then simulate tick n. */
export function runStats(rep: MatchStats): StatsRun {
  const game = createGame({
    seed: rep.seed,
    diff: rep.diff,
    humans: rep.humans,
  });
  const G = game.world;
  const turns = new Map(rep.turns.map(([n, list]) => [n, list]));
  const human = (s: number) => rep.humans[s] != null;
  const minutes: MinuteRow[] = [];
  const intents: StatsRun['intents'] = [];
  let checked = 0;
  let mismatchAt: number | null = null;
  for (let n = 0; n < rep.ticks; n++) {
    for (const [seat, it] of turns.get(n) ?? []) {
      game.apply(seat, it);
      intents.push({ seat, tick: n, t: it.t });
    }
    game.step();
    game.drainNotices();
    const done = n + 1;
    const h = rep.checks[done];
    if (h) {
      checked++;
      if (h !== game.hash() && mismatchAt === null) mismatchAt = done;
    }
    if (done % 600 === 0) {
      for (const p of G.players) {
        const u = G.units.filter(x => x.owner === p.id && !x.dead);
        const c = (t: string) => u.filter(x => x.type === t).length;
        minutes.push({
          minute: done / 600,
          seat: p.id,
          human: human(p.id),
          alive: p.alive,
          land: +(p.land * 100).toFixed(2),
          army: u.length,
          inf: c('inf'),
          raid: c('raid'),
          siege: c('siege'),
          wagon: c('wagon'),
          depots: G.buildings.filter(
            b => !b.dead && b.owner === p.id && b.type === 'depot',
          ).length,
          pop: Math.round(p.pop),
          eff: +p.eff.toFixed(2),
          wood: Math.round(p.res.wood),
          ore: Math.round(p.res.ore),
          steel: Math.round(p.res.steel),
          food: Math.round(p.res.food),
        });
      }
    }
  }
  const r = game.result();
  return {
    ok: mismatchAt === null,
    checked,
    mismatchAt,
    minutes,
    intents,
    players: G.players.map(p => ({
      seat: p.id,
      name: p.name,
      human: human(p.id),
      alive: p.alive,
      land: p.land,
      stats: { ...p.stats },
    })),
    result: { winner: r.winner, reason: r.reason, t: r.t },
  };
}
