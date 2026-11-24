/** Helpers over resource bags. */
import type { Bag, Resource } from '../world/types';
import { RESOURCES } from '../config/economy';

export const goodsTotal = (o: Bag) => o.wood + o.ore + o.steel + o.food;

export const dominantResource = (o: Bag) => {
  let best: Resource = 'wood';
  let v = -1;
  for (const k of RESOURCES)
    if (o[k] > v) {
      v = o[k];
      best = k;
    }
  return best;
};
