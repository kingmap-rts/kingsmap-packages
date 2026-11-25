/**
 * The rules of the game for renderers and UI: tables, constants and pure helpers.
 * Everything here is read only. Change the world only through Game.apply().
 * There is no text here: the client translates rule ids (unit types, specs, sites, paths, perks,
 * ping and say kinds) and the GameMessage keys of refusals and notices.
 */

// ---- map ----
export { SEATS, TILE_PX, MAP_W, MAP_H, TILES, COLORS } from './sim/config/map';

// ---- roads and territory ----
export {
  ROAD_LEN,
  HQ_RADIUS,
  POST_RADIUS,
  CAPTURE_TIME,
  CAPTURE_HOLD_TIME,
  CAPTURERS,
  CAPTURE_R,
  ARSON_TIME,
  BURN_TIME,
  BURN_IMMUNITY,
} from './sim/config/network';

// ---- units, buildings, sites ----
export {
  UNITS,
  HEAVY_UNITS,
  WAGON_CAP,
  WAGON_R,
  BAG_CAP,
  AMMO_COST,
} from './sim/config/units';
export {
  BUILDINGS,
  POST_SPECS,
  SITE_TYPES,
  SITE_WORKERS,
} from './sim/config/buildings';

// ---- economy ----
export {
  RESOURCES,
  RESOURCE_COLORS,
  YIELD_ORE,
  YIELD_GRAIN,
  YIELD_FOREST,
  YIELD_PLAIN,
  YIELD_CRYSTAL,
  CONVOY_CAP,
  STOCK_CAP,
  STORE_BASE,
  STORE_PER_DEPOT,
  FORGE_RATE,
  MARKET_GIVE,
  MARKET_GET,
  MARKET_RES,
  /** experiment knobs for headless balance runs; the game itself never changes them */
  TUNE,
} from './sim/config/economy';

// ---- match, diplomacy, paths ----
export {
  DOMINATION_SHARE,
  DOMINATION_HOLD,
  DIFFICULTY,
} from './sim/config/match';
export { DEFAULT_BOT_PARAMS } from './sim/config/ai';
export {
  PACT_TIME,
  TRAITOR_TIME,
  OFFER_TIME,
  ALLY_MAX,
  GIFT_COOLDOWN,
  GIFT_AMOUNT,
  PING_KINDS,
  SAY_KINDS,
} from './sim/config/diplomacy';
export {
  PATH_COST,
  ULT_COOLDOWN,
  PATHS,
  PERKS,
  PERK_IDS,
  PATH_ROOT,
  BRANCHES,
  nodeCost,
} from './sim/config/paths';
export { nodeRefusal } from './sim/systems/paths';
// where a road runs (the map draws it along this route) and whose land cuts it; where it crosses
// water on a bridge (the map draws it along bridgeSpans, troops walk the bridgeTiles)
export {
  roadRoute,
  roadTiles,
  bridgeSpans,
  bridgeTiles,
  type RoadPt,
} from './sim/systems/roads';
export { roadLandCut } from './sim/systems/network';
export { unitUnlocked } from './sim/modifiers';

// ---- pure helpers ----
export { tileIndex, inBounds, dist, segmentDist } from './sim/util/geometry';
export { goodsTotal, dominantResource } from './sim/util/resources';
/** deterministic value noise of the map generator (handy for decorating tiles the same way everywhere) */
export { noiseHash, fbm } from './sim/util/noise';
export {
  isDepot,
  canHire,
  buildingIcon,
  centerX,
  centerY,
  wagonLoad,
  lootCarried,
} from './sim/world/entities';
export {
  hasPerk,
  ultimateOf,
  roadLength,
  unitCost,
  buildCost,
} from './sim/modifiers';
export { squadSize, soldierCount } from './sim/systems/squads';
export {
  capturer,
  takeable,
  canCapture,
  captureTime,
} from './sim/systems/capture';
export { canAfford } from './sim/commands/build';
