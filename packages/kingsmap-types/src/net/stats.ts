import type { Intent } from '../game/intent';
import type { Difficulty } from '../game/vocabulary';
import type { PlayerStats } from '../game/world';

/**
 * The statistics file of a match: everything needed to re-simulate it exactly — the seed, who
 * sat where, and every intent with the tick it was applied on. The server keeps it (gzipped) in
 * file storage and derives the numbers of the match history from it.
 */
export interface MatchStats {
  v: 1;
  id: string;
  mode: 'online' | 'local';
  build: string;
  startedAt: string;
  endedAt: string;
  seed: number;
  diff: Difficulty;
  humans: Record<number, string>;
  /** number of simulated ticks */
  ticks: number;
  result: { winner: number | null; reason: string | null; tick: number } | null;
  /** non-empty turns only: [tick, [[seat, intent], ...]] */
  turns: [number, [number, Intent][]][];
  /** agreed state hashes at some ticks, to verify a re-simulation */
  checks: Record<number, string>;
}

/** one seat of a finished match, as the match history shows it */
export interface MatchPlayerSummary {
  seat: number;
  /** the account of a human seat when known; null for bots and unknown players */
  userId: string | null;
  /** nickname of a human seat; null for bots */
  name: string | null;
  bot: boolean;
  /** 1 = winner; survivors by land, then the eliminated, last eliminated first */
  place: number;
  won: boolean;
  /** tick the seat was eliminated on, null when it survived */
  elimAt: number | null;
  /** the core's counters for this seat (kills, captures, convoys…) */
  stats: PlayerStats;
}

/** a finished match in the history */
export interface MatchSummary {
  id: string;
  mode: MatchStats['mode'];
  startedAt: string;
  endedAt: string;
  /** game seconds */
  durationSeconds: number;
  winnerSeat: number | null;
  endReason: string | null;
  players: MatchPlayerSummary[];
}
