/** Terrain queries. */
import { Terrain } from '../config/map';
import { terrainMap } from '../state';
import { tileIndex, inBounds } from '../util/geometry';

export const walkable = (x: number, y: number) =>
  inBounds(x, y) &&
  (terrainMap[tileIndex(x, y)] === Terrain.Plain ||
    terrainMap[tileIndex(x, y)] === Terrain.Forest);
