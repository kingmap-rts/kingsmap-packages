/** The lockstep clock shared by the server and every client. */
export enum Lockstep {
  /** milliseconds of one server turn */
  TurnMs = 100,
  /** seconds of one simulation tick (one turn = one tick) */
  TickSeconds = 0.1,
  /** clients report their state hash every this many turns */
  HashEvery = 50,
}

/** Hard limits of a match and of what clients may send. */
export enum Limits {
  /** seats in a match (people + bots) */
  MaxPlayers = 10,
  /** biggest match statistics file a client may upload, bytes */
  StatsMaxBytes = 4 * 1024 * 1024,
}
