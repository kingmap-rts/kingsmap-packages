/**
 * Where a realm's resources came from and went to over the last minute (Game.ledger()).
 * Shown in the resource panel of the HUD. Display only: the simulation never reads it and it
 * is not part of the state hash.
 */
import type { Resource } from './vocabulary';

/** where a resource came from */
export type LedgerSource =
  /** the castle's own trickle (wood, steel, food) */
  | 'castle'
  /** mines, farms, sawmills and crystal fields: the castle's land and caravans from the posts */
  | 'sites'
  /** steel forged from ore at the castle */
  | 'forge'
  /** bought at the market */
  | 'market'
  /** a gift from an ally */
  | 'gift'
  /** loot: bandits' bags, robbed caravans */
  | 'loot'
  /** anything not booked above (should stay near zero) */
  | 'other';

/** what a resource was spent on */
export type LedgerSink =
  /** posts, roads, bridges and post specialisations */
  | 'build'
  /** hiring troops */
  | 'hire'
  /** food the army eats */
  | 'army'
  /** food the people eat */
  | 'people'
  /** steel for arrows and stones */
  | 'ammo'
  /** steel and food loaded on supply wagons */
  | 'supply'
  /** ore melted into steel at the castle */
  | 'forge'
  /** sold at the market */
  | 'market'
  /** a gift to an ally */
  | 'gift'
  /** crystals for the skill tree */
  | 'perk'
  /** lost because the store was full */
  | 'overflow'
  /** anything not booked above (should stay near zero) */
  | 'other';

export interface ResourceFlow {
  /** amounts gained, by source (sources with nothing are left out) */
  in: Partial<Record<LedgerSource, number>>;
  /** amounts spent, by sink (sinks with nothing are left out) */
  out: Partial<Record<LedgerSink, number>>;
}

export interface ResourceLedger {
  /** seconds the sums cover: 60, or less early in the match */
  window: number;
  /** sum(in) − sum(out) equals the change of the stock over the window */
  res: Record<Resource, ResourceFlow>;
}
