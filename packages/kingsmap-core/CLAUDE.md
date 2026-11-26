# kingsmap-core — conventions

A **lockstep** simulation: every browser runs it and must end up bit-for-bit identical.
Anything that changes what `step()` computes is a breaking change for online play.

## Determinism rules

- All randomness through `rand()` / `randomInt()` (`sim/util/rng.ts`, seeded per match).
  Never `Math.random`, `Date`, `performance`, or iteration over unordered data.
- Trigonometry uses `detSin` / `detCos` / `detAtan2`; distances use `dist` / `vecLen`
  (`Math.sqrt` is exact everywhere), squares `sq(x)` (all in `sim/util/geometry.ts`). The spec
  leaves `Math.sin/cos/tan/atan2/hypot/exp/log/pow/…` and `**` engine-dependent, so ESLint
  forbids them, `Math.random`, `Date` and `performance` anywhere in `src/` (`eslint.config.js`,
  the kingsmap-core block). Exact everywhere and allowed: `+ - * /`, `sqrt`, `floor/ceil/round/trunc`,
  `abs/sign/min/max`, `imul`, `fround`.
- Do not reorder systems in `sim/update.ts` or calls inside a system, and do not change the
  order of `rand()` calls: that changes every match from that point on.
- Visual-only data (`world.fx`, `world.shots`, `terrV`, `ang`) must never be read by the sim.

## No text

The core holds no human-language text (no Cyrillic in `src`, no English UI strings either).
Refusals and notices are `GameMessage`s built with `msg(key, params)` (`sim/world/events.ts`):
`error.<camelCase>` for refused commands, `notice.<camelCase>` for notices, the same key for the
same text everywhere. Params: seats as `player` / `ally` / `by` / `owner` / `target`; rule ids as
`building` (`b.spec ?? b.type`), `site`, `path`, `perk`, `unit`, `res` / `give` / `get`, `signal`,
`say`; everything else plain numbers (`seconds`, `amount`, `percent`, `max`, …). Rule tables carry
numbers and icons only. `Player.name` is the nick of a human seat ('' for bots) and the simulation
never reads it. A new message needs its uk and en text in the front end's locales.

## The golden test

`test/golden.test.ts` re-plays 4 recorded matches (`test/fixtures/golden.json`) and compares the
state hash every 100 ticks. It must stay green for refactors. When a change is **meant** to
alter the simulation (balance, new mechanic): regenerate the fixture in the same PR, say so in
the PR, and bump the **minor** version.

## Layout

- `sim/config/*` — pure data, typed (`UnitSpec`, `PathSpec`, …). Balance changes go here.
- `sim/systems/*` — one mechanic per file; functions work on the active match (`G` from
  `sim/state.ts`). New per-tick work is called from `sim/update.ts`.
- `sim/commands/apply.ts` — the only entry for player intents; validate inputs there.
- `sim/ai/*` — bots. They use the same systems and commands as players.
- `game.ts` — the `Game` object: every public method calls `activate()` first.
- `color.ts` — `toPixi` / `toCss` / `toRgbChannels` for the `Color` palette of kingsmap-types. The
  sim never writes a colour literal: fx and realm colours are `Color.X`.
- `rules.ts` — the explicit read-only facade for UIs. Export from here only what a renderer
  needs; it is part of the public API.
- World and entity field names are read by renderers and hashed by `sim/hash.ts`: renaming a
  field means updating `hash.ts` without changing what is hashed.
