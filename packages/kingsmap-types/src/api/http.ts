/**
 * The backend's HTTP API (kingsmap-backend): request and response bodies.
 *
 *   GET  /health          → 'ok' (text)
 *   GET  /api/online      → OnlineStats
 *   POST /api/stats       ← MatchStats (a local game) → 202 kept · 204 too short · 400 · 413 · 429
 *   POST /api/feedback    ← FeedbackRequest          → 202 · 400 empty · 429 (202 also for a filled honeypot)
 *   POST /api/error       ← ClientErrorReport        → 204 · 400 · 429
 */

/** players connected right now and matches being played */
export interface OnlineStats {
  online: number;
  playing: number;
}

/** the in-game feedback form */
export interface FeedbackRequest {
  text: string;
  /** how to reach the player (optional) */
  contact?: string;
  /** UI language, e.g. 'uk' */
  lang?: string;
  /** where it was sent from, e.g. "local t=312s seat=0 land=12%" */
  game?: string;
  /**
   * Honeypot against bots: a field hidden from people (off-screen, out of the tab order, ignored by
   * screen readers). A person leaves it empty or omits it; when it has a value the server answers 202
   * as usual but keeps nothing.
   */
  website?: string;
}

/** an uncaught error in a browser */
export interface ClientErrorReport {
  msg: string;
  stack?: string;
}
