/** One simulation tick: every system in a fixed order. */
import { Color } from '@kingmap-rts/kingsmap-types';
import type { Building, Unit } from './world/types';
import { botTick } from './ai/bot';
import { canAfford, train } from './commands/build';
import {
  CONVOY_SPEED,
  FOOD_PER_PERSON,
  FORGE_RATE,
  HQ_FORGE,
  RESOURCES,
  STOCK_CAP,
  STORE_BASE,
  STORE_PER_DEPOT,
} from './config/economy';
import { SEATS } from './config/map';
import { AMMO_COST, UNITS, WAGON_FOOD } from './config/units';
import {
  ammoMax,
  convoySpeed,
  deployTime,
  forgeBonus,
  hasPerk,
  yieldBonus,
} from './modifiers';
import { G } from './state';
import {
  acquireTarget,
  attackSpot,
  countTargets,
  fire,
  hit,
  kill,
} from './systems/combat';
import { diploTick, hostile } from './systems/diplomacy';
import { banditLoot, sendCaravan, wagonTick } from './systems/logistics';
import { followPath, moveToward } from './systems/movement';
import { recomputeNetwork } from './systems/network';
import { findPath } from './systems/pathfinding';
import { fireRainTick } from './systems/paths';
import { arsonTick } from './systems/sabotage';
import { memberLoss, squadTick } from './systems/squads';
import { dominationTick } from './systems/victory';
import { dist, vecLen } from './util/geometry';
import { goodsTotal } from './util/resources';
import { rand } from './util/rng';
import { centerX, centerY, isDepot } from './world/entities';
import { msg, notify, snapshot } from './world/events';
import { walkable } from './world/terrain';

/** units that ran at a foe this tick (the separation lets them slip past their own troops) */
const chasing = new Set<number>();

/** separation between walking units turns by about 16 degrees (cos, sin) */
const SIDESTEP_C = 0.96;
const SIDESTEP_S = 0.28;

export function update(dt: number) {
  G.t += dt;
  G.netT -= dt;
  if (G.netT <= 0) {
    G.netT = 0.4;
    recomputeNetwork();
  }
  for (const p of G.players) {
    if (!p.alive) continue;
    if (p.hq && !p.hq.dead) {
      p.res.wood += 0.25 * dt;
      p.res.steel += 0.1 * dt;
      p.res.food += 0.2 * dt;
      const c = Math.min(p.res.ore, HQ_FORGE * forgeBonus(p) * dt);
      p.res.ore -= c;
      p.res.steel += c;
    }
  }
  const sold = new Array(SEATS).fill(0);
  for (const u of G.units) {
    if (u.dead) continue;
    const nn = u.n || 1;
    sold[u.owner] += nn;
    const p = G.players[u.owner];
    p.res.food -= UNITS[u.type].upk * nn * dt;
  }
  for (const p of G.players) {
    if (!p.alive) continue;
    p.soldiers = sold[p.id];
    const tot = p.pop + sold[p.id];
    p.res.food -= p.pop * FOOD_PER_PERSON * dt;
    if (p.res.food <= 0) {
      p.res.food = 0;
      p.pop = Math.max(0, p.pop - 0.35 * dt);
      p.hungry = true;
    } else p.hungry = false;
    if (tot < p.cap) {
      if (!p.hungry && p.res.food > 0.5)
        p.pop +=
          (0.25 + 0.015 * p.pop) *
          (1 - tot / p.cap) *
          dt *
          (hasPerk(p, 'growth') ? 1.5 : 1);
    } else {
      p.pop = Math.max(0, p.pop - (0.3 + (tot - p.cap) * 0.03) * dt);
    }
    p.eff = Math.min(1, p.pop / p.labor);
    const st = p.stats;
    if (sold[p.id] > st.peakArmy) st.peakArmy = sold[p.id];
    if (p.tiles > st.peakTiles) st.peakTiles = p.tiles;
  }
  for (const p of G.players) {
    if (!p.alive) continue;
    let nd = 0;
    for (const b of G.buildings)
      if (!b.dead && b.owner === p.id && isDepot(b) && b.linked) nd++;
    p.store =
      (STORE_BASE + STORE_PER_DEPOT * nd) * (hasPerk(p, 'granary') ? 1.5 : 1);
    for (const k of RESOURCES)
      if (p.res[k] > p.store) {
        p.stats.wasted += p.res[k] - p.store;
        p.res[k] = p.store;
      }
  }
  dominationTick(dt);
  if (G.over) return;
  G.snapT -= dt;
  if (G.snapT <= 0) {
    G.snapT = 15;
    snapshot();
    for (const p of G.players) {
      if (!p.alive) continue;
      const nd = G.buildings.filter(b => b.owner === p.id).length;
      if (nd > p.stats.peakDepots) p.stats.peakDepots = nd;
    }
  }
  for (const p of G.players) if (p.res.food < 0) p.res.food = 0;
  // depots
  for (const b of G.buildings) {
    if (b.dead || !isDepot(b)) continue;
    const p = G.players[b.owner];
    // turrets
    if (b.spec === 'fort' || b.type === 'hq') {
      b.cd -= dt;
      if (b.cd <= 0) {
        let best = null;
        let bd = 3.6;
        for (const u of G.units) {
          if (u.dead || !hostile(b.owner, u.owner)) continue;
          if (Math.abs(u.x - b.x - 0.5) > bd || Math.abs(u.y - b.y - 0.5) > bd)
            continue;
          const d = dist(u.x, u.y, b.x + 0.5, b.y + 0.5);
          if (d < bd) {
            bd = d;
            best = u;
          }
        }
        if (best) {
          hit(best, b.type === 'hq' ? 8 : 7, b.owner, b.x + 0.5, b.y + 0.5);
          b.cd = 1;
        } else b.cd = 0.3;
      }
    }
    if (!b.linked) continue;
    if (b.type === 'hq') {
      for (const k of RESOURCES)
        p.res[k] += b.yld[k] * p.mult * p.eff * yieldBonus(p, k) * dt;
      continue;
    }
    if (goodsTotal(b.stock) < STOCK_CAP)
      for (const k of RESOURCES)
        b.stock[k] += b.yld[k] * p.mult * p.eff * yieldBonus(p, k) * dt;
    if (b.spec === 'forge') {
      const c = Math.min(b.stock.ore, FORGE_RATE * forgeBonus(p) * dt);
      b.stock.ore -= c;
      b.stock.steel += c;
    }
    b.idle += dt;
    b.sendT -= dt;
    if (b.sendT <= 0 && !(b.panicUntil !== undefined && b.panicUntil > G.t)) {
      b.sendT = 0.3;
      sendCaravan(b);
    }
  }
  // convoys
  for (const c of G.convoys) {
    if (c.dead) continue;
    const nb = G.byId.get(c.to) as Building | undefined;
    if (
      !nb ||
      nb.dead ||
      nb.owner !== (c.giftTo != null ? c.giftTo : c.owner)
    ) {
      kill(c);
      continue;
    }
    const tx = nb.x + 0.5;
    const ty = nb.y + 0.5;
    const d = dist(c.x, c.y, tx, ty);
    const st = CONVOY_SPEED * convoySpeed(c) * dt;
    if (c.doom && d < c.L0! * 0.5) {
      G.fx.push({ x: c.x, y: c.y, t: 0, dur: 0.8, r: 1, color: Color.Blast });
      kill(c, false, c.doom - 1);
      continue;
    }
    if (d > st) {
      c.x += ((tx - c.x) / d) * st;
      c.y += ((ty - c.y) / d) * st;
      continue;
    }
    if (c.giftTo != null) {
      const q = G.players[c.giftTo];
      for (const k of RESOURCES) q.res[k] += c.cargo[k];
      q.stats.giftsGot += goodsTotal(c.cargo);
      // a gift carries one resource
      const res = RESOURCES.find(k => c.cargo[k] > 0) ?? 'wood';
      notify(
        q.id,
        msg('notice.giftArrived', {
          player: c.owner,
          amount: Math.round(c.cargo[res]),
          res,
        }),
      );
      notify(c.owner, msg('notice.giftDelivered', { player: q.id }));
    } else if (nb.type === 'hq') {
      const p = G.players[c.owner];
      for (const k of RESOURCES) p.res[k] += c.cargo[k];
      p.stats.delivered += goodsTotal(c.cargo);
      p.stats.crystals += c.cargo.crystal;
    } else for (const k of RESOURCES) nb.stock[k] += c.cargo[k];
    c.dead = true;
  }
  fireRainTick(dt);
  diploTick();
  G.sqT -= dt;
  if (G.sqT <= 0) {
    G.sqT = 0.5;
    squadTick();
  }
  // auto-hire
  for (const p of G.players) {
    if (!p.alive || p.bot || !p.auto) continue;
    p.autoT = (p.autoT || 0) - dt;
    if (p.autoT > 0) continue;
    p.autoT = 1;
    const type = rand() < 0.3 ? 'raid' : 'inf';
    if (
      p.res.food >= UNITS[type].food + 12 &&
      p.res.steel >= UNITS[type].steel + 8 &&
      p.pop - 1 >= p.labor * 0.8 &&
      canAfford(p, UNITS[type])
    ) {
      train(
        p,
        type,
        p.spawn ? (G.byId.get(p.spawn) as Building | undefined) : null,
      );
    }
  }
  // units
  countTargets();
  chasing.clear();
  for (const u of G.units) {
    if (u.dead) continue;
    const S = UNITS[u.type];
    const SPD = S.speed * (u.supplied ? 1 : 0.75);
    u.cd -= dt;
    u.scan -= dt;
    if (u.scan <= 0) {
      u.scan = 0.25 + rand() * 0.1;
      acquireTarget(u);
    }
    let t = u.tgt ? G.byId.get(u.tgt) : null;
    if (t && t.dead) {
      t = null;
      u.tgt = 0;
      u.ftgt = 0;
      if (u.dest) u.path = findPath(u.x | 0, u.y | 0, u.dest[0], u.dest[1]);
    }
    if (t) {
      const tx = centerX(t);
      const ty = centerY(t);
      const d = dist(u.x, u.y, tx, ty);
      const rr = S.range + (t.kind === 'b' ? 0.45 : 0);
      if (d <= rr) {
        if (u.cd <= 0 && (!S.deploy || u.deployT >= deployTime(u))) fire(u, t);
        u.ang = Math.atan2(ty - u.y, tx - u.x);
      } else if (u.ftgt) {
        if (d > 3) {
          u.repath -= dt;
          if (!u.path || !u.path.length || u.repath <= 0) {
            u.repath = 1.5;
            u.path = findPath(u.x | 0, u.y | 0, tx | 0, ty | 0);
          }
          followPath(u, SPD, dt);
        } else if (t.kind === 'u') moveToward(u, ...attackSpot(u, t), SPD, dt);
        else moveToward(u, tx, ty, SPD, dt);
        chasing.add(u.id);
      } else if (d < S.aggro * 1.7 && u.type !== 'siege') {
        if (t.kind === 'u') moveToward(u, ...attackSpot(u, t), SPD, dt);
        else moveToward(u, tx, ty, SPD, dt);
        chasing.add(u.id);
      } else {
        u.tgt = 0;
        if (u.dest) u.path = findPath(u.x | 0, u.y | 0, u.dest[0], u.dest[1]);
      }
    } else if (u.path && u.path.length) {
      if (followPath(u, SPD, dt) && u.order === 'move') u.order = 'amove';
    }
    if (u.type === 'raid') banditLoot(u, dt);
    if (u.type === 'wagon') wagonTick(u, dt);
    if (S.deploy) {
      if (u.mv) u.deployT = 0;
      else u.deployT = Math.min(deployTime(u), u.deployT + dt);
    }
    if (u.expire && G.t > u.expire) {
      kill(u, true);
      continue;
    }
    if (u.type === 'arsonist') arsonTick(u, dt);
    u.mv = 0;
    // bandits live off the land: no losses without supply (they still neither heal nor refill arrows)
    if (!u.supplied) {
      if (u.type !== 'raid') u.hp -= 1.4 * (u.n || 1) * dt;
      if (u.n > 1) memberLoss(u, -1);
      if (u.hp <= 0) {
        kill(u);
        continue;
      }
    } else {
      if (G.t - u.lastHit > 3 && u.hp < u.maxhp)
        u.hp = Math.min(u.maxhp, u.hp + 0.8 * (u.n || 1) * dt);
      const w = u.supBy ? (G.byId.get(u.supBy) as Unit | undefined) : null;
      if (w && !w.dead && w.cargo)
        w.cargo.food = Math.max(0, w.cargo.food - WAGON_FOOD * dt);
      if (u.ammo < ammoMax(u)) {
        const p = G.players[u.owner];
        const amt = Math.min(
          (u.type === 'siege' ? 0.6 : 3) * dt,
          ammoMax(u) - u.ammo,
        );
        const cost =
          amt *
          (S.ammoCost || AMMO_COST) *
          (hasPerk(p, 'ammo') ? 0.5 : 1) *
          (u.n || 1);
        if (w && !w.dead && w.cargo) {
          if (w.cargo.steel >= cost) {
            w.cargo.steel -= cost;
            u.ammo += amt;
          }
        } else if (p.res.steel >= cost) {
          p.res.steel -= cost;
          u.ammo += amt;
        }
      }
    }
  }
  // separation
  const us = G.units;
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (a.dead) continue;
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = (a.n > 1 ? 0.5 : 0.275) + (b.n > 1 ? 0.5 : 0.275);
      if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
      const d = vecLen(dx, dy) || 0.01;
      if (d < rr) {
        const push = ((rr - d) * 0.5) / d;
        let px = dx * push;
        let py = dy * push;
        if (
          (a.path && a.path.length && b.path && b.path.length) ||
          chasing.has(a.id) ||
          chasing.has(b.id)
        ) {
          // both are walking, or one runs at a foe: push a little sideways too, so two units
          // meeting head-on step around each other, and an attacker stuck behind its own troops
          // slips past them to the enemy instead of shoving them from behind
          const rx = px * SIDESTEP_C - py * SIDESTEP_S;
          py = py * SIDESTEP_C + px * SIDESTEP_S;
          px = rx;
        }
        if (walkable((a.x - px) | 0, (a.y - py) | 0)) {
          a.x -= px;
          a.y -= py;
        }
        if (walkable((b.x + px) | 0, (b.y + py) | 0)) {
          b.x += px;
          b.y += py;
        }
      }
    }
  }
  for (const s of G.shots) s.t -= dt;
  G.shots = G.shots.filter(s => s.t > 0);
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter(f => f.t < f.dur);
  for (const p of G.players) {
    if (!p.bot || !p.alive) continue;
    p.ai.next -= dt;
    if (p.ai.next <= 0) {
      p.ai.next = 1.1 + rand() * 0.6;
      botTick(p);
    }
  }
  if (G.units.some(u => u.dead)) {
    for (const u of G.units) if (u.dead) G.byId.delete(u.id);
    G.units = G.units.filter(u => !u.dead);
  }
  if (G.convoys.some(c => c.dead)) {
    for (const c of G.convoys) if (c.dead) G.byId.delete(c.id);
    G.convoys = G.convoys.filter(c => !c.dead);
  }
  if (G.buildings.some(b => b.dead)) {
    for (const b of G.buildings) if (b.dead) G.byId.delete(b.id);
    G.buildings = G.buildings.filter(b => !b.dead);
  }
}
