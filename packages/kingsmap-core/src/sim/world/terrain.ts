/** Terrain queries. */
import { Terrain } from '../config/map';
import { ROAD_PACE } from '../config/network';
import { bridgeMap, roadMap, terrainMap } from '../state';
import { tileIndex, inBounds } from '../util/geometry';

/** dry land: plain or forest (where things are built and troops are hired) */
export const dry = (x: number, y: number) =>
  inBounds(x, y) &&
  (terrainMap[tileIndex(x, y)] === Terrain.Plain ||
    terrainMap[tileIndex(x, y)] === Terrain.Forest);

/** troops can stand here: dry land, or water under a standing bridge */
export const walkable = (x: number, y: number) =>
  inBounds(x, y) &&
  (terrainMap[tileIndex(x, y)] === Terrain.Plain ||
    terrainMap[tileIndex(x, y)] === Terrain.Forest ||
    bridgeMap[tileIndex(x, y)] === 1);

/** a unit's pace on the tile k, a share of its speed: faster on a road, slower in a forest */
export const paceAt = (k: number) =>
  roadMap[k] === 1 ? ROAD_PACE : terrainMap[k] === Terrain.Forest ? 0.75 : 1;
