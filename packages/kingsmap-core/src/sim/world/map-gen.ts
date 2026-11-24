/** Map generation: terrain, start positions, deposits, mana fields and production sites. */
import type { SiteType, Tile } from './types';
import {
  CENTRE_OVAL,
  Deposit,
  MAP_H,
  MAP_W,
  SEATS,
  TILES,
  Terrain,
} from '../config/map';
import {
  matchState,
  crystalFields,
  depositMap,
  siteAt,
  sites,
  terrainMap,
} from '../state';
import { dist, tileIndex, detCos, detSin, inBounds } from '../util/geometry';
import { fbm } from '../util/noise';
import { randomInt, rand } from '../util/rng';
import { walkable } from './terrain';

/** 0 in the middle of the map, 1 at the middle of an edge: an oval that follows the map's shape */
export const centreDist = (x: number, y: number) =>
  Math.hypot((x - MAP_W / 2) / (MAP_W / 2), (y - MAP_H / 2) / (MAP_H / 2));

export function genMap() {
  const s = matchState.seed % 10000;
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const h = fbm(x / 10, y / 10, s);
      const f = fbm(x / 6 + 50, y / 6 + 50, s + 7);
      let t: Terrain = Terrain.Plain;
      if (h < 0.37) t = Terrain.Water;
      else if (h > 0.66) t = Terrain.Mountain;
      else if (f > 0.56) t = Terrain.Forest;
      terrainMap[tileIndex(x, y)] = t;
      depositMap[tileIndex(x, y)] = 0;
    }
  const cx = MAP_W >> 1;
  const cy = MAP_H >> 1;
  const a0 = rand() * Math.PI * 2;
  const starts: Tile[] = [];
  for (let i = 0; i < SEATS; i++) {
    const a = a0 + (i * Math.PI * 2) / SEATS + (rand() - 0.5) * 0.12;
    starts.push([
      Math.round(cx + detCos(a) * (cx - 9)),
      Math.round(cy + detSin(a) * (cy - 8)),
    ]);
  }
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.ceil(dist(x0, y0, x1, y1));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx;
          const Y = y + dy;
          if (
            inBounds(X, Y) &&
            (terrainMap[tileIndex(X, Y)] === Terrain.Water ||
              terrainMap[tileIndex(X, Y)] === Terrain.Mountain)
          )
            terrainMap[tileIndex(X, Y)] = Terrain.Plain;
        }
    }
  };
  for (const [sx, sy] of starts) carve(sx, sy, cx, cy);
  for (let i = 0; i < SEATS; i++) {
    const a = starts[i];
    const b = starts[(i + 1) % SEATS];
    carve(a[0], a[1], b[0], b[1]);
  }
  const patch = (x: number, y: number, kind: string, n: number) => {
    for (let i = 0; i < n; i++) {
      if (inBounds(x, y)) {
        const k = tileIndex(x, y);
        if (kind === 'forest') {
          terrainMap[k] = Terrain.Forest;
          depositMap[k] = 0;
        } else {
          terrainMap[k] = Terrain.Plain;
          depositMap[k] =
            kind === 'ore'
              ? Deposit.Ore
              : kind === 'crystal'
                ? Deposit.Crystal
                : Deposit.Grain;
        }
      }
      x = Math.max(1, Math.min(MAP_W - 2, x + randomInt(-1, 1)));
      y = Math.max(1, Math.min(MAP_H - 2, y + randomInt(-1, 1)));
    }
  };
  for (const [sx, sy] of starts) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        if (inBounds(sx + dx, sy + dy) && dx * dx + dy * dy <= 17) {
          terrainMap[tileIndex(sx + dx, sy + dy)] = Terrain.Plain;
          depositMap[tileIndex(sx + dx, sy + dy)] = 0;
        }
      }
    const dx = Math.sign(cx - sx);
    const dy = Math.sign(cy - sy);
    patch(sx + dx * 4, sy - dy, 'ore', 5);
    patch(sx - dx, sy + dy * 4, 'grain', 6);
    patch(sx - dx * 3, sy - dy * 3, 'forest', 4);
    patch(sx + dx * 3, sy + dy * 3, 'forest', 5);
    terrainMap[tileIndex(sx, sy)] = Terrain.Plain;
    depositMap[tileIndex(sx, sy)] = 0;
  }
  const farFromStarts = (x: number, y: number) =>
    starts.every(([a, b]) => dist(a, b, x, y) > 7);
  let k = 0;
  for (let t = 0; t < 1500 && k < 48; t++) {
    const x = randomInt(2, MAP_W - 3);
    const y = randomInt(2, MAP_H - 3);
    if (walkable(x, y) && farFromStarts(x, y)) {
      patch(x, y, 'ore', randomInt(5, 8));
      k++;
    }
  }
  k = 0;
  for (let t = 0; t < 1500 && k < 42; t++) {
    const x = randomInt(2, MAP_W - 3);
    const y = randomInt(2, MAP_H - 3);
    if (terrainMap[tileIndex(x, y)] === Terrain.Plain && farFromStarts(x, y)) {
      patch(x, y, 'grain', randomInt(4, 6));
      k++;
    }
  }
  // mana crystals: a small vein near every castle (just past its first land, on the side facing the centre)
  // so everyone can slowly grow a doctrine; the rich fields and every mana spring lie in the middle of the map,
  // so going faster means stretching your supply lines there
  for (const [sx, sy] of starts) {
    const base = Math.atan2(cy - sy, cx - sx);
    for (let t = 0; t < 60; t++) {
      const a = base + (rand() - 0.5) * 1.2;
      const r = randomInt(9, 11);
      const x = Math.round(sx + Math.cos(a) * r);
      const y = Math.round(sy + Math.sin(a) * r);
      if (!inBounds(x, y) || !walkable(x, y) || depositMap[tileIndex(x, y)])
        continue;
      patch(x, y, 'crystal', 3);
      break;
    }
  }
  // the big fields: compact blobs inside an oval in the middle (the oval follows the map's shape)
  const fields = crystalFields;
  fields.length = 0;
  k = 0;
  for (let t = 0; t < 8000 && k < 7; t++) {
    const x = randomInt(3, MAP_W - 4);
    const y = randomInt(3, MAP_H - 4);
    if (centreDist(x, y) > CENTRE_OVAL) continue;
    if (
      !walkable(x, y) ||
      depositMap[tileIndex(x, y)] ||
      !starts.every(([a, b]) => dist(a, b, x, y) > 12) ||
      !fields.every(([a, b]) => dist(a, b, x, y) >= 7)
    )
      continue;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx;
        const Y = y + dy;
        if (!walkable(X, Y)) continue;
        if (dx && dy && rand() < 0.4) continue;
        const kk = tileIndex(X, Y);
        terrainMap[kk] = Terrain.Plain;
        depositMap[kk] = Deposit.Crystal;
      }
    fields.push([x, y]);
    k++;
  }
  genSites(starts);
  matchState.landTiles = 0;
  for (let k = 0; k < TILES; k++)
    if (terrainMap[k] === Terrain.Plain || terrainMap[k] === Terrain.Forest)
      matchState.landTiles++;
  return starts;
}

export function genSites(starts: Tile[]) {
  sites.length = 0;
  siteAt.fill(-1);
  const far = (x: number, y: number) =>
    starts.every(([a, b]) => dist(a, b, x, y) >= 11) &&
    sites.every(s => dist(s.x, s.y, x, y) >= 6);
  const want: Record<SiteType, number> = {
    mine: 16,
    farm: 14,
    mill: 14,
    vein: 3,
  };
  // the three mana springs sit in the middle of big crystal fields
  for (const [x, y] of crystalFields) {
    if (sites.filter(s => s.type === 'vein').length >= want.vein) break;
    if (!far(x, y)) continue;
    siteAt[tileIndex(x, y)] = sites.length;
    sites.push({ type: 'vein', x, y, owner: -1, dep: 0 });
  }
  for (const type of ['mine', 'farm', 'mill', 'vein'] as const) {
    let k = sites.filter(s => s.type === type).length;
    for (let t = 0; t < 6000 && k < want[type]; t++) {
      const x = randomInt(2, MAP_W - 3);
      const y = randomInt(2, MAP_H - 3);
      const i = tileIndex(x, y);
      const ok =
        type === 'mine'
          ? depositMap[i] === Deposit.Ore
          : type === 'farm'
            ? depositMap[i] === Deposit.Grain
            : type === 'vein'
              ? depositMap[i] === Deposit.Crystal &&
                centreDist(x, y) < CENTRE_OVAL
              : terrainMap[i] === Terrain.Forest;
      if (!ok || !far(x, y)) continue;
      siteAt[i] = sites.length;
      sites.push({ type, x, y, owner: -1, dep: 0 });
      k++;
    }
  }
}
