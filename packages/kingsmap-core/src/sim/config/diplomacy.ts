/** Alliances, gifts, map signals and short messages. */
import type {
  GiftResource,
  PingKind,
  SayKind,
} from '@kingmap-rts/kingsmap-types';

// Pacts last 8 min and can be renewed by both sides. Breaking one early marks you a traitor for 2 min:
// no new alliances in that time. Allies never fight, share supply and do not cut each other's roads.
// There is still one winner, so every alliance ends some day.
export const PACT_TIME = 480;

export const TRAITOR_TIME = 120;

export const OFFER_TIME = 30;

export const ALLY_MAX = 2;

export const GIFT_COOLDOWN = 10;

export const PING_TIME = 8;

export const GIFT_AMOUNT: Record<GiftResource, number> = {
  wood: 30,
  steel: 30,
  food: 30,
  crystal: 2,
};

/** the map signals a player can show to allies (the client names them) */
export const PING_KINDS: PingKind[] = ['attack', 'help', 'retreat'];

/** the short messages rulers can send each other (the client words them) */
export const SAY_KINDS: SayKind[] = [
  'hi',
  'peace',
  'help',
  'together',
  'thanks',
  'warn',
];
