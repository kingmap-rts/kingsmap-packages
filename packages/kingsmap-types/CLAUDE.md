# kingsmap-types — conventions

The one place for types shared by the projects of King's Map. Every other package and app
imports its types from here.

- **Types and constant enums only, no logic.** A function belongs in kingsmap-protocol
  (validators) or kingsmap-core (simulation).
- **Constants are enums** (`Lockstep`, `Limits`, `Terrain`, `Deposit`): plain `enum`, never
  `const enum` (consumers use isolatedModules / Vite). Balance numbers are not shared contract —
  they stay in core's `rules`.
- **The colour palette** is the `Color` enum in `style/color.ts`: every colour of the projects,
  named by purpose, `'#rrggbb'` values. A new colour is added here before it is used anywhere;
  format helpers (`toPixi`, `toCss`) are logic, so they live in kingsmap-core.
- One file per area under `game/`, `net/`, `api/`, `style/`; `index.ts` re-exports with `export type *`
  for type-only files and `export *` for files with enums.
- Changing a type that crosses the wire (`ClientMsg`, `ServerMsg`, `Intent`, `MatchStats`, HTTP
  bodies) or an enum value breaks the other side: bump the **minor** version and release the
  front end and the backend together. `World` field names are hashed by the core's stateHash.
