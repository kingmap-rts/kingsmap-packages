/** The skill tree: its nodes, what each needs, their price and the ability's cooldown. */
import type {
  BranchId,
  PathId,
  PathSpec,
  PerkId,
  PerkSpec,
} from '@kingmap-rts/kingsmap-types';

// Bought with mana, one node at a time. A shared trunk open to all, and four branches - the paths -
// each: its root (the trait), two boons, the node of its own unit, two more boons and two
// abilities. Every node needs one of the nodes above it; a realm takes only one ability.

/** the price of the next node: grows with every node a realm already has */
export const NODE_COST_BASE = 2;
export const NODE_COST_STEP = 1;
export const nodeCost = (taken: number) =>
  NODE_COST_BASE + NODE_COST_STEP * taken;

/** the price of the first nodes, as before the tree (kept for the client's old screens) */
export const PATH_COST: number[] = [0, 1, 2, 3].map(nodeCost);

export const ULT_COOLDOWN = 180;

/** each path's own unit */
export const PATHS: Record<PathId, PathSpec> = {
  guild: { unit: 'builder' },
  shadow: { unit: 'arsonist' },
  forge: { unit: 'golem' },
  land: { unit: 'militia' },
};

/** the branches in the order the tree is drawn */
export const BRANCHES: BranchId[] = [
  'trunk',
  'guild',
  'shadow',
  'forge',
  'land',
];

/** a path's nodes, top to bottom: root, two boons, its unit, two boons, two abilities */
function branch(
  b: PathId,
  root: PerkId,
  t2: [PerkId, PerkId],
  unit: PerkId,
  t4: [PerkId, PerkId],
  t5: [PerkId, PerkId],
): Partial<Record<PerkId, PerkSpec>> {
  return {
    [root]: { branch: b, tier: 1 },
    [t2[0]]: { branch: b, tier: 2, req: [root] },
    [t2[1]]: { branch: b, tier: 2, req: [root] },
    [unit]: { branch: b, tier: 3, req: t2, unit: PATHS[b].unit },
    [t4[0]]: { branch: b, tier: 4, req: [unit] },
    [t4[1]]: { branch: b, tier: 4, req: [unit] },
    [t5[0]]: { branch: b, tier: 5, req: t4, ult: 1 },
    [t5[1]]: { branch: b, tier: 5, req: t4, ult: 1 },
  };
}

export const PERKS = {
  harvest: { branch: 'trunk', tier: 1 },
  pace: { branch: 'trunk', tier: 1 },
  drill: { branch: 'trunk', tier: 1 },
  ...branch(
    'guild',
    'longroads',
    ['carav', 'cheap'],
    'wrights',
    ['repair', 'reach'],
    ['ward', 'road'],
  ),
  ...branch(
    'shadow',
    'arson',
    ['burn60', 'tough'],
    'firebugs',
    ['bag', 'scorch'],
    ['panic', 'night'],
  ),
  ...branch(
    'forge',
    'bellows',
    ['cheapsiege', 'deploy'],
    'golems',
    ['ammo', 'walls'],
    ['rain', 'rally'],
  ),
  ...branch(
    'land',
    'claim',
    ['bread', 'growth'],
    'levies',
    ['labor', 'granary'],
    ['pitch', 'charter'],
  ),
} as Record<PerkId, PerkSpec>;

/** every node id, in a fixed order */
export const PERK_IDS = Object.keys(PERKS) as PerkId[];

/** each path's root node */
export const PATH_ROOT: Record<PathId, PerkId> = {
  guild: 'longroads',
  shadow: 'arson',
  forge: 'bellows',
  land: 'claim',
};
