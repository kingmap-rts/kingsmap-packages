/** Alliances, gifts, signals and messages between rulers. */
import type {
  Bag,
  Building,
  GameMessage,
  PingKind,
  Player,
  SayKind,
} from '../world/types';
import type { GiftResource } from '@kingmap-rts/kingsmap-types';
import {
  ALLY_MAX,
  GIFT_AMOUNT,
  GIFT_COOLDOWN,
  PACT_TIME,
  PING_KINDS,
  PING_TIME,
  OFFER_TIME,
  SAY_KINDS,
  TRAITOR_TIME,
} from '../config/diplomacy';
import { SEATS } from '../config/map';
import { G } from '../state';
import { spend } from '../ledger';
import { dist } from '../util/geometry';
import { addConvoy } from '../world/entities';
import { logEvent, msg, notify } from '../world/events';

export const allied = (a: number, b: number) =>
  a !== b && a >= 0 && b >= 0 && G.pact[a][b] > G.t;

export const hostile = (a: number, b: number) =>
  a !== b && !(a >= 0 && b >= 0 && G.pact[a][b] > G.t);

export const allyIds = (pid: number) => {
  const r = [];
  for (let i = 0; i < SEATS; i++) if (allied(pid, i)) r.push(i);
  return r;
};

export function supplyDeps(pid: number, deps: Building[][]) {
  const al = allyIds(pid);
  if (!al.length) return deps[pid];
  let r = deps[pid];
  for (const a of al) r = r.concat(deps[a]);
  return r;
}

export function setPact(a: number, b: number, until: number) {
  G.pact[a][b] = G.pact[b][a] = until;
  G.netT = 0;
}

export function pactOf(a: number, b: number) {
  return G.pacts.find(
    x => (x.a === a && x.b === b) || (x.a === b && x.b === a),
  );
}

export function requestAlly(p: Player, to: number): GameMessage | null {
  const q = G.players[to];
  if (!q || q.id === p.id || !q.alive) return msg('error.noKingdom');
  if (allied(p.id, q.id)) return msg('error.alreadyAllies');
  if (p.traitorUntil > G.t)
    return msg('error.traitor', { seconds: Math.ceil(p.traitorUntil - G.t) });
  const back = G.reqs.find(
    r => r.from === q.id && r.to === p.id && r.until > G.t,
  );
  if (back) {
    if (allyIds(p.id).length >= ALLY_MAX)
      return msg('error.allyMax', { max: ALLY_MAX });
    if (allyIds(q.id).length >= ALLY_MAX)
      return msg('error.allyMaxOther', { player: q.id, max: ALLY_MAX });
    G.reqs = G.reqs.filter(r => r !== back);
    G.pacts.push({
      a: q.id,
      b: p.id,
      until: G.t + PACT_TIME,
      warned: false,
      ra: false,
      rb: false,
    });
    setPact(p.id, q.id, G.t + PACT_TIME);
    p.stats.pacts++;
    q.stats.pacts++;
    logEvent('pact', p.id, { v: q.id });
    for (let i = 0; i < SEATS; i++)
      notify(
        i,
        i === p.id || i === q.id
          ? msg('notice.allianceMade', { player: i === p.id ? q.id : p.id })
          : msg('notice.allianceOthers', { player: q.id, ally: p.id }),
      );
    return null;
  }
  if (allyIds(p.id).length >= ALLY_MAX)
    return msg('error.allyMax', { max: ALLY_MAX });
  if (G.reqs.some(r => r.from === p.id && r.to === q.id && r.until > G.t))
    return msg('error.offerSent');
  G.reqs.push({ from: p.id, to: q.id, until: G.t + OFFER_TIME, at: G.t });
  notify(q.id, msg('notice.allyOffer', { player: p.id }));
  return null;
}

export function breakAlly(p: Player, to: number): GameMessage | null {
  const q = G.players[to];
  if (!q) return msg('error.noKingdom');
  const rq = G.reqs.find(
    r => r.from === q.id && r.to === p.id && r.until > G.t,
  );
  if (rq && !allied(p.id, q.id)) {
    G.reqs = G.reqs.filter(r => r !== rq);
    notify(q.id, msg('notice.allyDeclined', { player: p.id }));
    return null;
  }
  const mine = G.reqs.find(r => r.from === p.id && r.to === q.id);
  if (mine && !allied(p.id, q.id)) {
    G.reqs = G.reqs.filter(r => r !== mine);
    return null;
  }
  if (!allied(p.id, q.id)) return msg('error.notAllies');
  G.pacts = G.pacts.filter(x => x !== pactOf(p.id, q.id));
  setPact(p.id, q.id, 0);
  p.traitorUntil = G.t + TRAITOR_TIME;
  p.stats.betrayals++;
  q.stats.betrayed++;
  logEvent('betray', p.id, { v: q.id });
  for (let i = 0; i < SEATS; i++)
    notify(
      i,
      i === q.id
        ? msg('notice.betrayedYou', { player: p.id })
        : i === p.id
          ? msg('notice.youBrokeAlliance', { player: q.id })
          : msg('notice.betrayal', { player: p.id, target: q.id }),
    );
  return null;
}

export function renewAlly(p: Player, to: number): GameMessage | null {
  const x = pactOf(p.id, to);
  if (!x || !allied(p.id, to)) return msg('error.notAllies');
  if (x.a === p.id) x.ra = true;
  else x.rb = true;
  const q = G.players[to];
  if (x.ra && x.rb) {
    x.until = G.t + PACT_TIME;
    x.ra = x.rb = false;
    x.warned = false;
    setPact(x.a, x.b, x.until);
    notify(p.id, msg('notice.allianceRenewed', { player: q.id }));
    notify(q.id, msg('notice.allianceRenewed', { player: p.id }));
  } else notify(q.id, msg('notice.renewWanted', { player: p.id }));
  return null;
}

export function giftAlly(
  p: Player,
  to: number,
  k: GiftResource,
): GameMessage | null {
  const q = G.players[to];
  if (!q || !allied(p.id, to)) return msg('error.giftsAlliesOnly');
  if (!GIFT_AMOUNT[k]) return msg('error.noSuchResource');
  if (p.giftCd > G.t)
    return msg('error.giftCooldown', { seconds: Math.ceil(p.giftCd - G.t) });
  if (p.res[k] < GIFT_AMOUNT[k]) return msg('error.noResources');
  if (!p.hq || p.hq.dead || !q.hq || q.hq.dead) return msg('error.noCastle');
  p.res[k] -= GIFT_AMOUNT[k];
  spend(p.id, k, 'gift', GIFT_AMOUNT[k]);
  p.giftCd = G.t + GIFT_COOLDOWN;
  p.stats.giftsSent += GIFT_AMOUNT[k];
  const cargo: Bag = { wood: 0, ore: 0, steel: 0, food: 0, crystal: 0 };
  cargo[k] = GIFT_AMOUNT[k];
  const c = addConvoy(p.hq, q.hq, cargo);
  c.giftTo = q.id;
  c.hp = c.maxhp = 60;
  c.L0 = dist(p.hq.x, p.hq.y, q.hq.x, q.hq.y);
  return null;
}

export function ping(
  p: Player,
  x: number,
  y: number,
  k: PingKind,
): GameMessage | null {
  if (!PING_KINDS.includes(k)) return msg('error.noSignal');
  if (p.pingCd > G.t) return null;
  p.pingCd = G.t + 1;
  G.pings.push({ x, y, k, owner: p.id, until: G.t + PING_TIME });
  if (G.pings.length > 40) G.pings.shift();
  for (const a of allyIds(p.id))
    notify(a, msg('notice.ping', { player: p.id, signal: k }));
  return null;
}

export function say(p: Player, to: number, k: SayKind): GameMessage | null {
  const q = G.players[to];
  if (!q || q.id === p.id || !q.alive) return msg('error.noKingdom');
  if (!SAY_KINDS.includes(k)) return msg('error.noSuchMessage');
  if (p.sayCd > G.t) return msg('error.messengerBusy');
  p.sayCd = G.t + 3;
  notify(q.id, msg('notice.say', { player: p.id, say: k }));
  // bots answer simple courtesy and remember a threat
  if (q.bot) {
    if (k === 'hi' || k === 'thanks')
      notify(p.id, msg('notice.replyLikewise', { player: q.id }));
    else if (k === 'warn') {
      q.ai.grudge = p.id;
      notify(p.id, msg('notice.replyWeShallSee', { player: q.id }));
    } else if (k === 'peace' || k === 'together') {
      notify(p.id, msg('notice.replyOfferAlliance', { player: q.id }));
    }
  }
  return null;
}

export function diploTick() {
  if (G.reqs.length)
    G.reqs = G.reqs.filter(
      r => r.until > G.t && G.players[r.from].alive && G.players[r.to].alive,
    );
  if (G.pings.length) G.pings = G.pings.filter(q => q.until > G.t);
  if (!G.pacts.length) return;
  for (const x of G.pacts) {
    const A = G.players[x.a];
    const B = G.players[x.b];
    if (!A.alive || !B.alive) {
      x.until = 0;
      continue;
    }
    if (!x.warned && x.until - G.t <= 60) {
      x.warned = true;
      notify(x.a, msg('notice.allianceEndsSoon', { player: B.id }));
      notify(x.b, msg('notice.allianceEndsSoon', { player: A.id }));
    }
    if (x.until <= G.t) {
      notify(x.a, msg('notice.allianceEnded', { player: B.id }));
      notify(x.b, msg('notice.allianceEnded', { player: A.id }));
      logEvent('pactEnd', x.a, { v: x.b });
    }
  }
  const keep = G.pacts.filter(x => x.until > G.t);
  if (keep.length !== G.pacts.length) {
    for (const x of G.pacts) if (!keep.includes(x)) setPact(x.a, x.b, 0);
    G.pacts = keep;
  }
}
