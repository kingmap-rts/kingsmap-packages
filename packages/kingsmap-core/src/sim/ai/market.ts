/** Bots sell what is about to overflow. */
import type { Player, TradeResource } from '../world/types';
import { MARKET_RES, STORE_BASE } from '../config/economy';
import { trade } from '../systems/market';

// bots sell what is about to overflow for what they lack
export function botMarket(p: Player) {
  const cap = p.store || STORE_BASE;
  let from = null;
  for (const k of MARKET_RES)
    if (p.res[k] >= cap * 0.9 && (!from || p.res[k] > p.res[from])) from = k;
  if (!from) return;
  let to: TradeResource | null = null;
  for (const k of ['steel', 'food', 'wood'] as const)
    if (k !== from && (!to || p.res[k] < p.res[to])) to = k;
  if (to && p.res[to] < cap * 0.6) trade(p, from, to);
}
