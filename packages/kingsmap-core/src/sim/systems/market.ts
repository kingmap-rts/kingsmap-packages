/** The market at the castle. */
import type { GameMessage, Player, TradeResource } from '../world/types';
import { MARKET_GET, MARKET_GIVE, MARKET_RES } from '../config/economy';
import { msg } from '../world/events';

export function trade(
  p: Player,
  from: TradeResource,
  to: TradeResource,
): GameMessage | null {
  if (!MARKET_RES.includes(from) || !MARKET_RES.includes(to) || from === to)
    return msg('error.badTrade');
  if (!p.hq || p.hq.dead) return msg('error.noCastle');
  if (p.res[from] < MARKET_GIVE)
    return msg('error.tradeNeeds', { amount: MARKET_GIVE });
  p.res[from] -= MARKET_GIVE;
  p.res[to] += MARKET_GET;
  p.stats.traded = (p.stats.traded || 0) + MARKET_GIVE;
  return null;
}
