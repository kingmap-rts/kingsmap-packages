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

/**
 * Why the server refused a lobby action; the client shows the text in the player's language.
 * `update_required`: the client's core (`hello.core`) is not the server's major.minor, or it sent
 * none; the server lets it in nowhere and the client should load the new build.
 */
export type ServerError =
  | 'hello_first'
  | 'room_not_found'
  | 'room_started'
  | 'room_full'
  | 'update_required';

/** what a started match is doing before its first turn (see the `prestart` message) */
export type PrestartPhase = 'waiting' | 'countdown';

/** client → server */
export type ClientMsg =
  | {
      t: 'hello';
      nick: string;
      token?: string;
      /**
       * the client's `@kingmap-rts/kingsmap-core` version (`CORE_VERSION`). Optional only so old
       * clients still parse: the server answers a missing or different major.minor with
       * `{ t: 'err', code: 'update_required' }`.
       */
      core?: string;
      /**
       * reconnecting to a running match the client already holds: its room code and how many
       * turns from 0 it has without a gap. The catch-up `turns` then starts at `n` instead of 0
       * (the server ignores it for another room and clamps `n` to the turns it has).
       */
      have?: { code: string; n: number };
    }
  | { t: 'create' }
  /** quick match: join an open public game or open one that starts by itself */
  | { t: 'quick' }
  | { t: 'join'; code: string }
  | { t: 'diff'; d: Difficulty }
  | { t: 'start' }
  | { t: 'leave' }
  | { t: 'list' }
  /** after `start`: the match world is built on this client and the map is on screen */
  | { t: 'ready' }
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
  /**
   * Between `start` and turn 0. `waiting`: the server waits until every player sends `ready`, at
   * most until `at`; seats still not ready then go to bots. `countdown`: turn 0 starts at `at`.
   * `at` and `now` are the server's clock (ms): a client counts down `at - now` from the moment the
   * message arrived, so its own clock does not matter. Intents sent before `at` are dropped.
   */
  | {
      t: 'prestart';
      phase: PrestartPhase;
      /** players who sent `ready` / human seats of the match */
      ready: number;
      total: number;
      at: number;
      now: number;
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
