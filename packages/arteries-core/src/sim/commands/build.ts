/** Building posts, specialising them and hiring troops. */
import type {
  Building,
  BuildingType,
  Cost,
  GameMessage,
  Player,
  SpecType,
  Unit,
  UnitType,
} from '../world/types';
import { POST_SPECS } from '../config/buildings';
import { COLORS } from '../config/map';
import { UNITS } from '../config/units';
import {
  buildCost,
  hasPerk,
  roadLength,
  unitCost,
  unitUnlocked,
} from '../modifiers';
import { G, siteAt, sites } from '../state';
import { hostile } from '../systems/diplomacy';
import { SPIRAL } from '../systems/movement';
import { dist, tileIndex, inBounds } from '../util/geometry';
import { rand } from '../util/rng';
import { addBuilding, addUnit, canHire, isDepot } from '../world/entities';
import { logEvent, msg } from '../world/events';
import { walkable } from '../world/terrain';

export function canAfford(p: Player, c: Cost) {
  return (
    p.res.wood >= (c.wood || 0) &&
    p.res.steel >= (c.steel || 0) &&
    p.res.food >= (c.food || 0)
  );
}

export function pay(p: Player, c: Cost) {
  p.res.wood -= c.wood || 0;
  p.res.steel -= c.steel || 0;
  p.res.food -= c.food || 0;
}

export function buildCheck(
  p: Player,
  type: BuildingType,
  x: number,
  y: number,
): GameMessage | null {
  if (!inBounds(x, y)) return msg('error.offMap');
  const k = tileIndex(x, y);
  if (!walkable(x, y)) return msg('error.notBuildable');
  if (G.bAt[k] !== -1) return msg('error.tileTaken');
  if (siteAt[k] >= 0)
    return msg('error.siteHere', { site: sites[siteAt[k]].type });
  if (G.own[k] !== -1 && G.own[k] !== p.id)
    return hostile(p.id, G.own[k])
      ? msg('error.enemyLand')
      : msg('error.allyLand');
  let ok = false;
  let tooClose = false;
  for (const b of G.buildings) {
    if (b.dead || b.owner !== p.id || !isDepot(b)) continue;
    const d = dist(b.x, b.y, x, y);
    if (d < 3) tooClose = true;
    if (b.linked && d <= roadLength(p)) ok = true;
  }
  if (tooClose) return msg('error.tooClose');
  if (!ok) return msg('error.tooFar', { max: roadLength(p) });
  if (!canAfford(p, buildCost(p, type))) return msg('error.noResources');
  if (p.pop < 3) return msg('error.noSettlers');
  return null;
}

export function build(
  p: Player,
  type: BuildingType,
  x: number,
  y: number,
): GameMessage | null {
  const e = buildCheck(p, type, x, y);
  if (e) return e;
  pay(p, buildCost(p, type));
  p.pop -= 3;
  p.stats.built++;
  logEvent('build', p.id, { x, y });
  const b = addBuilding(type, p.id, x, y);
  G.netT = 0;
  b.linked = true;
  return null;
}

export function specialize(
  p: Player,
  b: Building | undefined,
  s: SpecType,
): GameMessage | null {
  if (!b || b.dead || b.owner !== p.id || b.type !== 'depot' || b.spec)
    return msg('error.notAllowed');
  if (!b.linked) return msg('error.postCut');
  if (!canAfford(p, POST_SPECS[s])) return msg('error.noResources');
  pay(p, POST_SPECS[s]);
  b.spec = s;
  p.stats.specs++;
  p.stats[s]++;
  logEvent('spec', p.id, { s });
  if (s === 'fort') {
    const m = hasPerk(p, 'walls') ? 1.3 : 1;
    b.maxhp = 700 * m;
    b.hp += 700 * m - 320;
  }
  G.fx.push({
    x: b.x + 0.5,
    y: b.y + 0.5,
    t: 0,
    dur: 0.8,
    r: 1.3,
    color: COLORS[p.id],
  });
  G.netT = 0;
  return null;
}

export function train(
  p: Player,
  type: UnitType,
  at: Building | null | undefined,
): Unit | GameMessage {
  const S = UNITS[type];
  if (!unitUnlocked(p, type)) return msg('error.otherPath');
  const cost = unitCost(p, type);
  if (!canAfford(p, cost)) return msg('error.noResources');
  if (p.pop < (S.pop || 1)) return msg('error.noPeople');
  const d =
    at && !at.dead && at.linked && at.owner === p.id && canHire(at) ? at : p.hq;
  if (!d || d.dead) return msg('error.noCastle');
  for (const [dx, dy] of SPIRAL.slice(1)) {
    const x = d.x + dx;
    const y = d.y + dy;
    if (walkable(x, y) && G.bAt[tileIndex(x, y)] === -1) {
      pay(p, cost);
      p.pop -= S.pop || 1;
      p.stats.hired++;
      return addUnit(
        type,
        p.id,
        x + 0.3 + rand() * 0.4,
        y + 0.3 + rand() * 0.4,
      );
    }
  }
  return msg('error.noRoom');
}
