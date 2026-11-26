// Wire types of the replay endpoints (KAN-68): GET /api/replays and GET /api/replays/:id/file
// (the file is the stored MatchStats, gzip).

/** a seat of a replay card */
export interface ReplaySeat {
  seat: number;
  /** nickname of a human seat; null for bots */
  name: string | null;
  bot: boolean;
  /** 1 = winner */
  place: number;
  won: boolean;
}

/** one finished match in the replay list */
export interface ReplaySummary {
  id: string;
  mode: 'online' | 'local';
  startedAt: string;
  endedAt: string;
  /** simulated ticks (10 per second) */
  ticks: number;
  winnerSeat: number | null;
  endReason: string | null;
  /** the core that re-simulated the match; null for matches kept before core versions were stored */
  coreVersion: string | null;
  /** every stored state hash matched the server's re-simulation */
  verified: boolean;
  players: ReplaySeat[];
}

/** GET /api/replays?page=0&limit=20 */
export interface ReplayListResponse {
  items: ReplaySummary[];
  page: number;
  /** another page follows */
  more: boolean;
}
