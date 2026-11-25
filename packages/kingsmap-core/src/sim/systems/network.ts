/** Road network: links between posts, cut roads, territory, population capacity and supply. */
import type { Building } from '../world/types';
import { SITE_TYPES } from '../config/buildings';
import {
  RESOURCES,
  TUNE,
  YIELD_CRYSTAL,
  YIELD_FOREST,
  YIELD_GRAIN,
  YIELD_ORE,
  YIELD_PLAIN,
} from '../config/economy';
import { Deposit, MAP_H, MAP_W, SEATS, TILES, Terrain } from '../config/map';
import { HQ_RADIUS } from '../config/network';
import { WAGON_R } from '../config/units';
import { claimRadius, hasPerk, roadLength, siteWorkers } from '../modifiers';
import { G, matchState, depositMap, sites, terrainMap } from '../state';
import { captureTick } from './capture';
import { hostile, supplyDeps } from './diplomacy';
import { roadTiles } from './roads';
import { builderTick, sabotageTick } from './sabotage';
import { dist, tileIndex, segmentDist } from '../util/geometry';
import { isDepot, linkKey } from '../world/entities';
import { logEvent, msg, notify } from '../world/events';

/** Is the road a–b cut for its owner? `by` is the seat with the most soldiers on it (-1 when it burns). */
export function linkBlocked(
  a: Building,
  b: Building,
  owner: number,
): { blocked: boolean; by: number } {
  if ((G.sab.get(linkKey(a, b)) || 0) > G.t) return { blocked: true, by: -1 };
  const ax = a.x + 0.5;
  const ay = a.y + 0.5;
  const bx = b.x + 0.5;
  const by = b.y + 0.5;
  let foe = 0;
  let fr = 0;
  const fo = new Array(SEATS).fill(0);
  for (const u of G.units) {
    if (u.dead) continue;
    if (
      u.x < Math.min(ax, bx) - 1.2 ||
      u.x > Math.max(ax, bx) + 1.2 ||
      u.y < Math.min(ay, by) - 1.2 ||
      u.y > Math.max(ay, by) + 1.2
    )
      continue;
    if (segmentDist(u.x, u.y, ax, ay, bx, by) <= 1.1) {
      const nn = u.n || 1;
      if (u.owner === owner) fr += nn;
      else if (hostile(owner, u.owner)) {
        foe += nn;
        fo[u.owner] += nn;
      }
    }
  }
  const cutter = fo.indexOf(Math.max(...fo));
  if (a.spec === 'fort' || b.spec === 'fort')
    return { blocked: foe >= 3 && foe > fr * 2, by: cutter };
  return { blocked: foe > 0 && foe > fr, by: cutter };
}

/**
 * Who holds each tile, from the posts that are linked now (fills `own` and `tdep`). First come,
 * first served: buildings claim land oldest first, and a newer post never takes land that already
 * belongs to another kingdom, its land simply flows around the border. Between your own posts the
 * nearest wins. Pure: reads only the buildings.
 */
export function claimLand(own: Int8Array, tdep: Int32Array) {
  own.fill(-1);
  const best = new Float32Array(TILES).fill(1e9);
  const claim = G.buildings
    .filter(b => !b.dead && isDepot(b) && b.linked)
    .sort((a, b) => a.id - b.id);
  for (const b of claim) {
    const R = b.type === 'hq' ? HQ_RADIUS : claimRadius(b);
    for (let y = Math.max(0, b.y - R); y <= Math.min(MAP_H - 1, b.y + R); y++)
      for (
        let x = Math.max(0, b.x - R);
        x <= Math.min(MAP_W - 1, b.x + R);
        x++
      ) {
        const r2 = (x - b.x) ** 2 + (y - b.y) ** 2;
        if (r2 > R * R + 0.5) continue;
        const k = tileIndex(x, y);
        const d2 = b.type === 'hq' ? r2 * 0.55 : r2;
        if (own[k] >= 0 && own[k] !== b.owner) continue;
        if (d2 < best[k]) {
          best[k] = d2;
          own[k] = b.owner;
          tdep[k] = b.id;
        }
      }
  }
  for (const b of G.buildings) {
    if (!b.dead && isDepot(b) && b.linked) {
      own[tileIndex(b.x, b.y)] = b.owner;
      tdep[tileIndex(b.x, b.y)] = b.id;
    }
  }
}

export function computeTerritory() {
  const own = G.own;
  claimLand(own, G.tdep);
  for (const b of G.buildings) {
    if (!b.dead && isDepot(b)) for (const k of RESOURCES) b.yld[k] = 0;
  }
  for (let k = 0; k < TILES; k++) {
    if (own[k] < 0) continue;
    const b = G.byId.get(G.tdep[k]) as Building | undefined;
    if (!b || b.dead) continue;
    if (depositMap[k] === Deposit.Ore) b.yld.ore += YIELD_ORE;
    else if (depositMap[k] === Deposit.Crystal)
      b.yld.crystal += YIELD_CRYSTAL * TUNE.crystal;
    else if (depositMap[k] === Deposit.Grain) b.yld.food += YIELD_GRAIN;
    else if (terrainMap[k] === Terrain.Forest) b.yld.wood += YIELD_FOREST;
    else if (terrainMap[k] === Terrain.Plain) {
      b.yld.wood += YIELD_PLAIN;
      b.yld.food += YIELD_PLAIN;
    }
  }
  // production sites: whoever's linked territory covers them
  for (const st of sites) {
    const k = tileIndex(st.x, st.y);
    const o = own[k];
    const prev = st.owner;
    let b: Building | null | undefined = null;
    if (o >= 0) {
      b = G.byId.get(G.tdep[k]) as Building | undefined;
      if (!b || b.dead) b = null;
    }
    st.owner = b ? o : -1;
    st.dep = b ? b.id : 0;
    if (b)
      b.yld[SITE_TYPES[st.type].res] +=
        SITE_TYPES[st.type].y * (st.type === 'vein' ? TUNE.crystal : 1);
    if (prev !== st.owner && G.t > 1) {
      const S = SITE_TYPES[st.type];
      if (st.owner >= 0 && G.players[st.owner].stats)
        G.players[st.owner].stats.sitesGained++;
      if (st.owner >= 0)
        notify(
          st.owner,
          msg('notice.siteGained', {
            site: st.type,
            amount: Math.round(S.y * 60),
            res: S.res,
          }),
        );
      if (prev >= 0) notify(prev, msg('notice.siteLost', { site: st.type }));
    }
    if (prev !== st.owner && st.owner >= 0)
      logEvent('site', st.owner, { s: st.type, v: prev });
  }
  G.terrV = (G.terrV || 0) + 1; // render hint, not part of the simulated state
  return own;
}

/** scratch territory of the first pass (see recomputeNetwork) */
let land0: Int8Array | null = null;
let land0Dep: Int32Array | null = null;

/**
 * The first hostile seat whose land the road a–b runs through for `owner` (by `own`), or -1.
 * Allied land never cuts. The road is the one the map draws (roads.ts), tile by tile.
 */
export function roadLandCut(
  a: Building,
  b: Building,
  owner: number,
  own: Int8Array = G.own,
): number {
  const tiles = roadTiles(terrainMap, a.x, a.y, b.x, b.y);
  for (let i = 0; i < tiles.length; i++) {
    const o = own[tiles[i]];
    if (o >= 0 && hostile(owner, o)) return o;
  }
  return -1;
}

/** links each realm's posts from its castle along the open roads (sets linked and hop) */
function linkFromCastle(ds: Building[], ward: boolean) {
  for (const b of ds) {
    b.linked = false;
    b.hop = 99;
  }
  const h = ds.find(b => b.type === 'hq');
  if (!h) return; // no castle: nothing is linked, not even by a road ward
  h.linked = true;
  h.hop = 0;
  const q = [h];
  let qi = 0;
  while (qi < q.length) {
    const a = q[qi++];
    for (const { nb } of a.adj)
      if (!nb.linked) {
        nb.linked = true;
        nb.hop = a.hop + 1;
        q.push(nb);
      }
  }
  if (ward)
    for (const b of ds)
      if (!b.linked) {
        b.linked = true;
        b.hop = 50;
      }
}

export function recomputeNetwork() {
  captureTick(0.4);
  sabotageTick(0.4);
  builderTick();
  G.links = [];
  const deps = Array.from({ length: SEATS }, (): Building[] => []);
  const wasLinked = new Set<number>();
  for (const b of G.buildings) {
    if (b.dead) continue;
    if (isDepot(b)) {
      if (b.linked) wasLinked.add(b.id);
      b.linked = false;
      b.adj = [];
      b.hop = 99;
      deps[b.owner].push(b);
    }
  }
  // first pass: roads cut only by troops and fire, as before
  const guarded: boolean[] = []; // per link: a road ward or a king's highway, nothing cuts it
  for (const p of G.players) {
    if (!p.alive) continue;
    const ds = deps[p.id];
    for (let i = 0; i < ds.length; i++)
      for (let j = i + 1; j < ds.length; j++) {
        const a = ds[i];
        const b = ds[j];
        if (dist(a.x, a.y, b.x, b.y) <= roadLength(p)) {
          const key = linkKey(a, b);
          // a road ward or a king's highway cannot be cut
          const safe = p.wardUntil > G.t || (G.royal.get(key) || 0) > G.t;
          const cut = safe ? null : linkBlocked(a, b, p.id);
          const bl = cut ? cut.blocked : false;
          if (cut && cut.blocked) {
            p.stats.cutSuffer += 0.4;
            if (cut.by >= 0) G.players[cut.by].stats.cutInflict += 0.4;
          }
          G.links.push({ a, b, owner: p.id, blocked: bl, key });
          guarded.push(safe);
          if (!bl) {
            a.adj.push({ nb: b, key });
            b.adj.push({ nb: a, key });
          }
        }
      }
    linkFromCastle(ds, p.wardUntil > G.t);
  }
  // second pass: a road through a hostile kingdom's land is cut too. The land is the one these
  // links would give (the first pass), never last turn's: the result depends on this moment only,
  // so it cannot flicker (cut → land shrinks → open → land grows → cut) from one turn to the next.
  if (!land0 || !land0Dep) {
    land0 = new Int8Array(TILES);
    land0Dep = new Int32Array(TILES);
  }
  claimLand(land0, land0Dep);
  const linked0 = new Set<number>();
  for (const ds of deps) for (const b of ds) if (b.linked) linked0.add(b.id);
  const landBy = new Array(SEATS).fill(-1);
  let anyCut = false;
  for (let i = 0; i < G.links.length; i++) {
    const l = G.links[i];
    if (l.blocked || guarded[i]) continue;
    const by = roadLandCut(l.a, l.b, l.owner, land0);
    if (by < 0) continue;
    l.blocked = true;
    anyCut = true;
    if (landBy[l.owner] < 0) landBy[l.owner] = by;
  }
  if (anyCut) {
    for (const ds of deps) for (const b of ds) b.adj = [];
    for (const l of G.links)
      if (!l.blocked) {
        l.a.adj.push({ nb: l.b, key: l.key });
        l.b.adj.push({ nb: l.a, key: l.key });
      }
    for (const p of G.players) {
      if (!p.alive || landBy[p.id] < 0) continue;
      linkFromCastle(deps[p.id], p.wardUntil > G.t);
      // posts this road cut just took off the network
      let lost = 0;
      for (const b of deps[p.id])
        if (!b.linked && linked0.has(b.id) && wasLinked.has(b.id)) lost++;
      if (lost && G.t > 1)
        notify(
          p.id,
          msg('notice.roadThroughLand', { owner: landBy[p.id], amount: lost }),
        );
    }
  }
  const own = computeTerritory();
  // population stats
  const tl = new Array(SEATS).fill(0);
  const lb = new Array(SEATS).fill(0);
  for (let k = 0; k < TILES; k++) {
    const o = own[k];
    if (o < 0) continue;
    tl[o]++;
    if (depositMap[k]) lb[o] += 0.6;
    else if (terrainMap[k] === Terrain.Forest) lb[o] += 0.15;
  }
  for (const st of sites)
    if (st.owner >= 0) lb[st.owner] += siteWorkers(G.players[st.owner]);
  const ld = new Array(SEATS).fill(0);
  for (let k = 0; k < TILES; k++) {
    const o = own[k];
    if (
      o >= 0 &&
      (terrainMap[k] === Terrain.Plain || terrainMap[k] === Terrain.Forest)
    )
      ld[o]++;
  }
  for (const p of G.players) {
    p.tiles = tl[p.id];
    p.land = ld[p.id] / matchState.landTiles;
    p.cap = 10 + 0.13 * tl[p.id];
    p.labor = Math.max(4, lb[p.id]);
  }
  // supply
  for (const u of G.units) {
    if (u.dead) continue;
    const p = G.players[u.owner];
    let s = false;
    if (p.res.food > 0.01) {
      for (const b of supplyDeps(u.owner, deps)) {
        if (!b.linked || b.dead) continue;
        const R =
          (b.type === 'hq' ? HQ_RADIUS : claimRadius(b)) +
          2 +
          (hasPerk(G.players[u.owner], 'reach') ? 3 : 0);
        if (
          Math.abs(b.x + 0.5 - u.x) <= R &&
          Math.abs(b.y + 0.5 - u.y) <= R &&
          dist(b.x + 0.5, b.y + 0.5, u.x, u.y) <= R
        ) {
          s = true;
          break;
        }
      }
    }
    u.supBy = 0;
    if (!s) {
      for (const w of G.units) {
        if (
          w.dead ||
          w.type !== 'wagon' ||
          w.owner !== u.owner ||
          !w.cargo ||
          w.cargo.food < 0.5
        )
          continue;
        if (Math.abs(w.x - u.x) > WAGON_R || Math.abs(w.y - u.y) > WAGON_R)
          continue;
        if (dist(w.x, w.y, u.x, u.y) <= WAGON_R) {
          s = true;
          u.supBy = w.id;
          break;
        }
      }
    }
    u.supplied = s;
  }
}
