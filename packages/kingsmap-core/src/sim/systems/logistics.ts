/** Caravans leaving posts, wagons loading supplies, bandits looting and bringing loot home. */
import type { Bag, Building, Unit } from '../world/types';
import {
  CONVOY_MIN,
  LOAD_ORDER,
  RESOURCES,
  STOCK_CAP,
} from '../config/economy';
import { COLORS } from '../config/map';
import { ROAD_GAP } from '../config/network';
import { BAG_CAP, PLUNDER_RATE, WAGON_CAP, WAGON_LOAD } from '../config/units';
import { convoyCap, hasPerk } from '../modifiers';
import { G } from '../state';
import { hostile } from './diplomacy';
import { orderMove } from './movement';
import { springTrap } from './sabotage';
import { dist } from '../util/geometry';
import { goodsTotal } from '../util/resources';
import {
  addConvoy,
  lootCarried,
  wagonLoad,
  isDepot,
  nearestLinkedDepot,
} from '../world/entities';
import { msg, notify } from '../world/events';
import { gain, spend } from '../ledger';

export function sendCaravan(b: Building) {
  const forge = b.spec === 'forge';
  const send = {} as Bag;
  let tot = 0;
  for (const k of RESOURCES) {
    send[k] =
      forge && k === 'ore' && b.stock.ore < 40 ? 0 : Math.floor(b.stock[k]);
    tot += send[k];
  }
  if (tot < 1) return;
  if (tot < CONVOY_MIN && b.idle < 5) return;
  const cands = b.adj
    .filter(a => a.nb.hop < b.hop && !a.nb.dead)
    .sort(
      (x, y) =>
        x.nb.hop - y.nb.hop ||
        (G.linkFree.get(x.key) || 0) - (G.linkFree.get(y.key) || 0),
    );
  for (const a of cands) {
    if (G.t >= (G.linkFree.get(a.key) || 0)) {
      const cargo: Bag = { wood: 0, ore: 0, steel: 0, food: 0, crystal: 0 };
      let room = convoyCap(G.players[b.owner]);
      for (const k of LOAD_ORDER) {
        const v = Math.min(send[k], room);
        cargo[k] = v;
        b.stock[k] -= v;
        room -= v;
      }
      const cv = addConvoy(b, a.nb, cargo);
      cv.key = a.key;
      cv.L0 = dist(b.x, b.y, a.nb.x, a.nb.y);
      springTrap(cv);
      G.linkFree.set(a.key, G.t + ROAD_GAP);
      b.idle = 0;
      b.sendT = 0.3;
      return;
    }
  }
  if (goodsTotal(b.stock) >= STOCK_CAP * 0.5)
    for (const a of cands) G.cong.set(a.key, G.t);
}

export function wagonTick(u: Unit, dt: number) {
  const cargo = u.cargo!; // every wagon has one
  const p = G.players[u.owner];
  const nn = u.n || 1;
  if (wagonLoad(u) >= 2 * WAGON_CAP * nn - 0.01) return;
  for (const b of G.buildings) {
    if (b.dead || b.owner !== u.owner || !isDepot(b) || !b.linked) continue;
    if (Math.abs(b.x + 0.5 - u.x) > 1.8 || Math.abs(b.y + 0.5 - u.y) > 1.8)
      continue;
    const st = Math.min(
      WAGON_LOAD * nn * dt,
      WAGON_CAP * nn - cargo.steel,
      Math.max(0, p.res.steel - 5),
    );
    const fd = Math.min(
      WAGON_LOAD * nn * dt,
      WAGON_CAP * nn - cargo.food,
      Math.max(0, p.res.food - 5),
    );
    if (st > 0) {
      p.res.steel -= st;
      spend(p.id, 'steel', 'supply', st);
      cargo.steel += st;
    }
    if (fd > 0) {
      p.res.food -= fd;
      spend(p.id, 'food', 'supply', fd);
      cargo.food += fd;
    }
    break;
  }
}

export function banditLoot(u: Unit, dt: number) {
  const carried = lootCarried(u);
  // deliver to own linked depot / HQ
  if (carried > 0) {
    for (const b of G.buildings) {
      if (b.dead || b.owner !== u.owner || !isDepot(b) || !b.linked) continue;
      if (Math.abs(b.x + 0.5 - u.x) > 1.8 || Math.abs(b.y + 0.5 - u.y) > 1.8)
        continue;
      const p = G.players[u.owner];
      const bag = u.bag!; // carried > 0
      if (b.type === 'hq')
        for (const k of RESOURCES) {
          p.res[k] += bag[k];
          gain(p.id, k, 'loot', bag[k]);
        }
      else for (const k of RESOURCES) b.stock[k] += bag[k];
      const n = Math.round(carried);
      p.stats.plunder += n;
      p.stats.loot += n;
      G.fx.push({
        x: u.x,
        y: u.y,
        t: 0,
        dur: 1.2,
        text: '+' + n,
        color: COLORS[u.owner],
      });
      u.bag = null;
      if (u.job === 'return') u.job = null;
      return;
    }
  }
  // take from enemy depot
  const bagCap =
    (hasPerk(G.players[u.owner], 'bag') ? 35 : BAG_CAP) * (u.n || 1);
  if (carried < bagCap) {
    for (const b of G.buildings) {
      if (b.dead || !hostile(u.owner, b.owner) || b.type !== 'depot') continue;
      if (Math.abs(b.x + 0.5 - u.x) > 1.6 || Math.abs(b.y + 0.5 - u.y) > 1.6)
        continue;
      let room = Math.min(bagCap - carried, PLUNDER_RATE * (u.n || 1) * dt);
      if (room <= 0) break;
      if (!u.bag) u.bag = { wood: 0, ore: 0, steel: 0, food: 0, crystal: 0 };
      for (const k of LOAD_ORDER) {
        const v = Math.min(b.stock[k], room);
        b.stock[k] -= v;
        u.bag[k] += v;
        room -= v;
        if (room <= 0) break;
      }
      if (lootCarried(u) >= bagCap - 0.01) {
        const h = nearestLinkedDepot(u.owner, u.x, u.y);
        if (h && !u.ftgt) {
          orderMove([u], h.x, h.y, 'move');
          u.job = 'return';
          u.jobUntil = G.t + 60;
          notify(u.owner, msg('notice.banditReturning'));
        }
      }
      break;
    }
  }
}
