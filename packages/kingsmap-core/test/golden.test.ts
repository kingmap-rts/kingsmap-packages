import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { startGolden } from './support/golden-driver';

/**
 * Bit-exact regression: matches recorded with an earlier build must re-simulate to the very same
 * state hashes. A failure means the simulation changed: online games between versions would
 * desync and old match statistics would not re-simulate. Regenerate the fixture only for intended changes.
 */
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8'),
);

describe(`golden matches (${fixture.recordedWith})`, () => {
  for (const sc of fixture.scenarios) {
    it(
      sc.name,
      async () => {
        const d = startGolden(sc);
        const humans = Object.keys(sc.humans).map(Number);
        const intents = new Map<number, [number, any][]>();
        for (const [n, seat, it] of sc.intents)
          intents.set(n, [...(intents.get(n) ?? []), [seat, it]]);
        const events = new Map<number, [string, any][]>();
        for (const [n, kind, v] of sc.events)
          events.set(n, [...(events.get(n) ?? []), [kind, v]]);

        for (let n = 0; n < sc.ticks; n++) {
          // let the test runner breathe on slow CI machines (long synchronous loops time it out)
          if (n % 250 === 249) await new Promise(r => setImmediate(r));
          for (const [kind, v] of events.get(n) ?? []) {
            if (kind === 'crystal') for (const s of humans) d.addCrystal(s, v);
            if (kind === 'lang') d.setLang(v);
          }
          for (const [seat, it] of intents.get(n) ?? []) d.apply(seat, it);
          d.step();
          if ((n + 1) % fixture.every === 0) {
            const i = (n + 1) / fixture.every - 1;
            if (d.hash() !== sc.hashes[i])
              expect.fail(`${sc.name}: state differs first at tick ${n + 1}`);
          }
        }
        d.setLang('uk');
      },
      120000,
    );
  }
});
