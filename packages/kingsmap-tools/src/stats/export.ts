// Match statistics files → CSV tables for analysis (pandas / R).
//   yarn workspace @kingmap-rts/kingsmap-tools stats:export <folder-with-stats> [out-folder]
// Writes matches.csv (one row per match), players.csv (one row per player per match),
// minutes.csv (every player every minute) and intents.csv (what humans clicked, by tick).
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadStats, runStats } from './run.ts';

const [inDir = 'stats', outDir = 'out/stats'] = process.argv.slice(2);
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.json(\.gz)?$/.test(f)) files.push(p);
  }
};
walk(inDir);
files.sort();

const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const q = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join(
      '\n',
    ) + '\n'
  );
};

const matches: Record<string, unknown>[] = [];
const players: Record<string, unknown>[] = [];
const minutes: Record<string, unknown>[] = [];
const intents: Record<string, unknown>[] = [];
for (const f of files) {
  const rep = loadStats(f);
  const t0 = Date.now();
  const run = runStats(rep);
  const nh = Object.keys(rep.humans).length;
  matches.push({
    id: rep.id,
    mode: rep.mode,
    build: rep.build,
    startedAt: rep.startedAt,
    diff: rep.diff,
    humans: nh,
    minutes: +(rep.ticks / 600).toFixed(1),
    winner: run.result.winner,
    winnerHuman:
      run.result.winner != null && rep.humans[run.result.winner] != null,
    reason: run.result.reason ?? rep.result?.reason ?? '',
    verified: run.ok,
    checks: run.checked,
    mismatchAt: run.mismatchAt ?? '',
  });
  for (const p of run.players)
    players.push({
      id: rep.id,
      seat: p.seat,
      name: p.name,
      human: p.human,
      alive: p.alive,
      land: +(p.land * 100).toFixed(2),
      ...p.stats,
    });
  for (const m of run.minutes) minutes.push({ id: rep.id, ...m });
  for (const i of run.intents)
    if (rep.humans[i.seat] != null)
      intents.push({
        id: rep.id,
        seat: i.seat,
        minute: +(i.tick / 600).toFixed(2),
        intent: i.t,
      });
  console.log(
    `${f}: ${(rep.ticks / 600).toFixed(1)} min, ${nh} humans, ${run.ok ? 'verified' : 'MISMATCH at ' + run.mismatchAt} (${run.checked} checks) in ${Date.now() - t0} ms`,
  );
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'matches.csv'), csv(matches));
writeFileSync(join(outDir, 'players.csv'), csv(players));
writeFileSync(join(outDir, 'minutes.csv'), csv(minutes));
writeFileSync(join(outDir, 'intents.csv'), csv(intents));
console.log(
  `${files.length} stats files → ${outDir}/{matches,players,minutes,intents}.csv`,
);
