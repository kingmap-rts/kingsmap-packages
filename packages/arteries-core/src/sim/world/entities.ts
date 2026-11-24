/** Creating buildings, units and caravans, and small queries about them. */
import type {
  Bag,
  Building,
  BuildingType,
  Convoy,
  Entity,
  Unit,
  UnitType,
} from './types';
import { BUILDINGS, POST_SPECS } from '../config/buildings';
import { UNITS } from '../config/units';
import { hasPerk } from '../modifiers';
import { G } from '../state';
import { dist, tileIndex } from '../util/geometry';
import { dominantResource, goodsTotal } from '../util/resources';
import { rand } from '../util/rng';

export const linkKey = (a: { id: number }, b: { id: number }) =>
  a.id < b.id ? a.id + '_' + b.id : b.id + '_' + a.id;

export function addBuilding(
  type: BuildingType,
  owner: number,
  x: number,
  y: number,
) {
  const b: Building = {
    id: G.nextId++,
    kind: 'b',
    type,
    owner,
    x,
    y,
    hp: BUILDINGS[type].hp,
    maxhp: BUILDINGS[type].hp,
    spec: null,
    stock: { wood: 0, ore: 0, steel: 0, food: 0, crystal: 0 },
    yld: { wood: 0, ore: 0, steel: 0, food: 0, crystal: 0 },
    hop: 99,
    adj: [],
    idle: 0,
    sendT: 0,
    cap: 0,
    capBy: -1,
    cd: 0,
    linked: false,
    lastHit: -9,
  };
  G.buildings.push(b);
  G.byId.set(b.id, b);
  G.bAt[tileIndex(x, y)] = b.id;
  return b;
}

export function addUnit(type: UnitType, owner: number, x: number, y: number) {
  const S = UNITS[type];
  const u: Unit = {
    id: G.nextId++,
    kind: 'u',
    type,
    owner,
    x,
    y,
    hp: S.hp,
    maxhp: S.hp,
    mhp: S.hp, // set below, after perks
    ammo: S.ammo,
    bag: null,
    cargo: type === 'wagon' ? { steel: 0, food: 0 } : null,
    deployT: 0,
    supBy: 0,
    mv: 0,
    n: 1,
    joinTo: 0,
    cd: 0,
    scan: rand() * 0.3,
    path: null,
    tgt: 0,
    ftgt: 0,
    dest: null,
    repath: 0,
    supplied: true,
    lastHit: -9,
    job: null,
    jobUntil: 0,
    ang: 0,
  };
  if (type === 'raid' && hasPerk(G.players[owner], 'tough')) {
    u.hp *= 1.25;
    u.maxhp *= 1.25;
  }
  if (type !== 'wagon' && hasPerk(G.players[owner], 'drill')) {
    u.hp *= 1.1;
    u.maxhp *= 1.1;
  }
  u.mhp = u.maxhp;
  if (S.ammo && hasPerk(G.players[owner], 'ammo')) u.ammo = S.ammo * 1.5;
  G.units.push(u);
  G.byId.set(u.id, u);
  return u;
}

export function addConvoy(from: Building, to: Building, cargo: Bag) {
  const c: Convoy = {
    id: G.nextId++,
    kind: 'c',
    owner: from.owner,
    x: from.x + 0.5,
    y: from.y + 0.5,
    cargo,
    res: dominantResource(cargo),
    hp: 30,
    maxhp: 30,
    to: to.id,
    lastHit: -9,
  };
  G.convoys.push(c);
  G.byId.set(c.id, c);
  return c;
}

export const isDepot = (b: Building) => b.type === 'hq' || b.type === 'depot';

export const canHire = (b: Building) =>
  b.type === 'hq' || b.spec === 'barracks';

export const buildingIcon = (b: Building) =>
  b.spec ? POST_SPECS[b.spec].icon : BUILDINGS[b.type].icon;

export const centerX = (e: Entity) => (e.kind === 'b' ? e.x + 0.5 : e.x);

export const centerY = (e: Entity) => (e.kind === 'b' ? e.y + 0.5 : e.y);

export function nearestLinkedDepot(owner: number, x: number, y: number) {
  let best = null;
  let bd = 1e9;
  for (const b of G.buildings) {
    if (b.dead || b.owner !== owner || !isDepot(b) || !b.linked) continue;
    const d = dist(b.x, b.y, x, y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

export const wagonLoad = (u: Unit) =>
  u.cargo ? u.cargo.steel + u.cargo.food : 0;

export function lootCarried(u: Unit) {
  return u.bag ? goodsTotal(u.bag) : 0;
}

export function nearest<T extends Entity>(
  list: T[],
  x: number,
  y: number,
  r: number,
): T | null {
  let best: T | null = null;
  let bd = r;
  for (const e of list) {
    const d = dist(centerX(e), centerY(e), x, y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}
