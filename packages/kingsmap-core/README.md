# @kingmap-rts/kingsmap-core

The deterministic simulation of King's Map. The browser runs it to play; the server can run it
to re-simulate a match from its match statistics file. Same seed + same intents in the same order = the same
world everywhere.

```ts
import { createGame, rules } from '@kingmap-rts/kingsmap-core';

const game = createGame({ seed: 42, diff: 1, humans: { 0: 'Anna' } });

game.apply(0, { t: 'train', type: 'inf' }); // null, or a GameMessage: { key: 'error.noResources' }
game.step(); // one tick (TICK = 0.1 s = one server turn)
game.hash(); // compare with other clients every HASH_EVERY turns

game.world.units; // read-only view for the renderer
game.map.terrain[y * rules.MAP_W + x] === rules.Terrain.Forest;
game.buildError(0, x, y); // why a post cannot go there (a GameMessage), or null
game.drainNotices(); // [seat, GameMessage][] for the HUD
```

## No text in the core

The core contains no human-language text. Everything it tells a player — the refusal returned by
`apply()` / `buildError()` and the notices of `drainNotices()` — is a `GameMessage`
(`{ key, params? }`, from `kingsmap-protocol`), and the client translates it with i18n.

- keys: `error.<camelCase>` for refused commands and build checks, `notice.<camelCase>` for
  notices; the same text always has the same key
- seat params (the client shows the player's name): `player`, `ally`, `by`, `owner`, `target`
- rule-id params (the client shows the translated name): `building` (`'hq' | 'depot' | SpecType`,
  i.e. `b.spec ?? b.type`), `site`, `path`, `perk`, `unit`, `res` / `give` / `get`, `signal`
  (`PingKind`), `say` (`SayKind`)
- every other param is a plain number (`seconds`, `amount`, `percent`, `count`, `cost`, `max`, …)

The rule tables keep only numbers and icons: the client names units, specs, sites, paths,
perks, realms (bots have `name: ''`; a human seat keeps its nick), pings (`rules.PING_KINDS`)
and messages (`rules.SAY_KINDS`) by their ids.

Several games can live in one process (a server checking matches, tests): every `Game` keeps
its own world, map and random stream.

## What is exported

| Export                       | For                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `createGame`, `Game`, `TICK` | running a match                                                                                 |
| `rules`                      | rule tables (`UNITS`, `BUILDINGS`, `PATHS`, `PERKS`, …), map constants, pure helpers for the UI |
| `World`, `Player`, `Unit`, … | types of the world the renderer reads                                                           |

## Inside

```
src/
  index.ts, game.ts, rules.ts     public API
  sim/
    state.ts        the active match (the only mutable module state)
    update.ts       one tick: every system in a fixed order
    hash.ts         stateHash()
    config/         rule tables: map, units, buildings, economy, network, diplomacy, paths, ai
    world/          types, map generation, new game, entity factories, events
    systems/        one mechanic per file: network, logistics, combat, movement, squads,
                    sabotage, capture, diplomacy, market, paths, victory, pathfinding
    commands/       player intents → systems
    ai/             bots: bot (main loop), campaign, diplomacy, market, paths
    modifiers.ts    numbers changed by paths and perks
    util/           seeded rng, noise, geometry, resource bags
test/
  golden.test.ts  4 recorded matches (31 000 ticks, every intent type) must re-simulate to the
                  same hashes — the guard against accidental simulation changes
```
