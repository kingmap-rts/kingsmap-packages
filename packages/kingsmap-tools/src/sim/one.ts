// quick single match: yarn workspace @kingmap-rts/kingsmap-tools one [seed] [maxT]
import { runMatch } from './match.ts';
const r = runMatch({
  seed: +(process.argv[2] || 42),
  maxT: +(process.argv[3] || 1500),
});
const st = (k: keyof (typeof r.res)[number]['stats']) =>
  r.res.map(p => p.stats[k]).join(',');
console.log(
  't',
  r.t,
  'ms',
  r.ms,
  'alive',
  r.nAlive,
  'winner',
  r.winner,
  r.reason,
);
for (const k of [
  'pacts',
  'betrayals',
  'betrayed',
  'giftsSent',
  'giftsGot',
  'elimBy',
] as const)
  console.log(k, st(k));
console.log('events', JSON.stringify(r.events));
