/** Bots accept, offer, renew and break alliances. */
import type { Player } from '../world/types';
import { ALLY_MAX } from '../config/diplomacy';
import { G } from '../state';
import {
  allied,
  allyIds,
  breakAlly,
  giftAlly,
  hostile,
  renewAlly,
  requestAlly,
} from '../systems/diplomacy';
import { dist } from '../util/geometry';
import { rand } from '../util/rng';

/** bots: accept or reject offers, look for an ally against a common threat, renew useful pacts, and break with a runaway leader */
export function botDiplomacy(p: Player) {
  const ai = p.ai;
  if (ai.P.noAlly) return;
  const mine = allyIds(p.id);
  const lead = G.players.reduce<Player | null>(
    (a, q) => (q.alive && (q.land || 0) > (a ? a.land || 0 : -1) ? q : a),
    null,
  );
  for (const r of G.reqs) {
    if (r.to !== p.id || r.until <= G.t || G.t - r.at < 3) continue;
    const q = G.players[r.from];
    const ok =
      mine.length < ALLY_MAX &&
      !(p.traitorUntil > G.t) &&
      ai.tfoe !== q.id &&
      ai.grudge !== q.id &&
      (q.land || 0) < 0.3 &&
      (q.land || 0) < (p.land || 0) * 2.2 + 0.05 &&
      !(q.traitorUntil > G.t && rand() < 0.7);
    if (ok && rand() < 0.65) requestAlly(p, q.id);
    else breakAlly(p, q.id);
  }
  for (const x of G.pacts) {
    if (x.a !== p.id && x.b !== p.id) continue;
    const q = G.players[x.a === p.id ? x.b : x.a];
    // a partner close to dominating has to be stopped
    if ((q.land || 0) >= 0.32 && q === lead) {
      breakAlly(p, q.id);
      continue;
    }
    // the two of us are all that is left: only one can win
    if (
      G.players.filter(z => z.alive && z.id !== p.id && hostile(p.id, z.id))
        .length === 0 &&
      (p.land || 0) >= (q.land || 0) * 0.8 &&
      rand() < 0.05
    ) {
      breakAlly(p, q.id);
      continue;
    }
    // a bot weighs the pact once, a minute and a half before it ends: about one in three is let go
    if (
      x.until - G.t < 90 &&
      !(x.a === p.id ? x.ra : x.rb) &&
      (q.land || 0) < 0.3
    ) {
      const key = q.id + ':' + Math.round(x.until);
      if (ai.renewKey !== key) {
        ai.renewKey = key;
        ai.renewYes = rand() < 0.65;
      }
      if (ai.renewYes) renewAlly(p, q.id);
    }
    // late in the game a strong bot may turn on a much weaker partner next door
    if (
      G.t > 900 &&
      (q.land || 0) < (p.land || 0) * 0.5 &&
      q.hq &&
      dist(q.hq.x, q.hq.y, p.hq.x, p.hq.y) < 36 &&
      rand() < 0.002
    ) {
      breakAlly(p, q.id);
      continue;
    }
  }
  // help a hungry or broke ally with a caravan from the surplus
  if (p.giftCd <= G.t && G.t >= (ai.giftAt || 0))
    for (const a of mine) {
      const q = G.players[a];
      if (q.res.food < 12 && p.res.food > 220) {
        giftAlly(p, a, 'food');
        ai.giftAt = G.t + 60;
        break;
      }
      if (q.res.steel < 10 && p.res.steel > 240) {
        giftAlly(p, a, 'steel');
        ai.giftAt = G.t + 60;
        break;
      }
    }
  if (
    G.t < 180 ||
    mine.length >= 1 ||
    p.traitorUntil > G.t ||
    G.t < (ai.diploAt || 0)
  )
    return;
  ai.diploAt = G.t + 45 + rand() * 45;
  // ask a near neighbour that is not my current target, preferring one also threatened by the leader
  let best = null;
  let bs = -1e9;
  for (const q of G.players) {
    if (
      !q.alive ||
      q.id === p.id ||
      allied(p.id, q.id) ||
      q.id === ai.tfoe ||
      (q.land || 0) >= 0.28 ||
      q === lead
    )
      continue;
    if (allyIds(q.id).length >= ALLY_MAX) continue;
    const d = dist(q.hq.x, q.hq.y, p.hq.x, p.hq.y);
    const dl =
      lead && lead.hq && lead !== p
        ? dist(q.hq.x, q.hq.y, lead.hq.x, lead.hq.y)
        : 99;
    const sc = -d * 0.6 - dl * 0.4 + rand() * 8;
    if (sc > bs) {
      bs = sc;
      best = q;
    }
  }
  if (best && rand() < 0.6) requestAlly(p, best.id);
}
