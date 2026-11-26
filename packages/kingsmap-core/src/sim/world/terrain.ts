/** Terrain queries. */
import { Terrain } from '../config/map';
import { ROAD_PACE } from '../config/network';
import { bridgeMap, roadMap, terrainMap } from '../state';
import { tileIndex, inBounds } from '../util/geometry';

// enum codes read once: `Terrain.X` / `Deposit.X` go through CommonJS re-export getters, which cost
// about a third of tick time when read per tile (KAN-88)
const PLAIN = Terrain.Plain;
const FOREST = Terrain.Forest;

/** dry land: plain or forest (where things are built and troops are hired) */
export const dry = (x: number, y: number) =>
  inBounds(x, y) &&
  (terrainMap[tileIndex(x, y)] === PLAIN ||
    terrainMap[tileIndex(x, y)] === FOREST);

/** troops can stand here: dry land, or water under a standing bridge */
export const walkable = (x: number, y: number) =>
  inBounds(x, y) &&
  (terrainMap[tileIndex(x, y)] === PLAIN ||
    terrainMap[tileIndex(x, y)] === FOREST ||
    bridgeMap[tileIndex(x, y)] === 1);

/** a unit's pace on the tile k, a share of its speed: faster on a road, slower in a forest */
export const paceAt = (k: number) =>
  roadMap[k] === 1 ? ROAD_PACE : terrainMap[k] === FOREST ? 0.75 : 1;
