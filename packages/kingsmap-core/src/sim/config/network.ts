/** Roads and territory: link length, claim radii, capture and sabotage timings. */
import type { UnitType } from '@kingmap-rts/kingsmap-types';

export const ROAD_LEN = 9;

export const HQ_RADIUS = 8;

export const POST_RADIUS = 6;

export const ROAD_GAP = 0;

/**
 * how much faster troops walk on a road (its bridges too) than on open ground: a share of their
 * pace on every tile under a standing road, whoever owns it (a forest under the road counts as road)
 */
export const ROAD_PACE = 1.4;

/** seconds a cut-off post holds out while only enemy troops (any of them) stand next to it */
export const CAPTURE_TIME = 4;

/**
 * seconds a post still linked to its castle (a store, a forge, barracks; never a fort or the castle)
 * holds out against foot soldiers ordered to capture it, with none of its owner's troops nearby:
 * three times a cut-off post, the price of taking a supplied post without cutting its road first
 */
export const CAPTURE_HOLD_TIME = 12;

/** the units that can take a linked post (foot soldiers); a cut-off post falls to anyone but raiders */
export const CAPTURERS: readonly UnitType[] = ['inf', 'militia'];

/**
 * the units that never take a post, linked or cut off, nor help to (KAN-31): raiders plunder a post's
 * stock and burn roads, they do not hold land. Standing by a post they neither count for its captors
 * nor hold back troops of their own side that take it.
 */
export const NON_CAPTURERS: readonly UnitType[] = ['raid'];

/** how near a post its captors (and its defenders) must stand, tiles */
export const CAPTURE_R = 2.2;

export const BURN_IMMUNITY = 20;

export const ARSON_TIME = 6;

export const BURN_TIME = 40;
