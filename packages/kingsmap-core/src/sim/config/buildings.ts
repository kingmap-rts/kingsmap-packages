/** Buildings, post specialisations and production sites. */
import type {
  BuildingSpec,
  BuildingType,
  SiteSpec,
  SiteType,
  SpecSpec,
  SpecType,
} from '@kingmap-rts/kingsmap-types';

export const BUILDINGS: Record<BuildingType, BuildingSpec> = {
  hq: { hp: 900, icon: '★' },
  depot: { hp: 320, wood: 60, steel: 10, icon: '▣' },
};

export const POST_SPECS: Record<SpecType, SpecSpec> = {
  forge: { icon: '⚒', wood: 60, steel: 10 },
  barracks: {
    icon: '⚔',
    wood: 60,
    steel: 20,
  },
  fort: {
    icon: '⛨',
    wood: 50,
    steel: 25,
  },
};

/** the most archers a fort or the castle holds: the first comes with it, the others are bought (KAN-30) */
export const ARCHERS_MAX = 3;

/**
 * what the 2nd and the 3rd archer cost, on a fort and on the castle: mostly steel (the arms), a
 * little wood (the walls); about the price of 5 and 7 foot soldiers' steel
 */
export const ARCHER_COST: Record<
  'fort' | 'hq',
  readonly { wood: number; steel: number }[]
> = {
  fort: [
    { wood: 20, steel: 40 },
    { wood: 30, steel: 60 },
  ],
  hq: [
    { wood: 30, steel: 60 },
    { wood: 45, steel: 90 },
  ],
};

/** the walls an added archer brings (hit points; the walls perk adds its share) */
export const ARCHER_HP = { fort: 150, hq: 200 };

/** one archer's arrow: damage, and a volley every second (a free archer looks again in 0.3 s) */
export const ARROW_DMG = { fort: 7, hq: 8 };

/** how far the archers of a fort or the castle shoot, tiles */
export const ARROW_RANGE = 3.6;

export const SITE_TYPES: Record<SiteType, SiteSpec> = {
  mine: { icon: '⛏', res: 'ore', y: 0.5 },
  farm: { icon: '🌾', res: 'food', y: 0.45 },
  vein: { icon: '💎', res: 'crystal', y: 1 / 60 },
  mill: { icon: '🪓', res: 'wood', y: 0.3 },
};

export const SITE_WORKERS = 4;
