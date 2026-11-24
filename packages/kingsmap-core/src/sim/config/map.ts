/** Map size, terrain and deposit codes and realm colours (the client names the realms). */
import { Color, Limits } from '@kingmap-rts/kingsmap-types';

export { Deposit, Terrain } from '@kingmap-rts/kingsmap-types';

/** seats on the ring of start positions (people + bots) */
export const SEATS = Limits.MaxPlayers;

export const TILE_PX = 20;

export const MAP_W = 120;

export const MAP_H = 80;

export const TILES = MAP_W * MAP_H;

// bright, clearly distinct realm colours (no green: it would vanish on grass)
export const COLORS: Color[] = [
  Color.PlayerBlue,
  Color.PlayerRed,
  Color.PlayerYellow,
  Color.PlayerPurple,
  Color.PlayerOrange,
  Color.PlayerCyan,
  Color.PlayerPink,
  Color.PlayerWhite,
  Color.PlayerBlack,
  Color.PlayerBrown,
];

export const CENTRE_OVAL = 0.34;
