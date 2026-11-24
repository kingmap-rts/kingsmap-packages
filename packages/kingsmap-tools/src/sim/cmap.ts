// Draws the map of a seed as an SVG (terrain, mana, springs, castles).
//   yarn workspace @kingmap-rts/kingsmap-tools cmap <seed> [out.svg]
import { writeFileSync } from 'node:fs';
import { createGame } from '@kingmap-rts/kingsmap-core';
import { Color, Deposit, Terrain } from '@kingmap-rts/kingsmap-types';

const seed = +(process.argv[2] ?? 1);
const out = process.argv[3] ?? `out/cmap${seed}.svg`;
const game = createGame({ seed, diff: 1, humans: { 0: 'A' }, headless: true });
const { width: W, height: H, terrain, deposits, sites } = game.map;
const S = 5;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}"><rect width="100%" height="100%" fill="${Color.DebugGrass}"/>`;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const t = terrain[y * W + x];
    const d = deposits[y * W + x];
    const c =
      t === Terrain.Water
        ? Color.DebugWater
        : t === Terrain.Mountain
          ? Color.DebugMountain
          : t === Terrain.Forest
            ? Color.DebugForest
            : null;
    if (c)
      svg += `<rect x="${x * S}" y="${y * S}" width="${S}" height="${S}" fill="${c}"/>`;
    if (d === Deposit.Crystal)
      svg += `<rect x="${x * S}" y="${y * S}" width="${S}" height="${S}" fill="${Color.DebugCrystal}"/>`;
  }
for (const st of sites)
  if (st.type === 'vein')
    svg += `<circle cx="${st.x * S}" cy="${st.y * S}" r="9" fill="none" stroke="${Color.White}" stroke-width="3"/>`;
for (const p of game.world.players)
  svg += `<rect x="${p.hq.x * S - 6}" y="${p.hq.y * S - 6}" width="12" height="12" fill="${p.color}" stroke="${Color.Black}"/>`;
svg += '</svg>';
writeFileSync(out, svg);
console.log(`${W}×${H} → ${out}`);
