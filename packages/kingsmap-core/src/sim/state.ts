/**
 * The active match. The simulation's functions read and change "the world" through the live
 * bindings below; activate() points them at another match, so several matches can live in one
 * process (one at a time per call). This is the only mutable module state of the simulation.
 */
import { MAP_H, MAP_W, TILES } from './config/map';
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
    bridges: new Uint8Array(TILES),
    roads: new Uint8Array(TILES),
    roadSum: new Int32Array((MAP_W + 1) * (MAP_H + 1)),
    roadDist: new Float32Array(TILES).fill(1e9),
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
/** 1 on every water tile a standing bridge covers */
export let bridgeMap: Uint8Array;
/** 1 on every tile under a standing road (bridges too): troops walk it faster */
export let roadMap: Uint8Array;
/** sums of roadMap over every box from the map's corner (see Match.roadSum) */
export let roadSum: Int32Array;
/** every tile's distance to the nearest road (see Match.roadDist) */
export let roadDist: Float32Array;

export function activate(m: Match): void {
  matchState = m;
  G = m.world;
  terrainMap = m.terrain;
  depositMap = m.deposits;
  sites = m.sites;
  siteAt = m.siteAt;
  crystalFields = m.crystalFields;
  bridgeMap = m.bridges;
  roadMap = m.roads;
  roadSum = m.roadSum;
  roadDist = m.roadDist;
}

export function setWorld(w: World): void {
  matchState.world = w;
  G = w;
}

export const getMatch = (): Match => matchState;
