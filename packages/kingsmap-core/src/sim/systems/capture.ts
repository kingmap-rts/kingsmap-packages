/**
 * Capturing posts. A post cut off from its castle falls to enemy troops (any but raiders) that stand
 * next to it alone for CAPTURE_TIME. A post still linked (a store, a forge, barracks) falls only to foot soldiers
 * ordered to capture it (the `capture` intent), after CAPTURE_HOLD_TIME. A fort is taken only when
 * cut off; the castle never. Raiders never take a post nor help to (KAN-31): they plunder it.
 * Capturing never damages the post.
 */
import type { Building, UnitType } from '../world/types';
import { COLORS } from '../config/map';
import {
  CAPTURE_HOLD_TIME,
  CAPTURE_R,
  CAPTURE_TIME,
  CAPTURERS,
  NON_CAPTURERS,
} from '../config/network';
import { G } from '../state';
import { hostile } from './diplomacy';
import { dist } from '../util/geometry';
import { goodsTotal } from '../util/resources';
import { logEvent, msg, notify } from '../world/events';

/** a unit that can take a linked post: a foot soldier */
export const capturer = (u: { type: UnitType }) => CAPTURERS.includes(u.type);

/** can this unit take post b (or help to): a linked post needs a foot soldier, a cut-off one anyone but a raider */
export const takesPost = (b: Building, u: { type: UnitType }) =>
  b.linked ? capturer(u) : !NON_CAPTURERS.includes(u.type);

/** a post that can be taken at all (who may take it: canCapture): never the castle, a fort only when cut off */
export const takeable = (b: Building) =>
  b.type === 'depot' && (!b.linked || b.spec !== 'fort');

/**
 * can these units be ordered to take post b (whoever owns it): a linked one needs a foot soldier, a
 * cut-off one anyone but raiders (raiders alone are refused, among other troops they just go along)
 */
export const canCapture = (b: Building, units: readonly { type: UnitType }[]) =>
  takeable(b) && units.some(u => takesPost(b, u));

/** seconds post b holds out against its captors */
export const captureTime = (b: Building) =>
  b.linked ? CAPTURE_HOLD_TIME : CAPTURE_TIME;

export function capture(b: Building, pid: number) {
  const old = b.owner;
  b.owner = pid;
  b.cap = 0;
  b.capBy = -1;
  G.players[pid].stats.captures++;
  G.players[old].stats.capturedFrom++;
  logEvent('capture', pid, { v: old, spec: b.spec });
  b.hp = Math.max(b.hp, b.maxhp * 0.5);
  G.fx.push({
    x: b.x + 0.5,
    y: b.y + 0.5,
    t: 0,
    dur: 1,
    r: 1.8,
    color: COLORS[pid],
  });
  const loot = Math.floor(goodsTotal(b.stock));
  if (G.players[old].spawn === b.id) G.players[old].spawn = null;
  const building = b.spec ?? b.type;
  notify(
    pid,
    loot
      ? msg('notice.capturedLoot', { building, amount: loot })
      : msg('notice.captured', { building }),
  );
  notify(old, msg('notice.postTaken', { building }));
}

export function captureTick(dt: number) {
  for (const b of G.buildings) {
    if (b.dead || b.type !== 'depot') continue;
    if (!takeable(b)) {
      b.cap = 0;
      b.capBy = -1;
      continue;
    }
    // a linked post: only foot soldiers under the order to take it count (others pass by)
    const held = b.linked;
    let foe = -1;
    let mixed = false;
    let defended = false;
    for (const u of G.units) {
      if (u.dead) continue;
      if (
        Math.abs(u.x - b.x - 0.5) > CAPTURE_R ||
        Math.abs(u.y - b.y - 0.5) > CAPTURE_R
      )
        continue;
      if (dist(u.x, u.y, b.x + 0.5, b.y + 0.5) > CAPTURE_R) continue;
      if (u.owner === b.owner) {
        defended = true;
        break;
      }
      if (!hostile(b.owner, u.owner)) continue;
      // raiders never count; a linked post only foot soldiers under the order to take it
      if (!takesPost(b, u) || (held && u.capB !== b.id)) continue;
      if (foe === -1) foe = u.owner;
      else if (foe !== u.owner) mixed = true;
    }
    if (defended || mixed || foe < 0) {
      b.cap = Math.max(0, b.cap - dt);
      continue;
    }
    if (b.capBy !== foe) {
      b.capBy = foe;
      b.cap = 0;
    }
    b.cap += dt;
    if (b.cap >= captureTime(b)) capture(b, foe);
  }
}
