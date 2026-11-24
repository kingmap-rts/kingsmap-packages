import type { BotParams, Site } from './world';
import type { Difficulty } from './vocabulary';

export interface GameOptions {
  seed: number;
  diff?: Difficulty;
  /** seat -> nick of a human player; every other seat is a bot with no name (default: seat 0 is a human, nick '') */
  humans?: Record<number, string>;
  /** headless batch run (balance tools, server checks): no notices, a little faster */
  headless?: boolean;
  /** per-seat bot strategy overrides (see DEFAULT_BOT_PARAMS) */
  botParams?: Record<number, Partial<BotParams>>;
}

export interface GameResult {
  over: boolean;
  winner: number | null;
  reason: 'domination' | 'elimination' | null;
  /** world time, seconds */
  t: number;
}

/** The map layers of a match, for renderers and minimaps. Read only. */
export interface GameMap {
  width: number;
  height: number;
  /** terrain code of every tile, row by row (see rules.Terrain) */
  terrain: Uint8Array;
  /** deposit code of every tile (see rules.Deposit) */
  deposits: Uint8Array;
  sites: Site[];
  /** site index on every tile (-1 = none) */
  siteAt: Int16Array;
  /** passable tiles, the base of land shares */
  landTiles: number;
}
