/** Bot brain: specialise, expand, hire, defend and raid. */
import type {
  Building,
  Player,
  SpecType,
  Unit,
  UnitType,
} from '../world/types';
import { campaign } from './campaign';
import { botDiplomacy } from './diplomacy';
import { botMarket } from './market';
import { botPaths } from './paths';
import {
  build,
  buildCheck,
  canAfford,
  specialize,
  train,
} from '../commands/build';
import { ASSAULT_R, OBJECTIVE_R } from '../config/ai';
import { BUILDINGS } from '../config/buildings';
import { Deposit, Terrain } from '../config/map';
import { POST_RADIUS, ROAD_LEN } from '../config/network';
import { PATHS } from '../config/paths';
import { UNITS } from '../config/units';
import { unitCost, unitUnlocked } from '../modifiers';
import { G, depositMap, sites, terrainMap } from '../state';
import { hostile } from '../systems/diplomacy';
import { orderAttack, orderMove } from '../systems/movement';
import { soldierCount } from '../systems/squads';
import { dist, tileIndex, detCos, detSin, inBounds } from '../util/geometry';
import { goodsTotal } from '../util/resources';
import { randomInt, rand } from '../util/rng';
import {
  lootCarried,
  wagonLoad,
  isDepot,
  nearestLinkedDepot,
} from '../world/entities';

/**
 * Troops never attack buildings by themselves (KAN-41): the bot's assault troops (a wave, or the
 * campaign group) that stand idle next to an enemy post, or near a castle or the group's objective, are ordered
 * to attack it and keep their job. A cut-off post is left alone: standing by it takes it whole
 * (captureTick). Trebuchets shell buildings in range by themselves.
 */
function assault(p: Player, army: Unit[]) {
  const goal = p.ai.gT ? G.byId.get(p.ai.gT) : null;
  for (const u of army) {
    if (u.job !== 'wave' && u.job !== 'push') continue;
    if (u.tgt || u.ftgt || u.type === 'wagon' || u.type === 'siege') continue;
    if (u.path && u.path.length) continue;
    let tb: Building | null = null;
    let bd = ASSAULT_R;
    for (const b of G.buildings) {
      if (b.dead || !hostile(p.id, b.owner) || !b.linked) continue;
      let e = dist(b.x + 0.5, b.y + 0.5, u.x, u.y);
      // the group's objective and a castle count as nearer: the back ranks of a group join the
      // attack on them instead of standing behind the front
      if (b === goal || b.type === 'hq') e *= ASSAULT_R / OBJECTIVE_R;
      if (e < bd) {
        bd = e;
        tb = b;
      }
    }
    if (!tb) continue;
    const { job, jobUntil } = u;
    orderAttack([u], tb);
    u.job = job;
    u.jobUntil = jobUntil;
  }
}

export function botTick(p: Player) {
  const my = G.buildings.filter(b => !b.dead && b.owner === p.id);
  const deps = my.filter(b => isDepot(b) && b.linked);
  const army = G.units.filter(u => !u.dead && u.owner === p.id);
  botDiplomacy(p);
  botMarket(p);
  const enemies = G.players.filter(q => q.alive && hostile(p.id, q.id));
  if (!enemies.length) return;
  let foe = null;
  let fd = 1e9;
  for (const q of enemies) {
    if (!q.hq || q.hq.dead) continue;
    const d = dist(q.hq.x, q.hq.y, p.hq.x, p.hq.y) * (0.95 + rand() * 0.1);
    if (d < fd) {
      fd = d;
      foe = q;
    }
  }
  const toFoe = (b: Building) => (foe ? dist(b.x, b.y, foe.hq.x, foe.hq.y) : 0);
  const P = p.ai.P;
  let acted = false;
  // 1. specialize
  const plain = deps.filter(b => b.type === 'depot' && !b.spec);
  const nSpec = (s: SpecType) => my.filter(b => b.spec === s).length;
  if (plain.length) {
    if (nSpec('forge') < 1 + Math.floor(deps.length / P.forgeDiv)) {
      const b = plain.reduce((a, c) => (c.yld.ore > a.yld.ore ? c : a));
      if (b.yld.ore >= 0.24 && !specialize(p, b, 'forge')) acted = true;
    }
    if (
      !acted &&
      nSpec('barracks') <
        (deps.length >= P.barracks ? 1 : 0) +
          (deps.length >= P.barracks * 3 ? 1 : 0) &&
      foe
    ) {
      const b = plain.reduce((a, c) => (toFoe(c) < toFoe(a) ? c : a));
      if (!specialize(p, b, 'barracks')) acted = true;
    }
    if (!acted && foe && nSpec('fort') < Math.floor(deps.length / P.fortDiv)) {
      const b = plain.reduce((a, c) => (toFoe(c) < toFoe(a) ? c : a));
      if (!specialize(p, b, 'fort')) acted = true;
    }
  }
  const wantSpec =
    plain.length > 0 &&
    ((nSpec('barracks') < 1 && deps.length >= P.barracks) ||
      nSpec('fort') < Math.floor(deps.length / P.fortDiv));
  // 2. expand
  const allDeps = my.filter(isDepot).length;
  if (!acted && allDeps < 2 + G.t / P.expand && canAfford(p, BUILDINGS.depot)) {
    let best = null;
    let bs = -1e9;
    for (let tries = 0; tries < 70; tries++) {
      const base = deps[randomInt(0, deps.length - 1)];
      if (!base) break;
      const a = rand() * Math.PI * 2;
      const r = 5.5 + rand() * 3.4;
      const x = Math.round(base.x + detCos(a) * r);
      const y = Math.round(base.y + detSin(a) * r);
      if (buildCheck(p, 'depot', x, y)) continue;
      let sc = 0;
      for (let dy = -POST_RADIUS; dy <= POST_RADIUS; dy++)
        for (let dx = -POST_RADIUS; dx <= POST_RADIUS; dx++) {
          const X = x + dx;
          const Y = y + dy;
          if (!inBounds(X, Y) || dx * dx + dy * dy > POST_RADIUS * POST_RADIUS)
            continue;
          const k = tileIndex(X, Y);
          if (G.own[k] === -1) {
            sc += 0.08;
            if (depositMap[k] === Deposit.Ore) sc += 1.5;
            else if (depositMap[k]) sc += 1.1;
            else if (terrainMap[k] === Terrain.Forest) sc += 0.25;
          }
        }
      // prefer making loops: bonus for each linked depot within link range
      let nl = 0;
      for (const d of deps) if (dist(d.x, d.y, x, y) <= ROAD_LEN) nl++;
      sc += Math.min(nl, 3) * 0.6;
      for (const st of sites)
        if (st.owner !== p.id && dist(st.x, st.y, x, y) <= POST_RADIUS - 0.5)
          sc += st.owner < 0 ? 6 : 3;
      sc -= dist(x, y, p.hq.x, p.hq.y) * 0.03;
      if (sc > bs) {
        bs = sc;
        best = [x, y];
      }
    }
    if (best && bs > 1.2) {
      build(p, 'depot', best[0], best[1]);
      acted = true;
    }
  }
  // 3. train
  const cap = Math.min(P.ai2 ? 75 : 45, (10 + G.t / 7) * p.ai.cap);
  const hireAt = [p.hq, ...deps.filter(b => b.spec === 'barracks')].reduce(
    (a, c) => (toFoe(c) < toFoe(a) ? c : a),
  );
  for (let n = 0; n < 2 && soldierCount(army) < cap; n++) {
    const nW = soldierCount(army.filter(u => u.type === 'wagon'));
    const nS = soldierCount(army.filter(u => u.type === 'siege'));
    const nA = soldierCount(army);
    let type: UnitType = rand() < P.raid ? 'raid' : 'inf';
    if (
      P.wagonW > 0 &&
      G.t > 200 &&
      nA >= 10 &&
      nW < Math.max(1, Math.round((1 + Math.floor(nA / 20)) * P.wagonW)) &&
      rand() < 0.25 * Math.min(2, P.wagonW)
    )
      type = 'wagon';
    else if (
      P.siegeW > 0 &&
      G.t > 260 &&
      nA >= 12 &&
      nS < Math.floor((nA / 8) * P.siegeW) &&
      rand() < Math.min(0.8, 0.3 * P.siegeW)
    )
      type = 'siege';
    // a doctrine unit now and then, only when it is affordable (otherwise hire the usual soldier) and useful:
    // builders only while one of our roads burns, arsonists only once there is an enemy network to burn
    if (
      p.doc &&
      unitUnlocked(p, PATHS[p.doc].unit) &&
      type !== 'wagon' &&
      rand() < 0.22
    ) {
      const uu = PATHS[p.doc].unit;
      const lim = uu === 'militia' ? 14 : uu === 'golem' ? 4 : 3;
      const useful =
        uu === 'builder'
          ? G.links.some(l => l.owner === p.id && (G.sab.get(l.key) || 0) > G.t)
          : uu === 'arsonist'
            ? G.t > 300
            : true;
      if (
        useful &&
        soldierCount(army.filter(u => u.type === uu)) < lim &&
        canAfford(p, unitCost(p, uu)) &&
        p.res.steel >= UNITS[uu].steel + 6
      )
        type = uu;
    }
    if (
      p.res.food < 14 ||
      p.res.steel < UNITS[type].steel + (wantSpec && !acted ? 28 : 6) ||
      !canAfford(p, unitCost(p, type))
    )
      break;
    if (p.pop < 1 || p.pop - 1 < p.labor * (p.ai.alert > G.t ? 0.3 : P.labor))
      break;
    const u = train(p, type, hireAt);
    if (!('key' in u)) army.push(u);
  }
  // 4. military
  const idle = army.filter(
    u => !u.tgt && (!u.path || !u.path.length) && !(u.job && u.jobUntil > G.t),
  );
  let threat = null;
  let td = 1e9;
  for (const e of G.units) {
    if (e.dead || !hostile(p.id, e.owner)) continue;
    const k = tileIndex(e.x | 0, e.y | 0);
    if (G.own[k] !== p.id) continue;
    const d = dist(e.x, e.y, p.hq.x, p.hq.y);
    if (d < td) {
      td = d;
      threat = e;
    }
  }
  // also blocked own links
  if (!threat) {
    for (const l of G.links) {
      if (l.owner !== p.id || !l.blocked) continue;
      const mx = (l.a.x + l.b.x) / 2 + 0.5;
      const my_ = (l.a.y + l.b.y) / 2 + 0.5;
      const d = dist(mx, my_, p.hq.x, p.hq.y);
      if (d < td) {
        td = d;
        threat = { x: mx, y: my_ };
      }
    }
  }
  if (threat) p.ai.alert = G.t + 15;
  if (threat) {
    const def = idle.filter(u => dist(u.x, u.y, threat.x, threat.y) < 24);
    if (def.length) {
      orderMove(def, threat.x | 0, threat.y | 0);
      for (const u of def) {
        u.job = 'def';
        u.jobUntil = G.t + 7;
      }
    }
  }
  const idleInf = idle.filter(
    u => (u.type === 'inf' || u.type === 'siege') && u.job !== 'def',
  );
  for (const w of idle.filter(u => u.type === 'wagon')) {
    if (wagonLoad(w) < 15) {
      const h = nearestLinkedDepot(p.id, w.x, w.y);
      if (h) {
        orderMove([w], h.x, h.y, 'move');
        w.job = 'reload';
        w.jobUntil = G.t + 40;
      }
    }
  }
  botPaths(p, army, threat, td);
  assault(p, army);
  if (P.ai2) campaign(p, army, idle, idleInf, enemies, threat, td);
  else if (G.t > p.ai.waveAt && soldierCount(idleInf) >= p.ai.wave && foe) {
    let tb = null;
    let bd = 1e9;
    for (const b of G.buildings) {
      if (b.dead || !hostile(p.id, b.owner) || !isDepot(b)) continue;
      const d =
        dist(b.x, b.y, p.hq.x, p.hq.y) *
        (b.type === 'hq' ? 1.15 : 1) *
        (b.owner === foe.id ? 0.85 : 1) *
        (b.linked ? 1 : 0.45) *
        (b.spec === 'fort' ? 1.3 : 1) *
        (b.spec === 'forge' ? 0.85 : 1);
      if (d < bd) {
        bd = d;
        tb = b;
      }
    }
    if (tb) {
      orderMove(idleInf, tb.x, tb.y);
      for (const u of idleInf) {
        u.job = 'wave';
        u.jobUntil = G.t + 40;
      }
      p.stats.waves++;
      p.stats.waveUnits += soldierCount(idleInf);
      p.stats.waveDist += dist(tb.x, tb.y, p.hq.x, p.hq.y);
      if (tb.type === 'hq') p.stats.hqTargets++;
      const wag = idle
        .filter(u => u.type === 'wagon' && wagonLoad(u) >= 15)
        .slice(0, 1);
      if (wag.length) {
        orderMove(wag, tb.x, tb.y, 'move');
        for (const u of wag) {
          u.job = 'wave';
          u.jobUntil = G.t + 40;
        }
      }
      p.ai.waveAt = G.t + 20 + rand() * 15;
      p.ai.wave = Math.min(24, p.ai.wave + P.waveInc);
    }
  }
  const idleR = idle.filter(u => u.type === 'raid' && u.job !== 'def');
  if (G.t > 40)
    for (const u of idleR) {
      if (lootCarried(u) > 0) {
        const h = nearestLinkedDepot(p.id, u.x, u.y);
        if (h) {
          orderMove([u], h.x, h.y, 'move');
          u.job = 'return';
          u.jobUntil = G.t + 60;
        }
        continue;
      }
      const roll = rand();
      if (P.smartCut) {
        // focused sabotage of trunk lines next to enemy HQs
        let bl = null;
        let bd = 1e9;
        for (const l of G.links) {
          if (!hostile(p.id, l.owner) || l.blocked || !G.players[l.owner].alive)
            continue;
          const mx = (l.a.x + l.b.x) / 2 + 0.5;
          const my_ = (l.a.y + l.b.y) / 2 + 0.5;
          const d =
            dist(mx, my_, u.x, u.y) *
            (Math.min(l.a.hop, l.b.hop) === 0 ? 0.35 : 1) *
            (l.a.spec === 'fort' || l.b.spec === 'fort' ? 2 : 1);
          if (d < bd) {
            bd = d;
            bl = [mx, my_];
          }
        }
        if (bl) {
          orderMove([u], bl[0] | 0, bl[1] | 0, 'move');
          u.job = 'cut';
          u.jobUntil = G.t + 16;
          continue;
        }
      }
      if (roll < 0.45) {
        // plunder a stocked enemy depot
        let bt = null;
        let bd = 34;
        for (const b of G.buildings) {
          if (
            b.dead ||
            !hostile(p.id, b.owner) ||
            b.type !== 'depot' ||
            goodsTotal(b.stock) < 12 ||
            b.spec === 'fort'
          )
            continue;
          const d = dist(b.x, b.y, u.x, u.y);
          if (d < bd) {
            bd = d;
            bt = b;
          }
        }
        if (bt) {
          orderMove([u], bt.x, bt.y, 'move');
          u.job = 'plunder';
          u.jobUntil = G.t + 30;
          continue;
        }
      }
      if (roll < 0.85 && P.cutMin < 99) {
        // sabotage a line
        let bl = null;
        let bd = 34;
        for (const l of G.links) {
          if (!hostile(p.id, l.owner) || l.blocked || !G.players[l.owner].alive)
            continue;
          if (l.a.spec === 'fort' || l.b.spec === 'fort') continue;
          const mx = (l.a.x + l.b.x) / 2 + 0.5;
          const my_ = (l.a.y + l.b.y) / 2 + 0.5;
          const d = dist(mx, my_, u.x, u.y);
          if (d < bd) {
            bd = d;
            bl = [mx, my_];
          }
        }
        if (bl) {
          orderMove([u], bl[0] | 0, bl[1] | 0, 'move');
          u.job = 'cut';
          u.jobUntil = G.t + 14;
          continue;
        }
      }
      let bc = null;
      let bd = 24;
      for (const c of G.convoys) {
        if (c.dead || !hostile(p.id, c.owner)) continue;
        const d = dist(c.x, c.y, u.x, u.y);
        if (d < bd) {
          bd = d;
          bc = c;
        }
      }
      if (bc) {
        orderAttack([u], bc);
        u.job = 'hunt';
        u.jobUntil = G.t + 15;
      }
    }
}
