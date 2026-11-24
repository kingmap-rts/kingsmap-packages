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
