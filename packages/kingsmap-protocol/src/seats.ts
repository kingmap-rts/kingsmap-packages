import { Limits } from '@kingmap-rts/kingsmap-types';

/** Spread human seats around the ring of start positions. */
export function spreadSeats(
  k: number,
  np: number = Limits.MaxPlayers,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < k; i++) out.push(Math.round((i * np) / k) % np);
  return out;
}
