/** Choosing a path, buying tiers and casting the ultimate. */
import { Color } from '@kingmap-rts/kingsmap-types';
import type { GameMessage, PathId, PerkId, Player } from '../world/types';
import { COLORS, SEATS } from '../config/map';
import { PATH_ROOT, PERKS, ULT_COOLDOWN, nodeCost } from '../config/paths';
import { ultimateOf } from '../modifiers';
import { G } from '../state';
import { hit } from './combat';
import { hostile } from './diplomacy';
import { dist, segmentDist } from '../util/geometry';
import { rand } from '../util/rng';
import { addUnit, canHire, isDepot, nearest } from '../world/entities';
import { logEvent, msg, notify } from '../world/events';
import { spend } from '../ledger';

export function fireRainTick(dt: number) {
  if (!G.zones.length) return;
  for (const z of G.zones) {
    for (const b of G.buildings) {
      if (b.dead || !hostile(z.owner, b.owner)) continue;
      if (dist(b.x + 0.5, b.y + 0.5, z.x, z.y) <= z.r)
        hit(b, 20 * dt, z.owner, z.x, z.y - 3);
    }
    for (const u of G.units) {
      if (u.dead || !hostile(z.owner, u.owner)) continue;
      if (
        Math.abs(u.x - z.x) <= z.r &&
        Math.abs(u.y - z.y) <= z.r &&
        dist(u.x, u.y, z.x, z.y) <= z.r
      )
        hit(u, 6 * dt, z.owner, z.x, z.y - 3);
    }
    if (rand() < dt * 6)
      G.fx.push({
        x: z.x + (rand() - 0.5) * z.r * 1.6,
        y: z.y + (rand() - 0.5) * z.r * 1.6,
        t: 0,
        dur: 0.6,
        r: 0.8,
        color: Color.Blast,
      });
  }
  G.zones = G.zones.filter(z => z.until > G.t);
}

/** why a node cannot be bought now, or null when it can */
export function nodeRefusal(p: Player, id: PerkId): GameMessage | null {
  const n = PERKS[id];
  if (!n) return msg('error.noSuchPerk');
  if (p.perks.includes(id)) return msg('error.perkTaken');
  if (n.req && !n.req.some(r => p.perks.includes(r)))
    return msg('error.perkLocked', { perk: n.req[0] });
  if (n.ult) {
    const has = ultimateOf(p);
    if (has) return msg('error.oneAbility', { perk: has });
  }
  const cost = nodeCost(p.perks.length);
  if (p.res.crystal < cost) return msg('error.needMana', { amount: cost });
  return null;
}

/** buy a node of the skill tree */
export function pickPerk(p: Player, id: PerkId): GameMessage | null {
  const no = nodeRefusal(p, id);
  if (no) return no;
  const n = PERKS[id];
  p.res.crystal -= nodeCost(p.perks.length);
  spend(p.id, 'crystal', 'perk', nodeCost(p.perks.length));
  p.perks.push(id);
  logEvent('perk', p.id, { id });
  // the first step on a path names the realm's path for everyone
  if (n.branch !== 'trunk' && !p.doc) {
    const d = n.branch;
    p.doc = d;
    p.stats.docAt = Math.round(G.t);
    logEvent('doctrine', p.id, { d });
    for (let i = 0; i < SEATS; i++)
      notify(
        i,
        i === p.id
          ? msg('notice.pathChosenYou', { path: d })
          : msg('notice.pathChosen', { player: p.id, path: d }),
      );
  }
  if (id === 'walls')
    for (const b of G.buildings)
      if (
        !b.dead &&
        b.owner === p.id &&
        (b.type === 'hq' || b.spec === 'fort')
      ) {
        b.maxhp *= 1.3;
        b.hp *= 1.3;
      }
  G.netT = 0;
  return null;
}

/** the old intent: step onto a path = buy its root */
export function choosePath(p: Player, d: PathId): GameMessage | null {
  if (!PATH_ROOT[d]) return msg('error.noSuchPath');
  return pickPerk(p, PATH_ROOT[d]);
}

export function cast(p: Player, x: number, y: number): GameMessage | null {
  const id = ultimateOf(p);
  if (!id) return msg('error.noUltimate');
  if (p.ultCd > G.t)
    return msg('error.recharging', { seconds: Math.ceil(p.ultCd - G.t) });
  const mine = G.buildings.filter(
    b => !b.dead && b.owner === p.id && isDepot(b),
  );
  switch (id) {
    case 'ward':
      p.wardUntil = G.t + 30;
      G.netT = 0;
      break;
    case 'road': {
      let best = null;
      let bd = 3.5;
      for (const l of G.links) {
        if (l.owner !== p.id) continue;
        const d = segmentDist(
          x,
          y,
          l.a.x + 0.5,
          l.a.y + 0.5,
          l.b.x + 0.5,
          l.b.y + 0.5,
        );
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      if (!best) return msg('error.tapOwnRoad');
      G.royal.set(best.key, G.t + 120);
      G.sab.delete(best.key);
      G.netT = 0;
      break;
    }
    case 'panic': {
      const b = nearest(
        G.buildings.filter(
          b => !b.dead && hostile(p.id, b.owner) && b.type === 'depot',
        ),
        x,
        y,
        3.5,
      );
      if (!b) return msg('error.tapEnemyPost');
      b.panicUntil = G.t + 45;
      break;
    }
    case 'night': {
      let n = 0;
      for (const l of G.links) {
        if (!hostile(p.id, l.owner)) continue;
        const mx = (l.a.x + l.b.x) / 2 + 0.5;
        const my = (l.a.y + l.b.y) / 2 + 0.5;
        if (dist(mx, my, x, y) <= 8) {
          G.sab.set(l.key, Math.max(G.sab.get(l.key) || 0, G.t + 20));
          n++;
        }
      }
      if (!n) return msg('error.noEnemyRoads');
      G.netT = 0;
      break;
    }
    case 'rain':
      G.zones.push({ x, y, r: 3, until: G.t + 10, owner: p.id });
      break;
    case 'rally': {
      const at = nearest(
        mine.filter(b => canHire(b) && b.linked),
        x,
        y,
        1e9,
      );
      if (!at) return msg('error.noCastleOrTower');
      for (let i = 0; i < 8; i++)
        addUnit(
          'inf',
          p.id,
          at.x + 0.5 + (rand() - 0.5) * 2,
          at.y + 1.4 + (rand() - 0.5) * 1.2,
        );
      break;
    }
    case 'pitch': {
      const at = nearest(
        mine.filter(b => b.linked),
        x,
        y,
        1e9,
      );
      if (!at) return msg('error.noPosts');
      for (let i = 0; i < 6; i++) {
        const u = addUnit(
          'militia',
          p.id,
          at.x + 0.5 + (rand() - 0.5) * 2,
          at.y + 1.4 + (rand() - 0.5) * 1.2,
        );
        u.expire = G.t + 60;
      }
      break;
    }
    case 'charter': {
      const b = nearest(
        mine.filter(b => b.type === 'depot' && !b.rBonus),
        x,
        y,
        3.5,
      );
      if (!b) return msg('error.tapPostWithoutCharter');
      b.rBonus = 3;
      G.netT = 0;
      break;
    }
  }
  p.ultCd = G.t + ULT_COOLDOWN;
  p.stats.casts++;
  logEvent('cast', p.id, { id });
  G.fx.push({ x, y, t: 0, dur: 1, r: 2, color: COLORS[p.id] });
  return null;
}
