/**
 * FNV-1a hash over every value that affects the simulation (not visuals). Clients compare it
 * every few seconds to detect desyncs; match statistics store it to verify a re-simulation.
 * Changing what goes in here changes every hash: old match statistics stop verifying.
 */
import { PATHS } from './config/paths';
import { RESOURCES } from './config/economy';
import { G, matchState } from './state';

const PATH_IDS = Object.keys(PATHS);

export function stateHash(): string {
  const f = new Float64Array(1);
  const b = new Uint8Array(f.buffer);
  let h = 0x811c9dc5;
  const num = (v: number) => {
    f[0] = v;
    for (let i = 0; i < 8; i++) {
      h ^= b[i];
      h = Math.imul(h, 0x01000193);
    }
  };
  num(G.t);
  num(matchState.rng);
  for (const p of G.players) {
    num(p.alive ? 1 : 0);
    for (const k of RESOURCES) num(p.res[k]);
    num(p.pop);
    num(p.doc ? 1 + PATH_IDS.indexOf(p.doc) : 0);
    num(p.perks.length);
    num(p.ultCd);
    num(p.wardUntil);
  }
  num(G.traps.size);
  num(G.zones.length);
  num(G.royal.size);
  for (const x of G.pacts) {
    num(x.a);
    num(x.b);
    num(x.until);
  }
  num(G.reqs.length);
  for (const p of G.players) num(p.traitorUntil);
  for (const u of G.units) {
    num(u.id);
    num(u.x);
    num(u.y);
    num(u.hp);
    num(u.ammo);
    num(u.n || 1);
    num(u.joinTo || 0);
    num(u.solo ? 1 : 0);
  }
  for (const bl of G.buildings) {
    num(bl.id);
    num(bl.owner);
    num(bl.hp);
    num(bl.linked ? 1 : 0);
  }
  for (const c of G.convoys) {
    num(c.id);
    num(c.x);
    num(c.y);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
