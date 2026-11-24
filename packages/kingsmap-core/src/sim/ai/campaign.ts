/** Campaign AI (ai2): one persistent assault group that pushes through the enemy network. */
import type { Building, Player, Point, Unit } from '../world/types';
import { FOREVER } from '../config/ai';
import { G } from '../state';
import { hostile } from '../systems/diplomacy';
import { orderMove } from '../systems/movement';
import { soldierCount } from '../systems/squads';
import { dist } from '../util/geometry';
import { rand } from '../util/rng';
import { wagonLoad, isDepot, nearestLinkedDepot } from '../world/entities';

export function groupCentre(g: Unit[]) {
  let x = 0;
  let y = 0;
  for (const u of g) {
    x += u.x;
    y += u.y;
  }
  return [x / g.length, y / g.length];
}

export function pickFoe(p: Player, army: Unit[], enemies: Player[]) {
  const myStr = soldierCount(army.filter(u => u.type !== 'wagon')) + 1;
  let best = null;
  let bs = 1e9;
  for (const q of enemies) {
    if (!q.hq || q.hq.dead) continue;
    let qs = 1;
    for (const u of G.units)
      if (u.owner === q.id && !u.dead && u.type !== 'wagon') qs += u.n || 1;
    const s =
      dist(q.hq.x, q.hq.y, p.hq.x, p.hq.y) *
      (0.55 + Math.min(2, qs / myStr)) *
      (0.9 + rand() * 0.2);
    if (s < bs) {
      bs = s;
      best = q;
    }
  }
  return best;
}

export function pickTarget(p: Player, foe: Player, cx: number, cy: number) {
  let tb = null;
  let bd = 1e9;
  for (const b of G.buildings) {
    if (b.dead || b.owner === p.id || !isDepot(b)) continue;
    const own = b.owner === foe.id;
    const dc = dist(b.x, b.y, cx, cy);
    if (!own && dc > 5) continue; // other players: only what is right in our way
    let s = dc + (own ? 0.6 * dist(b.x, b.y, foe.hq.x, foe.hq.y) : 0);
    if (!b.linked) s *= 0.6;
    if (b.spec === 'fort') s *= 1.3;
    if (b.type === 'hq') s *= 0.9;
    if (s < bd) {
      bd = s;
      tb = b;
    }
  }
  return tb;
}

export function campaign(
  p: Player,
  army: Unit[],
  idle: Unit[],
  idleInf: Unit[],
  enemies: Player[],
  threat: Point | null,
  td: number,
) {
  const ai = p.ai;
  const P = ai.P;
  const group = army.filter(
    u => u.job === 'push' && (u.type === 'inf' || u.type === 'siege'),
  );
  // home defence: recall the group only when the defenders at home are outnumbered
  if (threat && td < 11 && group.length) {
    let foes = 0;
    for (const e of G.units)
      if (
        !e.dead &&
        hostile(p.id, e.owner) &&
        e.kind === 'u' &&
        dist(e.x, e.y, threat.x, threat.y) < 6
      )
        foes += e.n || 1;
    const home = soldierCount(
      army.filter(
        u =>
          u.job !== 'push' &&
          u.type !== 'wagon' &&
          dist(u.x, u.y, p.hq.x, p.hq.y) < 14,
      ),
    );
    if (foes > home + 2) {
      orderMove(group, threat.x | 0, threat.y | 0);
      for (const u of group) {
        u.job = 'def';
        u.jobUntil = G.t + 20;
      }
      ai.gT = 0;
      ai.gPeak = 0;
      p.stats.recalls++;
      return;
    }
  }
  // choose who to fight (kept for a while so the push has a direction)
  let foe = ai.tfoe != null ? G.players[ai.tfoe] : null;
  if (
    !foe ||
    !foe.alive ||
    !foe.hq ||
    foe.hq.dead ||
    G.t > (ai.tfoeUntil ?? Infinity) ||
    !hostile(p.id, foe.id)
  ) {
    foe = pickFoe(p, army, enemies);
    ai.tfoe = foe ? foe.id : null;
    ai.tfoeUntil = G.t + 150;
    ai.gT = 0;
  }
  if (!foe) return;
  if (!group.length) {
    ai.gPeak = 0;
    if (G.t > ai.waveAt && soldierCount(idleInf) >= ai.wave) {
      for (const u of idleInf) {
        u.job = 'push';
        u.jobUntil = FOREVER;
        group.push(u);
      }
      ai.gPeak = soldierCount(group);
      ai.gT = 0;
      ai.waveAt = G.t + 20 + rand() * 15;
      ai.wave = Math.min(24, ai.wave + P.waveInc);
      p.stats.waves++;
      p.stats.waveUnits += soldierCount(group);
    } else return;
  }
  const [cx, cy] = groupCentre(group);
  // reinforcements stream to the group instead of waiting for a whole new wave
  if (soldierCount(idleInf) >= 3 && group.length) {
    const fresh = idleInf.filter(u => u.job !== 'push');
    if (soldierCount(fresh) >= 3) {
      orderMove(fresh, cx | 0, cy | 0);
      for (const u of fresh) {
        u.job = 'push';
        u.jobUntil = FOREVER;
        group.push(u);
      }
    }
  }
  ai.gPeak = Math.max(ai.gPeak || 0, soldierCount(group));
  // melted: fall back to the nearest own depot and start over
  if (soldierCount(group) < Math.max(3, ai.gPeak * 0.35)) {
    const h = nearestLinkedDepot(p.id, cx, cy) || p.hq;
    orderMove(group, h.x, h.y, 'move');
    for (const u of group) {
      u.job = 'regroup';
      u.jobUntil = G.t + 25;
    }
    ai.gT = 0;
    ai.gPeak = 0;
    return;
  }
  // current objective
  let tb = ai.gT ? (G.byId.get(ai.gT) as Building | undefined) : null;
  const stuck = ai.gProgT && G.t - ai.gProgT > 35;
  if (!tb || tb.dead || !hostile(p.id, tb.owner) || stuck) {
    tb = pickTarget(p, foe, cx, cy);
    ai.gT = tb ? tb.id : 0;
    ai.gProgT = G.t;
    ai.gLast = [cx, cy];
    if (!tb) {
      ai.tfoeUntil = 0;
      return;
    }
    if (tb.type === 'hq') p.stats.hqTargets++;
    p.stats.waveDist += dist(tb.x, tb.y, p.hq.x, p.hq.y);
    const free = group.filter(u => !u.tgt);
    orderMove(free, tb.x, tb.y);
    for (const u of free) {
      u.job = 'push';
      u.jobUntil = FOREVER;
    }
  } else {
    // progress check (group moved or is fighting)
    if (
      ai.gLast &&
      (dist(cx, cy, ai.gLast[0], ai.gLast[1]) > 2 || group.some(u => u.tgt))
    ) {
      ai.gProgT = G.t;
      ai.gLast = [cx, cy];
    }
    const lag = group.filter(
      u =>
        !u.tgt &&
        (!u.path || !u.path.length) &&
        dist(u.x, u.y, tb!.x, tb!.y) > 3,
    );
    if (lag.length) {
      orderMove(lag, tb.x, tb.y);
      for (const u of lag) {
        u.job = 'push';
        u.jobUntil = FOREVER;
      }
    }
  }
  // a loaded wagon follows the group so the push stays supplied
  const esc = army.filter(u => u.type === 'wagon' && u.job === 'escort');
  for (const w of esc) if (wagonLoad(w) < 5) w.job = null;
  if (!esc.some(w => wagonLoad(w) >= 5)) {
    const w = idle.find(u => u.type === 'wagon' && wagonLoad(u) >= 15);
    if (w) {
      w.job = 'escort';
      w.jobUntil = FOREVER;
      esc.push(w);
    }
  }
  for (const w of esc)
    if (
      w.job === 'escort' &&
      (!w.path || !w.path.length) &&
      dist(w.x, w.y, cx, cy) > 2.5
    ) {
      orderMove([w], cx | 0, cy | 0, 'move');
      w.job = 'escort';
      w.jobUntil = FOREVER;
    }
}
