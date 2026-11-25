import {
  Limits,
  type GiftResource,
  type Intent,
  type PathId,
  type PerkId,
  type PingKind,
  type SayKind,
  type SpecType,
  type TradeResource,
  type UnitType,
} from '@kingmap-rts/kingsmap-types';

const PLAYER_INTENTS = new Set<string>([
  'move',
  'attack',
  'capture',
  'stop',
  'build',
  'train',
  'spec',
  'arm',
  'spawn',
  'auto',
  'doctrine',
  'perk',
  'cast',
  'ally',
  'unally',
  'renew',
  'gift',
  'trade',
  'ping',
  'squad',
  'unsquad',
  'say',
]);
const UNIT_TYPES: UnitType[] = [
  'inf',
  'raid',
  'wagon',
  'siege',
  'builder',
  'arsonist',
  'golem',
  'militia',
];
const SPECS: SpecType[] = ['forge', 'barracks', 'fort'];
const PATHS: PathId[] = ['guild', 'shadow', 'forge', 'land'];
const PERKS: PerkId[] = [
  'harvest',
  'pace',
  'drill',
  'longroads',
  'wrights',
  'arson',
  'firebugs',
  'bellows',
  'golems',
  'claim',
  'levies',
  'carav',
  'cheap',
  'repair',
  'reach',
  'ward',
  'road',
  'burn60',
  'tough',
  'bag',
  'scorch',
  'panic',
  'night',
  'cheapsiege',
  'deploy',
  'ammo',
  'walls',
  'rain',
  'rally',
  'bread',
  'growth',
  'labor',
  'granary',
  'pitch',
  'charter',
];
const SAYS: SayKind[] = ['hi', 'peace', 'help', 'together', 'thanks', 'warn'];
const TRADE: TradeResource[] = ['wood', 'ore', 'steel', 'food'];
const GIFTS: GiftResource[] = ['wood', 'steel', 'food', 'crystal'];
const PINGS: PingKind[] = ['attack', 'help', 'retreat'];

const num = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const ids = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length <= 250 && v.every(num);
const seat = (v: unknown): v is number =>
  Number.isInteger(v) &&
  (v as number) >= 0 &&
  (v as number) < Limits.MaxPlayers;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  list.includes(v as T);

/**
 * Strict shape check for intents coming from players. Returns a clean copy, or null when the
 * message is not a valid player intent ('leave' is server-only and always rejected here).
 */
export function cleanIntent(x: any): Intent | null {
  if (!x || typeof x !== 'object' || !PLAYER_INTENTS.has(x.t)) return null;
  switch (x.t) {
    case 'move':
      return ids(x.ids) && num(x.x) && num(x.y)
        ? {
            t: 'move',
            ids: x.ids,
            x: x.x | 0,
            y: x.y | 0,
            mode: x.mode === 'move' ? 'move' : 'amove',
          }
        : null;
    case 'attack':
    case 'capture':
      return ids(x.ids) && num(x.target)
        ? { t: x.t, ids: x.ids, target: x.target }
        : null;
    case 'stop':
      return ids(x.ids) ? { t: 'stop', ids: x.ids } : null;
    case 'build':
      return num(x.x) && num(x.y)
        ? { t: 'build', x: x.x | 0, y: x.y | 0 }
        : null;
    case 'train':
      return oneOf(UNIT_TYPES, x.type) ? { t: 'train', type: x.type } : null;
    case 'spec':
      return num(x.b) && oneOf(SPECS, x.s)
        ? { t: 'spec', b: x.b, s: x.s }
        : null;
    case 'arm':
      return num(x.b) ? { t: 'arm', b: x.b } : null;
    case 'spawn':
      return num(x.b) ? { t: 'spawn', b: x.b } : null;
    case 'auto':
      return { t: 'auto', on: !!x.on };
    case 'doctrine':
      return oneOf(PATHS, x.d) ? { t: 'doctrine', d: x.d } : null;
    case 'perk':
      return oneOf(PERKS, x.id) ? { t: 'perk', id: x.id } : null;
    case 'say':
      return seat(x.to) && oneOf(SAYS, x.k)
        ? { t: 'say', to: x.to, k: x.k }
        : null;
    case 'squad':
    case 'unsquad':
      return ids(x.ids) ? { t: x.t, ids: x.ids } : null;
    case 'ally':
    case 'unally':
    case 'renew':
      return seat(x.to) ? { t: x.t, to: x.to } : null;
    case 'trade':
      return oneOf(TRADE, x.from) && oneOf(TRADE, x.to) && x.from !== x.to
        ? { t: 'trade', from: x.from, to: x.to }
        : null;
    case 'gift':
      return seat(x.to) && oneOf(GIFTS, x.res)
        ? { t: 'gift', to: x.to, res: x.res }
        : null;
    case 'ping':
      return num(x.x) && num(x.y) && oneOf(PINGS, x.k)
        ? { t: 'ping', x: x.x, y: x.y, k: x.k }
        : null;
    case 'cast':
      return num(x.x) && num(x.y) ? { t: 'cast', x: x.x, y: x.y } : null;
  }
  return null;
}
