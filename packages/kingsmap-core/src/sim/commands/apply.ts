/** Player intents: validated orders turned into calls of the systems. */
import type {
  Building,
  GameMessage,
  PathId,
  PerkId,
  PingKind,
  SayKind,
  SpecType,
  TradeResource,
  Unit,
} from '../world/types';
import type { GiftResource, Intent } from '@kingmap-rts/kingsmap-types';
import { build, specialize, train } from './build';
import { UNITS } from '../config/units';
import { G } from '../state';
import {
  breakAlly,
  giftAlly,
  hostile,
  ping,
  renewAlly,
  requestAlly,
  say,
} from '../systems/diplomacy';
import { trade } from '../systems/market';
import { orderAttack, orderMove } from '../systems/movement';
import { cast, choosePath, pickPerk } from '../systems/paths';
import { formSquads, unsquad } from '../systems/squads';
import { canHire } from '../world/entities';
import { msg, notifyAll } from '../world/events';

/** Apply one intent of a seat. Returns a message for the player when it was refused, else null. */
export function applyCommand(seat: number, c: Intent): GameMessage | null {
  const p = G.players[seat];
  if (!p || !p.alive || !c || typeof c !== 'object') return msg('error.out');
  const mine = (ids: unknown) =>
    (Array.isArray(ids) ? ids : [])
      .slice(0, 250)
      .map(id => G.byId.get(id))
      .filter(
        (u): u is Unit => !!u && !u.dead && u.kind === 'u' && u.owner === seat,
      );
  switch (c.t) {
    case 'move':
      orderMove(
        mine(c.ids),
        c.x | 0,
        c.y | 0,
        c.mode === 'move' ? 'move' : 'amove',
      );
      return null;
    case 'attack': {
      const e = G.byId.get(c.target);
      if (e && !e.dead && hostile(seat, e.owner)) orderAttack(mine(c.ids), e);
      else if (e && !e.dead && e.owner !== seat) return msg('error.ally');
      return null;
    }
    case 'stop':
      for (const u of mine(c.ids)) {
        u.path = null;
        u.dest = null;
        u.tgt = 0;
        u.ftgt = 0;
        u.order = null;
      }
      return null;
    case 'build':
      return build(p, 'depot', c.x | 0, c.y | 0);
    case 'train': {
      const r = train(
        p,
        UNITS[c.type] ? c.type : 'inf',
        p.spawn ? (G.byId.get(p.spawn) as Building | undefined) : null,
      );
      return 'key' in r ? r : null;
    }
    case 'spec':
      return specialize(
        p,
        G.byId.get(c.b) as Building | undefined,
        String(c.s) as SpecType,
      );
    case 'spawn': {
      const b = G.byId.get(c.b);
      if (b && !b.dead && b.owner === seat && b.kind === 'b' && canHire(b))
        p.spawn = b.id;
      return null;
    }
    case 'auto':
      p.auto = !!c.on;
      return null;
    case 'doctrine':
      return choosePath(p, String(c.d) as PathId);
    case 'squad':
      return formSquads(p, (Array.isArray(c.ids) ? c.ids : []).slice(0, 250));
    case 'unsquad':
      return unsquad(p, (Array.isArray(c.ids) ? c.ids : []).slice(0, 250));
    case 'say':
      return say(p, c.to | 0, String(c.k) as SayKind);
    case 'ally':
      return requestAlly(p, c.to | 0);
    case 'unally':
      return breakAlly(p, c.to | 0);
    case 'renew':
      return renewAlly(p, c.to | 0);
    case 'gift':
      return giftAlly(p, c.to | 0, String(c.res) as GiftResource);
    case 'trade':
      return trade(
        p,
        String(c.from) as TradeResource,
        String(c.to) as TradeResource,
      );
    case 'ping':
      return ping(p, +c.x || 0, +c.y || 0, String(c.k) as PingKind);
    case 'perk':
      return pickPerk(p, String(c.id) as PerkId);
    case 'cast':
      return cast(p, +c.x || 0, +c.y || 0);
    case 'leave':
      p.bot = true;
      p.auto = false;
      notifyAll(msg('notice.left', { player: p.id }));
      return null;
  }
  return null;
}
