/**
 * The resource ledger: where every realm's resources came from and went to over the last
 * minute, for the HUD's resource panel (Game.ledger()).
 *
 * Display only. The simulation writes here (note()) but never reads it, and it lives outside
 * the world (a WeakMap keyed by it), so it is not in stateHash() and changes no golden match.
 * Headless matches (bots' balance runs, server re-simulation) keep none: startLedger() is never
 * called for them and every note is dropped.
 *
 * Sums sit in one-second buckets of a ring of WINDOW buckets: a bucket is cleared when the
 * clock enters its second again. reconcile() (after every tick) books whatever changed a
 * stock without a note() as 'other', so sum(in) − sum(out) always equals the stock's change.
 */
import type {
  LedgerSink,
  LedgerSource,
  Resource,
  ResourceFlow,
  ResourceLedger,
  World,
} from '@kingmap-rts/kingsmap-types';
import { RESOURCES } from './config/economy';
import { SEATS } from './config/map';
import { G } from './state';

/** seconds the ledger covers */
export const WINDOW = 60;

const SOURCES: LedgerSource[] = [
  'castle',
  'sites',
  'forge',
  'market',
  'gift',
  'loot',
  'other',
];
const SINKS: LedgerSink[] = [
  'build',
  'hire',
  'army',
  'people',
  'ammo',
  'supply',
  'forge',
  'market',
  'gift',
  'perk',
  'overflow',
  'other',
];
/** one slot per source, then one per sink */
const SLOTS = SOURCES.length + SINKS.length;
const SRC = new Map(SOURCES.map((s, i) => [s, i]));
const SNK = new Map(SINKS.map((s, i) => [s, SOURCES.length + i]));
const RES = new Map(RESOURCES.map((k, i) => [k, i]));
const NR = RESOURCES.length;
const PER_SECOND = SEATS * NR * SLOTS;

interface Ledger {
  /** WINDOW buckets of PER_SECOND sums */
  sums: Float64Array;
  /** the second each bucket holds (-1 = empty) */
  sec: Int32Array;
  /** every stock at the last reconcile() */
  seen: Float64Array;
  /** what note() booked since the last reconcile(), signed */
  booked: Float64Array;
}

const ledgers = new WeakMap<World, Ledger>();

/** start the ledger of the active match (Game does it unless the match is headless) */
export function startLedger(): void {
  if (ledgers.has(G)) return;
  const l: Ledger = {
    sums: new Float64Array(WINDOW * PER_SECOND),
    sec: new Int32Array(WINDOW).fill(-1),
    seen: new Float64Array(SEATS * NR),
    booked: new Float64Array(SEATS * NR),
  };
  for (const p of G.players)
    for (let r = 0; r < NR; r++) l.seen[p.id * NR + r] = p.res[RESOURCES[r]];
  ledgers.set(G, l);
}

/** the bucket of the current second, cleared if it still holds an older second */
function bucket(l: Ledger, t: number): number {
  const s = Math.floor(t);
  const b = s % WINDOW;
  if (l.sec[b] !== s) {
    l.sec[b] = s;
    l.sums.fill(0, b * PER_SECOND, (b + 1) * PER_SECOND);
  }
  return b;
}

function add(l: Ledger, seat: number, r: number, slot: number, v: number) {
  const b = bucket(l, G.t);
  l.sums[b * PER_SECOND + (seat * NR + r) * SLOTS + slot] += v;
}

/** book an amount of a resource a seat gained (`from`) */
export function gain(
  seat: number,
  k: Resource,
  from: LedgerSource,
  v: number,
): void {
  const l = ledgers.get(G);
  if (!l || !v) return;
  const r = RES.get(k)!;
  add(l, seat, r, SRC.get(from)!, v);
  l.booked[seat * NR + r] += v;
}

/** book an amount of a resource a seat spent (`on`) */
export function spend(
  seat: number,
  k: Resource,
  on: LedgerSink,
  v: number,
): void {
  const l = ledgers.get(G);
  if (!l || !v) return;
  const r = RES.get(k)!;
  add(l, seat, r, SNK.get(on)!, v);
  l.booked[seat * NR + r] -= v;
}

/** after a tick: book every change no gain()/spend() explained as 'other' */
export function reconcile(): void {
  const l = ledgers.get(G);
  if (!l) return;
  for (const p of G.players)
    for (let r = 0; r < NR; r++) {
      const i = p.id * NR + r;
      const now = p.res[RESOURCES[r]];
      const rest = now - l.seen[i] - l.booked[i];
      if (Math.abs(rest) > 1e-9)
        add(
          l,
          p.id,
          r,
          rest > 0 ? SRC.get('other')! : SNK.get('other')!,
          Math.abs(rest),
        );
      l.seen[i] = now;
      l.booked[i] = 0;
    }
}

/** the last minute of one seat (a world without a ledger gives zeros) */
export function readLedger(w: World, seat: number): ResourceLedger {
  const l = ledgers.get(w);
  const now = Math.floor(w.t);
  const res = {} as Record<Resource, ResourceFlow>;
  for (let r = 0; r < NR; r++) {
    const f: ResourceFlow = { in: {}, out: {} };
    if (l)
      for (let b = 0; b < WINDOW; b++) {
        if (l.sec[b] < 0 || now - l.sec[b] >= WINDOW) continue;
        const o = b * PER_SECOND + (seat * NR + r) * SLOTS;
        SOURCES.forEach((s, j) => {
          const v = l.sums[o + j];
          if (v) f.in[s] = (f.in[s] ?? 0) + v;
        });
        SINKS.forEach((s, j) => {
          const v = l.sums[o + SOURCES.length + j];
          if (v) f.out[s] = (f.out[s] ?? 0) + v;
        });
      }
    res[RESOURCES[r]] = f;
  }
  // the buckets cover the current (partial) second and the WINDOW - 1 before it
  return { window: Math.min(w.t, WINDOW - 1 + (w.t - now)), res };
}

/** the castle's trickle (wood, steel, food per second) and the ore its forge melted this tick */
export function castleBooks(seat: number, dt: number, forged: number): void {
  gain(seat, 'wood', 'castle', 0.25 * dt);
  gain(seat, 'food', 'castle', 0.2 * dt);
  spend(seat, 'ore', 'forge', forged);
  gain(seat, 'steel', 'forge', forged);
}

/**
 * food booked as eaten that was not there (the stock ran dry this tick): take it back from the
 * people first (they ate last), then from the army
 */
export function unfed(seat: number, short: number, people: number): void {
  const fromPeople = Math.min(short, people);
  spend(seat, 'food', 'people', -fromPeople);
  spend(seat, 'food', 'army', -(short - fromPeople));
}
