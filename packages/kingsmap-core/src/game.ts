import {
  Lockstep,
  type GameMap,
  type GameOptions,
  type GameResult,
  type Difficulty,
  type GameMessage,
  type Intent,
} from '@kingmap-rts/kingsmap-types';
import { DEFAULT_BOT_PARAMS } from './sim/config/ai';
import { MAP_H, MAP_W } from './sim/config/map';
import { buildCheck } from './sim/commands/build';
import { applyCommand } from './sim/commands/apply';
import { stateHash } from './sim/hash';
import { activate, matchState } from './sim/state';
import { allied, allyIds, hostile, pactOf } from './sim/systems/diplomacy';
import { update } from './sim/update';
import { nearestLinkedDepot } from './sim/world/entities';
import { newGame } from './sim/world/new-game';
import type { Building, Match, Pact, World } from './sim/world/types';

/**
 * One match. Same seed + same intents in the same order = the same world on every machine.
 * Several games can live in one process: every call switches the simulation to this match first.
 */
export class Game {
  readonly seed: number;
  readonly diff: Difficulty;
  private readonly match: Match;

  constructor(o: GameOptions) {
    this.seed = o.seed;
    this.diff = o.diff ?? 1;
    newGame(this.diff, { seed: o.seed, humans: o.humans ?? { 0: '' } });
    this.match = matchState;
    const G = this.match.world;
    if (o.headless) G.sim = true;
    for (const [seat, P] of Object.entries(o.botParams ?? {})) {
      const p = G.players[+seat];
      if (!p) continue;
      p.ai.P = { ...DEFAULT_BOT_PARAMS, ...P };
      p.ai.wave = p.ai.P.wave0;
      if (p.ai.P.waveAt0 != null) p.ai.waveAt = p.ai.P.waveAt0;
    }
  }

  /** The world, for renderers and UI. Treat it as read only: change it only through apply(). */
  get world(): World {
    return this.match.world;
  }

  get map(): GameMap {
    const m = this.match;
    return {
      width: MAP_W,
      height: MAP_H,
      terrain: m.terrain,
      deposits: m.deposits,
      sites: m.sites,
      siteAt: m.siteAt,
      landTiles: m.landTiles,
    };
  }

  /** world time, seconds */
  get time(): number {
    return this.match.world.t;
  }

  /** Advance one TICK (nothing happens once the match is over). */
  step(): void {
    this.use();
    if (!this.match.world.over) update(Lockstep.TickSeconds);
  }

  /** Apply one intent of a seat. Returns why it was refused (a message key for the client to translate), else null. */
  apply(seat: number, intent: Intent): GameMessage | null {
    this.use();
    return applyCommand(seat, intent);
  }

  /** State hash for desync checks and for verifying match statistics. */
  hash(): string {
    this.use();
    return stateHash();
  }

  result(): GameResult {
    const G = this.match.world;
    return {
      over: G.over,
      winner: G.winner ?? null,
      reason: G.reason ?? null,
      t: G.t,
    };
  }

  /** Take the notices waiting for the players: [seat, message] (the client translates the message). */
  drainNotices(): [number, GameMessage][] {
    const G = this.match.world;
    const n = G.notices;
    G.notices = [];
    return n;
  }

  // ---- questions the UI asks (never change the world) ----

  /** Why this seat cannot put a trading post on this tile, or null when it can. */
  buildError(seat: number, x: number, y: number): GameMessage | null {
    this.use();
    return buildCheck(this.match.world.players[seat], 'depot', x, y);
  }

  allied(a: number, b: number): boolean {
    this.use();
    return allied(a, b);
  }

  hostile(a: number, b: number): boolean {
    this.use();
    return hostile(a, b);
  }

  /** seats allied with this one */
  allies(seat: number): number[] {
    this.use();
    return allyIds(seat);
  }

  pact(a: number, b: number): Pact | undefined {
    this.use();
    return pactOf(a, b);
  }

  /** the connected post of this seat nearest to a point */
  nearestPost(seat: number, x: number, y: number): Building | null {
    this.use();
    return nearestLinkedDepot(seat, x, y);
  }

  private use(): void {
    activate(this.match);
  }
}

export function createGame(o: GameOptions): Game {
  return new Game(o);
}
