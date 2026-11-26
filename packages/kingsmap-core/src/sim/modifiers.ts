/** Numbers changed by paths and perks (radii, costs, speeds, capacities). */
import type {
  Building,
  BuildingType,
  Convoy,
  PerkId,
  Player,
  Resource,
  Unit,
  UnitType,
} from './world/types';
import { BUILDINGS, SITE_WORKERS } from './config/buildings';
import { CONVOY_CAP } from './config/economy';
import { POST_RADIUS, ROAD_LEN, BURN_TIME, ARSON_TIME } from './config/network';
import { PERKS } from './config/paths';
import { UNITS } from './config/units';
import { G } from './state';

export const hasPerk = (p: Player | null | undefined, id: PerkId) =>
  !!p && p.perks && p.perks.includes(id);

/** the realm's ability: the one tier-5 node it took */
export const ultimateOf = (p: Player): PerkId | null =>
  (p && p.perks && p.perks.find(id => PERKS[id].ult)) || null;

/** may the realm hire this unit: ordinary units always, a path's own unit once its node is taken */
export const unitUnlocked = (p: Player, type: UnitType) =>
  !UNITS[type].doc || p.perks.some(id => PERKS[id].unit === type);

export const roadLength = (p: Player | null | undefined) =>
  ROAD_LEN + (hasPerk(p, 'longroads') ? 2 : 0);

export const claimRadius = (b: Building) =>
  POST_RADIUS +
  (hasPerk(G.players[b.owner], 'claim') ? 1 : 0) +
  (b.rBonus || 0);

export const siteWorkers = (p: Player) =>
  hasPerk(p, 'labor') ? 2 : SITE_WORKERS;

export const arsonTime = (att: Player) =>
  hasPerk(att, 'arson') ? 4 : ARSON_TIME;

export const burnTime = (att: Player) =>
  hasPerk(att, 'burn60') ? 60 : BURN_TIME;

export const forgeBonus = (p: Player) => (hasPerk(p, 'bellows') ? 1.6 : 1);

export const yieldBonus = (p: Player, k: Resource) =>
  (k === 'food' && hasPerk(p, 'bread') ? 1.25 : 1) *
  (hasPerk(p, 'harvest') ? 1.1 : 1);

export const convoyCap = (p: Player) => (hasPerk(p, 'carav') ? 11 : CONVOY_CAP);

export const convoySpeed = (c: Convoy) =>
  (hasPerk(G.players[c.owner], 'carav') ? 1.4 : 1) *
  (hasPerk(G.players[c.owner], 'pace') ? 1.15 : 1) *
  (c.key && (G.royal.get(c.key) || 0) > G.t ? 2 : 1);

export const deployTime = (u: Unit) =>
  hasPerk(G.players[u.owner], 'deploy') ? 1 : (UNITS[u.type].deploy ?? 0);

export const ammoMax = (u: Unit) =>
  UNITS[u.type].ammo * (hasPerk(G.players[u.owner], 'ammo') ? 1.5 : 1);

export function buildCost(p: Player, type: BuildingType) {
  const c = BUILDINGS[type];
  return hasPerk(p, 'cheap')
    ? { wood: c.wood! * 0.7, steel: c.steel! * 0.7 }
    : c;
}

export function unitCost(p: Player, type: UnitType) {
  const S = UNITS[type];
  if (type === 'siege' && hasPerk(p, 'cheapsiege'))
    return {
      steel: S.steel * 0.75,
      wood: S.wood * 0.75,
      food: S.food,
      pop: S.pop,
    };
  return S;
}
