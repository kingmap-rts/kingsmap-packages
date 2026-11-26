import { describe, expect, it } from 'vitest';
import { Deposit, Terrain } from '@kingmap-rts/kingsmap-types';
import { createGame, rules } from '../src/index';
import { PEAK_REACH } from '../src/sim/world/map-gen';

const { MAP_W, MAP_H } = rules;

/** a mountain within a peak's drawn reach of tile (x, y): its picture would cover the wheat there */
function peakOver(terrain: Uint8Array, x: number, y: number) {
  for (const [dx, dy] of PEAK_REACH) {
    const X = x + dx;
    const Y = y + dy;
    if (X < 0 || Y < 0 || X >= MAP_W || Y >= MAP_H) continue;
    if (terrain[Y * MAP_W + X] === Terrain.Mountain) return true;
  }
  return false;
}

describe('grain fields keep clear of mountains', () => {
  it('no grain tile lies under a peak (or on water) across many seeds', () => {
    let grain = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const game = createGame({
        seed: seed * 7919,
        headless: true,
        humans: {},
      });
      const { terrain, deposits } = game.map;
      // every castle keeps its own field nearby
      for (const p of game.world.players) {
        const cx = Math.floor(p.hq.x);
        const cy = Math.floor(p.hq.y);
        let near = 0;
        for (let y = Math.max(0, cy - 8); y <= Math.min(MAP_H - 1, cy + 8); y++)
          for (
            let x = Math.max(0, cx - 8);
            x <= Math.min(MAP_W - 1, cx + 8);
            x++
          )
            if (deposits[y * MAP_W + x] === Deposit.Grain) near++;
        expect(near).toBeGreaterThanOrEqual(2);
      }
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++) {
          const k = y * MAP_W + x;
          if (deposits[k] !== Deposit.Grain) continue;
          grain++;
          if (terrain[k] !== Terrain.Plain || peakOver(terrain, x, y))
            expect.fail(`seed ${seed * 7919}: grain at ${x},${y} under a peak`);
        }
    }
    // the fields are still there
    expect(grain / 150).toBeGreaterThan(100);
  });
});
