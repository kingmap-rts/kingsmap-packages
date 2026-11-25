# kingsmap-packages — notes for Claude

Private packages of King's Map published to GitHub Packages (Yarn workspaces + lerna),
modelled on `land-packages`. Each package has its own `CLAUDE.md` with conventions:
`packages/kingsmap-protocol`, `packages/kingsmap-core`.

## Where types go

All types shared between projects live in `@kingmap-rts/kingsmap-types` — nowhere else:

- every backend endpoint: request bodies, query/params, responses, WebSocket messages
  (`api/`, `net/` in the package);
- the front end's types that describe data from the server or the game (`game/`, `net/`);
- shared constants as enums.
  Packages, the backend and the front import them from there; a project keeps a type locally only
  when nothing outside it uses it. A new endpoint or message = its types in kingsmap-types first,
  then a version bump (minor if it changes what crosses the wire), then the code in the projects.

## Versions are the packages' own

Each `@kingmap-rts/*` package has its own semver version, bumped when it is published. They are
not the game version: game releases (`vX.Y.Z` tags, the `version` of `kingsmap-front/package.json`,
see "Releases" in kingsmap-front/CLAUDE.md) tag only kingsmap-front and kingsmap-backend, never
this repo.

## Colours: the palette only

Every colour of King's Map (front end UI, PixiJS map, and the packages) lives in the `Color` enum in
`packages/kingsmap-types/src/style/color.ts`, named by purpose (`Color.PlayerRed`, `Color.Blast`),
values `'#rrggbb'`.

- **Never write a colour literal** in `packages/*/src` (`'#rrggbb'`, `0xrrggbb`, `rgb()`); use
  `Color.X`. (`0x…` hash and RNG constants in `sim/hash.ts` / `sim/util/rng.ts` are numbers, not colours.)
- **A new colour goes into the palette first** (reuse a close existing member instead of adding a
  near-identical one), then it is used. Changing or removing a colour = editing the palette, never a
  local value. Adding a member is a **minor** bump of kingsmap-types; renaming or removing one breaks
  consumers (also minor while 0.x, and the front end must follow).
- Formats: `Color.X` is already a CSS string; `toPixi(Color.X)` gives the PixiJS number and
  `toCss(Color.X, alpha)` an `rgba()` string (both in kingsmap-core, `src/color.ts`). The front end
  turns the palette into CSS custom properties `--color-<kebab-name>` for its CSS modules.
- Colours in the simulation (`COLORS`, `RESOURCE_COLORS`, `fx` colours) end up in the world: keep their
  values stable or regenerate the golden fixture.

## Package manager: Yarn only

This project uses **Yarn 4** (Berry, pinned in `package.json` → `packageManager`, run through
Corepack) with `nodeLinker: node-modules`.

- **Never use npm or npx** here: no `npm install`, `npm run`, `npm ci`, `npx …`.
  A `package-lock.json` must never appear; if one does, delete it.
- First time on a machine: `corepack enable`. Then `yarn install`.
- Run scripts with `yarn <script>` (`yarn build`, `yarn test`), local binaries with
  `yarn <bin>` (`yarn tsx …`, `yarn vitest`), one-off tools with `yarn dlx <pkg>`.
- Add dependencies with `yarn add <pkg>` / `yarn add -D <pkg>`; in a workspace:
  `yarn workspace <name> add <pkg>`. Remove with `yarn remove`.
- Workspace packages depend on each other with `"workspace:*"` (or `"workspace:^"` for
  published packages).
- `yarn.lock` is committed. CI and Docker install with `yarn install --immutable`.
- `@kingmap-rts/*` packages come from GitHub Packages (see `.yarnrc.yml`): export `GITHUB_TOKEN`
  (a PAT with `read:packages`) before installing them. Never commit the token.

## Commands

```bash
yarn build            # every package → lib/
yarn test             # core: golden matches, rules, determinism
yarn typecheck
yarn check-quality    # ESLint
yarn check-formatting # Prettier
yarn publish:protocol # needs GITHUB_TOKEN in .env (write:packages)
yarn publish:core
```
