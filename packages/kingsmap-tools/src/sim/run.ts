// Parallel headless experiments.
//   yarn workspace @kingmap-rts/kingsmap-tools sim doctrines 14 2100 out/doctrines.jsonl
//   yarn workspace @kingmap-rts/kingsmap-tools sim control 20 1200 out/control.jsonl
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runMatch, type MatchSpec } from './match.ts';

export const DOCTRINES: Record<string, object> = {
  control: {},
  rush: { wave0: 3, waveInc: 0.5, waveAt0: 100, expand: 50 },
  boom: { expand: 22, wave0: 14, labor: 0.9, waveAt0: 300 },
  turtle: { fortDiv: 2, expand: 40, wave0: 12 },
  raiders: { raid: 0.6, smartCut: true },
  siege: { siegeW: 3, wagonW: 2, raid: 0.15 },
  inf_only: { raid: 0, siegeW: 0, wagonW: 0 },
};

function buildJobs(kind: string, per: number, maxT: number): MatchSpec[] {
  const jobs: MatchSpec[] = [];
  let seed = 1000;
  const all = (P: object) =>
    Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, P]));
  if (kind === 'ai_old' || kind === 'ai_new') {
    for (let k = 0; k < per; k++)
      jobs.push({
        seed: seed++,
        maxT,
        tag: kind,
        botParams: all({ ai2: kind === 'ai_new' }),
      });
  } else if (kind === 'ai_mixed') {
    for (let k = 0; k < per; k++)
      jobs.push({
        seed: seed++,
        maxT,
        tag: kind,
        botParams: Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [i, { ai2: (i + k) % 2 === 0 }]),
        ),
      });
  } else if (kind === 'squads') {
    // same seeds: everyone with squads, nobody, and every other seat
    for (let k = 0; k < per; k++) {
      jobs.push({ seed: 5000 + k, maxT, tag: 'sq_on' });
      jobs.push({
        seed: 5000 + k,
        maxT,
        tag: 'sq_off',
        botParams: all({ noSquad: true }),
      });
      jobs.push({
        seed: 5000 + k,
        maxT,
        tag: 'sq_half',
        botParams: Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [
            i,
            { noSquad: (i + k) % 2 === 0 },
          ]),
        ),
      });
    }
  } else if (kind === 'alliances') {
    // same seeds with and without diplomacy
    for (let k = 0; k < per; k++) {
      jobs.push({ seed: 3000 + k, maxT, tag: 'ally_on' });
      jobs.push({
        seed: 3000 + k,
        maxT,
        tag: 'ally_off',
        botParams: all({ noAlly: true }),
      });
    }
  } else if (kind === 'battle') {
    // doctrine stress suite: many scenarios in one run (per = scale factor, 4 → ~92 matches)
    const D4 = ['guild', 'shadow', 'forge', 'land'];
    const seats = (f: (i: number) => object) =>
      Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, f(i)]));
    const add = (
      tag: string,
      n: number,
      bp: (k: number) => any,
      extra: Partial<MatchSpec> = {},
    ) => {
      for (let k = 0; k < n; k++)
        jobs.push({ seed: seed++, maxT, tag, botParams: bp(k), ...extra });
    };
    add('free', 4 * per, () => undefined);
    add('rot', 4 * per, k => seats(i => ({ doc: D4[(i + k) % 4] })));
    add('none', 3 * per, () => seats(() => ({ noDoc: true })));
    add('half', 4 * per, k => seats(i => ({ noDoc: (i + k) % 2 === 0 })));
    for (const d of D4)
      add('mirror_' + d, per, () => seats(() => ({ doc: d })));
    add('crys_half', 3 * per, k => seats(i => ({ doc: D4[(i + k) % 4] })), {
      crystal: 0.5,
    });
    for (let k = 0; k < per; k++)
      jobs.push({ seed: 1000 + k, maxT, tag: 'det' });
  } else if (kind === 'half') {
    // doctrine vs no doctrine on alternating seats
    for (let k = 0; k < per; k++)
      jobs.push({
        seed: 7000 + k,
        maxT,
        tag: 'half',
        botParams: Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [
            i,
            { noDoc: (i + k) % 2 === 0 },
          ]),
        ),
      });
  } else if (kind === 'doctrines') {
    for (let k = 0; k < per; k++)
      for (const d of Object.keys(DOCTRINES))
        jobs.push({
          seed: seed++,
          maxT,
          tag: d,
          botParams: { 0: DOCTRINES[d] },
        });
  } else {
    for (let k = 0; k < per; k++)
      jobs.push({
        seed: seed++,
        maxT,
        tag: kind,
        botParams: { 0: DOCTRINES[kind] ?? {} },
      });
  }
  return jobs;
}

if (isMainThread) {
  const [
    kind = 'control',
    perS = '10',
    maxTS = '1200',
    out = 'out/results.jsonl',
  ] = process.argv.slice(2);
  const jobs = buildJobs(kind, +perS, +maxTS);
  const W = Math.max(1, Math.min(availableParallelism(), jobs.length));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, '');
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  console.log(`${jobs.length} matches on ${W} workers → ${out}`);
  for (let w = 0; w < W; w++) {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: null,
      execArgv: ['--import', 'tsx'],
    });
    const feed = () => {
      if (next < jobs.length) worker.postMessage(jobs[next++]);
      else worker.terminate();
    };
    worker.on('message', r => {
      appendFileSync(out, JSON.stringify(r) + '\n');
      done++;
      if (done % 10 === 0 || done === jobs.length)
        console.log(
          `${done}/${jobs.length} · ${Math.round((Date.now() - t0) / 1000)}s`,
        );
      feed();
    });
    worker.on('error', e => {
      console.error('worker error', e);
    });
    feed();
  }
} else {
  parentPort!.on('message', (spec: MatchSpec) => {
    try {
      parentPort!.postMessage(runMatch(spec));
    } catch (e: any) {
      parentPort!.postMessage({
        tag: spec.tag,
        seed: spec.seed,
        error: String(e?.stack || e).slice(0, 600),
      });
    }
  });
}
