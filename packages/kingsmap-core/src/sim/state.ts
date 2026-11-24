/**
 * The active match. The simulation's functions read and change "the world" through the live
 * bindings below; activate() points them at another match, so several matches can live in one
 * process (one at a time per call). This is the only mutable module state of the simulation.
 */
import { TILES } from './config/map';
import type { Match, Site, Tile, World } from './world/types';

export function newMatch(seed: number): Match {
  return {
    seed,
    rng: seed,
    landTiles: 1,
    world: null as unknown as World, // set by newGame right after the map is generated
    terrain: new Uint8Array(TILES),
    deposits: new Uint8Array(TILES),
    sites: [],
    siteAt: new Int16Array(TILES).fill(-1),
    crystalFields: [],
  };
}

/** the active match */
export let matchState: Match;
/** its world */
export let G: World;
/** terrain code of every tile (see Terrain) */
export let terrainMap: Uint8Array;
/** deposit code of every tile (see Deposit) */
export let depositMap: Uint8Array;
/** production sites */
export let sites: Site[];
/** site index on every tile (-1 = none) */
export let siteAt: Int16Array;
/** centres of the big mana fields */
export let crystalFields: Tile[];

export function activate(m: Match): void {
  matchState = m;
  G = m.world;
  terrainMap = m.terrain;
  depositMap = m.deposits;
  sites = m.sites;
  siteAt = m.siteAt;
  crystalFields = m.crystalFields;
}

export function setWorld(w: World): void {
  matchState.world = w;
  G = w;
}

export const getMatch = (): Match => matchState;
