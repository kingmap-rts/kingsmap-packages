/** Wire protocol between the game server and the browser: JSON over one WebSocket. */
import type { Intent } from '../game/intent';
import type { Difficulty } from '../game/vocabulary';

/** [seat, intent]: what one player did in a turn */
export type SeatIntent = [seat: number, intent: Intent];

export interface LobbyPlayer {
  nick: string;
  host: boolean;
  you: boolean;
  online: boolean;
}

/** Why the server refused a lobby action; the client shows the text in the player's language. */
export type ServerError =
  'hello_first' | 'room_not_found' | 'room_started' | 'room_full';

/** client → server */
export type ClientMsg =
  | { t: 'hello'; nick: string; token?: string }
  | { t: 'create' }
  /** quick match: join an open public game or open one that starts by itself */
  | { t: 'quick' }
  | { t: 'join'; code: string }
  | { t: 'diff'; d: Difficulty }
  | { t: 'start' }
  | { t: 'leave' }
  | { t: 'list' }
  | { t: 'i'; i: Intent }
  | { t: 'hash'; n: number; h: string }
  /** the game ended on this client at turn n (sent once) */
  | { t: 'result'; n: number; winner: number | null; reason: string | null };

/** server → client */
export type ServerMsg =
  | { t: 'welcome'; token: string }
  | {
      t: 'lobby';
      code: string;
      host: boolean;
      diff: Difficulty;
      players: LobbyPlayer[];
      quick?: boolean;
      startIn?: number;
    }
  | { t: 'left' }
  | {
      t: 'start';
      seed: number;
      diff: Difficulty;
      humans: Record<number, string>;
      seat: number;
      code: string;
    }
  /** turn n: intents to apply (in this order) before simulating tick n */
  | { t: 'turn'; n: number; i: SeatIntent[] }
  /** catch-up after reconnect: turns from..from+list.length-1 */
  | { t: 'turns'; from: number; list: SeatIntent[][] }
  | {
      t: 'list';
      rooms: { code: string; host: string; n: number; quick?: boolean }[];
      online?: number;
    }
  | { t: 'desync'; n: number }
  | { t: 'err'; code: ServerError };
