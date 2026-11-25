/** Unit types and the numbers of wagons, bandits and ammunition. */
import type { UnitSpec, UnitType } from '@kingmap-rts/kingsmap-types';

export const UNITS: Record<UnitType, UnitSpec> = {
  inf: {
    hp: 100,
    dmg: 9,
    range: 1.6,
    cd: 0.8,
    speed: 1.35,
    steel: 10,
    wood: 9,
    food: 4,
    upk: 0.035,
    vsC: 1,
    vsB: 1,
    aggro: 3.5,
    ammo: 24,
  },
  wagon: {
    hp: 120,
    dmg: 0,
    range: 0,
    cd: 1,
    speed: 1.2,
    steel: 12,
    wood: 15,
    food: 0,
    pop: 2,
    upk: 0.02,
    vsC: 0,
    vsB: 0,
    aggro: 0,
    ammo: 0,
  },
  siege: {
    hp: 60,
    dmg: 24,
    range: 5,
    cd: 2.5,
    speed: 0.8,
    steel: 20,
    wood: 20,
    food: 4,
    pop: 2,
    upk: 0.04,
    vsC: 0.5,
    vsB: 3,
    vsU: 0.5,
    aggro: 5.5,
    ammo: 8,
    ammoCost: 0.5,
    deploy: 2,
  },
  builder: {
    hp: 90,
    dmg: 0,
    range: 0,
    cd: 1,
    speed: 1.45,
    steel: 6,
    wood: 14,
    food: 2,
    upk: 0.02,
    vsC: 0,
    vsB: 0,
    aggro: 0,
    ammo: 0,
    doc: 'guild',
  },
  arsonist: {
    hp: 60,
    dmg: 4,
    range: 1.3,
    cd: 0.8,
    speed: 2.2,
    steel: 8,
    wood: 10,
    food: 4,
    upk: 0.04,
    vsC: 2,
    vsB: 0.3,
    aggro: 2.5,
    ammo: 12,
    doc: 'shadow',
  },
  golem: {
    hp: 320,
    dmg: 16,
    range: 1.5,
    cd: 1.2,
    speed: 0.75,
    steel: 28,
    wood: 12,
    food: 0,
    pop: 2,
    upk: 0.03,
    vsC: 1,
    vsB: 3,
    aggro: 3,
    ammo: 0,
    noAmmo: true,
    doc: 'forge',
  },
  militia: {
    hp: 80,
    dmg: 7,
    range: 1.4,
    cd: 0.8,
    speed: 1.3,
    steel: 0,
    wood: 7,
    food: 3,
    upk: 0.03,
    vsC: 1,
    vsB: 0.8,
    aggro: 3,
    ammo: 20,
  },
  raid: {
    hp: 65,
    dmg: 7,
    range: 1.5,
    cd: 0.6,
    speed: 2.7,
    steel: 10,
    wood: 14,
    food: 5,
    upk: 0.05,
    vsC: 3,
    vsB: 0.4,
    vsU: 0.8,
    aggro: 4,
    ammo: 30,
  },
};

export const WAGON_CAP = 30;

export const WAGON_R = 4;

export const WAGON_LOAD = 10;

export const WAGON_FOOD = 0.02;

export const BAG_CAP = 20;

export const PLUNDER_RATE = 5;

export const AMMO_COST = 0.08;

// A squad is ONE unit that stands for several soldiers of one type (5 light or 3 heavy): it walks, fights and
// is ordered as one; its health is the soldiers' health added up and its blows are as strong as the soldiers
// still standing. The map draws each soldier. Free soldiers of one type that stand idle near each other walk
// together and merge; recruits top up an unfinished squad. 'unsquad' splits it back, and those soldiers stay
// single until the player groups them again.
export const HEAVY_UNITS = new Set<UnitType>(['siege', 'golem', 'wagon']);
