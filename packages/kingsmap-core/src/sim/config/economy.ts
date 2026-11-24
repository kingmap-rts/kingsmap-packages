/** Resources, yields, caravans, food, storage, forging and the market. */
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

export const RESOURCE_COLORS: Record<Resource, string> = {
  wood: '#b5793f',
  ore: '#7d8894',
  steel: '#e6eef5',
  food: '#f0cf4a',
  crystal: '#3fb6ff',
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

export const FORGE_RATE = 0.8;

export const HQ_FORGE = 1.4;

// ---- market at the castle: 30 of one resource for 10 of another (mana is not traded) ----
export const MARKET_GIVE = 30;

export const MARKET_GET = 10;

export const MARKET_RES: TradeResource[] = ['wood', 'ore', 'steel', 'food'];
