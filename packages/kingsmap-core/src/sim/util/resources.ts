/** Helpers over resource bags. */
import type { Bag, Resource } from '../world/types';
import { RESOURCES } from '../config/economy';

/**
 * Everything in a bag, crystals included: a depot's stock against STOCK_CAP, a caravan's
 * cargo, a bandit's loot. (Before core 0.9 the crystals were left out by accident: a bandit
 * could carry crystals past its bag and never bring back a load of crystals only.)
 * Keep the order of the terms: with no crystals the sum is bit-identical to the old one.
 */
export const goodsTotal = (o: Bag) =>
  o.wood + o.ore + o.steel + o.food + o.crystal;

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
