/** Terrain queries. */
import { Terrain } from '../config/map';
import { bridgeMap, terrainMap } from '../state';
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
