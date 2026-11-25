// The shapes of the rule tables (the numbers live in @kingmap-rts/kingsmap-core → rules).
import type {
  BranchId,
  PathId,
  PerkId,
  Resource,
  UnitType,
} from './vocabulary';

export interface UnitSpec {
  hp: number;
  dmg: number;
  range: number;
  /** seconds between blows */
  cd: number;
  speed: number;
  steel: number;
  wood: number;
  food: number;
  /** people it takes (default 1) */
  pop?: number;
  /** food eaten per second */
  upk: number;
  /** damage multipliers against caravans, buildings and units */
  vsC: number;
  vsB: number;
  vsU?: number;
  /** distance at which it notices enemies */
  aggro: number;
  /** arrows carried */
  ammo: number;
  /** steel per arrow (default AMMO_COST) */
  ammoCost?: number;
  /** fights without arrows */
  noAmmo?: boolean;
  /** seconds standing still before it can fire */
  deploy?: number;
  /** only for this path */
  doc?: PathId;
}

export interface BuildingSpec {
  hp: number;
  icon: string;
  wood?: number;
  steel?: number;
}

export interface SpecSpec {
  icon: string;
  wood: number;
  steel: number;
}

export interface SiteSpec {
  icon: string;
  res: Resource;
  /** production per second */
  y: number;
}

export interface PathSpec {
  /** unique unit of the path (unlocked by one node of its branch); none: that node is a boon */
  unit?: UnitType;
}

/** a node of the skill tree */
export interface PerkSpec {
  branch: BranchId;
  /** its row in the branch: 1 = the root, 5 = the abilities */
  tier: number;
  /** one of these must be taken first; none: open from the start */
  req?: PerkId[];
  /** unlocks this unit for hire */
  unit?: UnitType;
  /** an ability used with cast; a realm takes only one */
  ult?: 1;
}
