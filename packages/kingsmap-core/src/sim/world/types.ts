/**
 * Types of the simulated world. The shared ones live in @kingmap-rts/kingsmap-types and are
 * re-exported here for the simulation's own imports; Match and NewGameOptions are internal.
 */
import type { Site, Tile, World } from '@kingmap-rts/kingsmap-types';

export type * from '@kingmap-rts/kingsmap-types';

export interface NewGameOptions {
  seed?: number;
  /** seat -> display name for human players; every other seat is a bot */
  humans?: Record<number, string>;
}

/** Everything that belongs to one match: its world, map layers and random state. */
export interface Match {
  seed: number;
  /** state of the seeded random stream */
  rng: number;
  /** passable tiles on the map (for land shares) */
  landTiles: number;
  world: World;
  /** terrain code of every tile */
  terrain: Uint8Array;
  /** deposit code of every tile */
  deposits: Uint8Array;
  sites: Site[];
  /** site index on every tile (-1 = none) */
  siteAt: Int16Array;
  crystalFields: Tile[];
}
