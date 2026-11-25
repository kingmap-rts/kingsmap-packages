/** Resources, yields, caravans, food, storage, forging and the market. */
import { Color } from '@kingmap-rts/kingsmap-types';
import type { Resource, TradeResource } from '../world/types';

export const RESOURCES: Resource[] = [
  'wood',
  'ore',
  'steel',
  'food',
  'crystal',
];
/** loading order of caravans and loot bags: the most valuable first */
export const LOAD_ORDER: Resource[] = [
  'crystal',
  'steel',
  'food',
  'ore',
  'wood',
];

export const RESOURCE_COLORS: Record<Resource, Color> = {
  wood: Color.ResourceWood,
  ore: Color.ResourceOre,
  steel: Color.ResourceSteel,
  food: Color.ResourceFood,
  crystal: Color.ResourceCrystal,
};

/** experiment knobs for headless balance runs; the game itself never changes them */
export const TUNE = { crystal: 1 };

export const YIELD_ORE = 0.12;

export const YIELD_GRAIN = 0.08;

export const YIELD_FOREST = 0.02;

export const YIELD_PLAIN = 0.004;

export const YIELD_CRYSTAL = 0.25 / 60;

export const CONVOY_MIN = 6;

export const CONVOY_CAP = 8;

export const CONVOY_SPEED = 2.4;

export const STOCK_CAP = 60;

export const FOOD_PER_PERSON = 1 / 60;

export const STORE_BASE = 300;

export const STORE_PER_DEPOT = 60;

/** ore a forge post turns into steel, a second */
export const FORGE_RATE = 1.2;

/**
 * ore the castle turns into steel, a second: it holds one forge of its own, as fast as a forge post
 * (the castle makes no steel from nothing; forge posts add to this, where the ore is dug)
 */
export const HQ_FORGE = FORGE_RATE;

// ---- market at the castle: 30 of one resource for 10 of another (mana is not traded) ----
export const MARKET_GIVE = 30;

export const MARKET_GET = 10;

export const MARKET_RES: TradeResource[] = ['wood', 'ore', 'steel', 'food'];
