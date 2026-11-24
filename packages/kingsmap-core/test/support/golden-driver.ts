// The only place the golden test touches the core API: adapt it here when the API changes,
// the recorded fixtures stay as they are.
import type { Intent } from '@kingmap-rts/kingsmap-types';
import { createGame } from '../../src/index';

export interface Driver {
  apply(seat: number, intent: Intent): void;
  step(): void;
  hash(): string;
  /** test-only poke into the state (gives mana to human seats) */
  addCrystal(seat: number, n: number): void;
  /** the fixture still records language switches; the core has no text, so they do nothing */
  setLang(l: 'uk' | 'en'): void;
}

export function startGolden(o: {
  seed: number;
  diff: 0 | 1 | 2;
  humans: Record<number, string>;
  headless?: boolean;
  botParams?: Record<number, any>;
}): Driver {
  const game = createGame({
    seed: o.seed,
    diff: o.diff,
    humans: o.humans,
    headless: o.headless,
    botParams: o.botParams,
  });
  return {
    apply: (seat, intent) => void game.apply(seat, intent),
    step: () => game.step(),
    hash: () => game.hash(),
    addCrystal: (seat, n) => void (game.world.players[seat].res.crystal += n),
    setLang: () => {},
  };
}
