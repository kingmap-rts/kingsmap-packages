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

export const SITE_TYPES: Record<SiteType, SiteSpec> = {
  mine: { icon: '⛏', res: 'ore', y: 0.5 },
  farm: { icon: '🌾', res: 'food', y: 0.45 },
  vein: { icon: '💎', res: 'crystal', y: 1 / 60 },
  mill: { icon: '🪓', res: 'wood', y: 0.3 },
};

export const SITE_WORKERS = 4;
