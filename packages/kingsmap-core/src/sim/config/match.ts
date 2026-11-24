/** Victory by domination and difficulty levels. */

export const DOMINATION_SHARE = 0.4;

export const DOMINATION_HOLD = 30;

export const DIFFICULTY: { mult: number; wave: number; cap: number }[] = [
  { mult: 0.75, wave: 210, cap: 0.7 },
  { mult: 1, wave: 160, cap: 1 },
  { mult: 1.35, wave: 120, cap: 1.25 },
];
