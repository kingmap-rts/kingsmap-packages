/** Default bot strategy parameters. */
import type { BotParams } from '../world/types';

export const DEFAULT_BOT_PARAMS: BotParams = {
  ai2: true,
  doc: null,
  noDoc: false,
  noAlly: false,
  noSquad: false,
  siegeW: 1,
  wagonW: 1,
  raid: 0.28,
  forgeDiv: 5,
  fortDiv: 4,
  expand: 38,
  wave0: 6,
  waveInc: 1.5,
  labor: 0.75,
  cutMin: 3,
  barracks: 3,
};

// One persistent assault group per bot. It keeps pushing through the chosen enemy's network
// towards their HQ, is reinforced continuously, regroups when it melts, and is recalled only
// when home is really under attack.
export const FOREVER = 1e9;

/**
 * Troops never attack buildings by themselves (KAN-41), so the bot orders it: an assault unit with
 * no foe to fight that stands this near an enemy post is sent at it, tiles (the reach the troops
 * used to pick buildings by themselves)
 */
export const ASSAULT_R = 2.6;

/** ...or this near a castle or the campaign group's objective (a group's back ranks stand farther off), tiles */
export const OBJECTIVE_R = 5;
