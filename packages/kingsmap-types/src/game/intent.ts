import type {
  GiftResource,
  PathId,
  PerkId,
  PingKind,
  SayKind,
  SpecType,
  TradeResource,
  UnitType,
} from './vocabulary';

/** A player's command. Seats are 0..Limits.MaxPlayers-1; ids refer to entity ids in the world. */
export type Intent =
  | { t: 'move'; ids: number[]; x: number; y: number; mode?: 'move' | 'amove' }
  | { t: 'attack'; ids: number[]; target: number }
  /** walk to a hostile post and take it: the troops stand by it and never shoot that post */
  | { t: 'capture'; ids: number[]; target: number }
  | { t: 'stop'; ids: number[] }
  | { t: 'build'; x: number; y: number }
  | { t: 'train'; type: UnitType }
  | { t: 'spec'; b: number; s: SpecType }
  /** add an archer to our fort or castle (up to three): it shoots one more arrow a volley */
  | { t: 'arm'; b: number }
  /** where new troops appear */
  | { t: 'spawn'; b: number }
  /** hire troops automatically */
  | { t: 'auto'; on: boolean }
  /** take the root node of a path's branch (the same as perk with that root) */
  | { t: 'doctrine'; d: PathId }
  /** buy a node of the skill tree */
  | { t: 'perk'; id: PerkId }
  /** use the ability (a tier-5 node) at a map point */
  | { t: 'cast'; x: number; y: number }
  /** walk the selected units of one type together into squads (up to 5 light / 3 heavy) */
  | { t: 'squad'; ids: number[] }
  /** split the selected squads back into single soldiers */
  | { t: 'unsquad'; ids: number[] }
  /** a short message to another ruler */
  | { t: 'say'; to: number; k: SayKind }
  /** propose an alliance, or accept one offered by that seat */
  | { t: 'ally'; to: number }
  /** break an alliance (traitor for 2 min), or decline / withdraw an offer */
  | { t: 'unally'; to: number }
  /** ask to renew a pact; it renews when both sides asked */
  | { t: 'renew'; to: number }
  /** send a caravan of one resource from your castle to an ally's castle */
  | { t: 'gift'; to: number; res: GiftResource }
  /** market at the castle: 30 of one resource for 10 of another */
  | { t: 'trade'; from: TradeResource; to: TradeResource }
  /** map signal seen by you and your allies */
  | { t: 'ping'; x: number; y: number; k: PingKind }
  /** injected by the server when a player leaves or drops: a bot takes over the seat */
  | { t: 'leave' };

export type IntentType = Intent['t'];
