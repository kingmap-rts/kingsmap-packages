/** Mending buildings: builders standing by them, and (repair crews) buildings left alone. */
import {
  BUILDER_REPAIR,
  REPAIR_CALM,
  REPAIR_CREW_MAX,
  REPAIR_R,
  REPAIR_SELF,
} from '../config/buildings';
import { hasPerk } from '../modifiers';
import { G } from '../state';
import { dist } from '../util/geometry';

/** health a second a building gets back now: from the builders by it, and on its own with repair crews */
export function repairRate(
  bx: number,
  by: number,
  owner: number,
  calm: boolean,
) {
  const crews = hasPerk(G.players[owner], 'repair');
  let n = 0;
  for (const u of G.units) {
    if (u.dead || u.type !== 'builder' || u.owner !== owner || u.mv) continue;
    if (
      Math.abs(u.x - bx) <= REPAIR_R &&
      Math.abs(u.y - by) <= REPAIR_R &&
      dist(u.x, u.y, bx, by) <= REPAIR_R
    )
      if (++n >= REPAIR_CREW_MAX) break;
  }
  return (
    n * BUILDER_REPAIR * (crews ? 2 : 1) + (crews && calm ? REPAIR_SELF : 0)
  );
}

export function repairTick(dt: number) {
  for (const b of G.buildings) {
    if (b.dead || b.hp >= b.maxhp || b.owner < 0) continue;
    const r = repairRate(
      b.x + 0.5,
      b.y + 0.5,
      b.owner,
      G.t - b.lastHit > REPAIR_CALM,
    );
    if (r > 0) b.hp = Math.min(b.maxhp, b.hp + r * dt);
  }
}
