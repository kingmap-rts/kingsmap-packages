/** The words of the game shared by the protocol, the simulation and the UI. */

export type Resource = 'wood' | 'ore' | 'steel' | 'food' | 'crystal';
/** resources that can be traded at the castle market (mana cannot) */
export type TradeResource = 'wood' | 'ore' | 'steel' | 'food';
/** resources that can be sent to an ally as a gift caravan */
export type GiftResource = 'wood' | 'steel' | 'food' | 'crystal';

export type UnitType =
  | 'inf'
  | 'raid'
  | 'wagon'
  | 'siege'
  | 'builder'
  | 'arsonist'
  | 'golem'
  | 'militia';
export type BuildingType = 'hq' | 'depot';
/** what a trading post can be turned into */
export type SpecType = 'forge' | 'barracks' | 'fort';
export type SiteType = 'mine' | 'farm' | 'mill' | 'vein';

/** the four paths (Шляхи): the branches of the skill tree */
export type PathId = 'guild' | 'shadow' | 'forge' | 'land';
/** a branch of the skill tree: the shared trunk or one of the paths */
export type BranchId = PathId | 'trunk';
/** a node of the skill tree, bought with mana */
export type PerkId =
  // the trunk: open to every realm
  | 'harvest'
  | 'pace'
  | 'drill'
  // each path's root (its trait) and the node that unlocks its own unit
  | 'longroads'
  | 'wrights'
  | 'arson'
  | 'firebugs'
  | 'bellows'
  | 'golems'
  | 'claim'
  | 'levies'
  | 'carav'
  | 'cheap'
  | 'repair'
  | 'reach'
  | 'ward'
  | 'road'
  | 'burn60'
  | 'tough'
  | 'bag'
  | 'scorch'
  | 'panic'
  | 'night'
  | 'cheapsiege'
  | 'deploy'
  | 'ammo'
  | 'walls'
  | 'rain'
  | 'rally'
  | 'bread'
  | 'growth'
  | 'labor'
  | 'granary'
  | 'pitch'
  | 'charter';

export type PingKind = 'attack' | 'help' | 'retreat';
export type SayKind = 'hi' | 'peace' | 'help' | 'together' | 'thanks' | 'warn';

/** bot strength: 0 easy, 1 normal, 2 hard */
export type Difficulty = 0 | 1 | 2;
