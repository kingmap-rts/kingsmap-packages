/** Map size, terrain and deposit codes and realm colours (the client names the realms). */
import { Limits } from '@kingmap-rts/kingsmap-types';

export { Deposit, Terrain } from '@kingmap-rts/kingsmap-types';

/** seats on the ring of start positions (people + bots) */
export const SEATS = Limits.MaxPlayers;

export const TILE_PX = 20;

export const MAP_W = 120;

export const MAP_H = 80;

export const TILES = MAP_W * MAP_H;

// bright, clearly distinct realm colours (no green: it would vanish on grass)
export const COLORS = [
  '#1f6fe0',
  '#e0302a',
  '#f2c230',
  '#8e44d6',
  '#f07a1a',
  '#12b5c8',
  '#e8489a',
  '#f4f1e8',
  '#2b2f3a',
  '#8b5a2b',
];

export const CENTRE_OVAL = 0.34;
