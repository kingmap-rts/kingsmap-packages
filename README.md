# kingsmap-packages

Monorepo of private packages of the King's Map game, shared by `kingsmap-front` and
`kingsmap-backend`, managed with [Yarn workspaces](https://yarnpkg.com/features/workspaces) +
[lerna](https://lerna.js.org/) and published to the private
[GitHub Packages](https://npm.pkg.github.com) registry.

## Packages

| Package                                                                    | What it is                                                                | Used by                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| [`@kingmap-rts/kingsmap-types`](./packages/kingsmap-types/README.md)       | every shared type + constant enums (protocol, world, HTTP API)            | everyone                           |
| [`@kingmap-rts/kingsmap-protocol`](./packages/kingsmap-protocol/README.md) | validators for what players send (`cleanIntent`, `cleanMatchStats`)       | backend                            |
| [`@kingmap-rts/kingsmap-core`](./packages/kingsmap-core/README.md)         | deterministic simulation (lockstep), rule tables for the renderers        | front (+ backend for match checks) |
| `@kingmap-rts/kingsmap-tools` (private, not published)                     | balance and QA tools: headless bot matches, match statistics export, soak | developers                         |

Types live only in `kingsmap-types`; `kingsmap-protocol` and `kingsmap-core` depend on it.
Import types from `@kingmap-rts/kingsmap-types`, validators from the protocol, the simulation from the core.

## Prerequisites

- Node.js `>= 22`
- Yarn `4.x` (via Corepack: `corepack enable`)
- A GitHub Personal Access Token with `read:packages` (to install) and `write:packages`
  (to publish), with access to the `kingmap-rts/kingsmap-packages` repo.

## Setup (this repo)

```bash
cp .env.example .env   # paste your token
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx
yarn install
yarn build
yarn test
```

The token is read from the `GITHUB_TOKEN` env var by both `.npmrc` and `.yarnrc.yml` —
**it is never committed**.

| Command                                   | What it does                                        |
| ----------------------------------------- | --------------------------------------------------- |
| `yarn build`                              | builds every package into its `lib/` (tsc)          |
| `yarn dev`                                | tsc --watch in every package                        |
| `yarn test`                               | tests (core: golden matches, rules, determinism, …) |
| `yarn typecheck`                          | strict type check of sources and tests              |
| `yarn check-quality` / `yarn fix-quality` | ESLint                                              |
| `yarn check-formatting` / `yarn format`   | Prettier                                            |

## Consuming the packages

In `kingsmap-front` / `kingsmap-backend`, add an `.npmrc` at the repo root:

```
@kingmap-rts:registry=https://npm.pkg.github.com
always-auth=true
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then export the token and install:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx
yarn add @kingmap-rts/kingsmap-types         # everyone: types and shared constants
yarn add @kingmap-rts/kingsmap-core          # front (and backend for match checks)
yarn add @kingmap-rts/kingsmap-protocol      # backend: validators
```

For CI and Docker builds, pass `GITHUB_TOKEN` as a secret rather than committing it.

## Tools

```bash
yarn build                                                     # tools run on the built core
yarn workspace @kingmap-rts/kingsmap-tools sim doctrines 14 2100 out/doctrines.jsonl
yarn workspace @kingmap-rts/kingsmap-tools one 42 1500            # one quick bot match
yarn workspace @kingmap-rts/kingsmap-tools cmap 7                 # map of a seed → out/cmap7.svg
yarn workspace @kingmap-rts/kingsmap-tools stats:export ../kingsmap-data/stats out/stats
yarn workspace @kingmap-rts/kingsmap-tools net:soak ws://localhost:8787/ws 6 900   # needs a running backend
python3 packages/kingsmap-tools/src/sim/an_ai.py out/ai_old.jsonl out/ai_new.jsonl
```

Outputs go to `packages/kingsmap-tools/out/` (gitignored).

## Adding a new package

```bash
mkdir -p packages/kingsmap-<name>/src
```

Copy `packages/kingsmap-protocol/{package.json,tsconfig.json}` as a template, rename to
`@kingmap-rts/kingsmap-<name>`, add a `publish:<name>` script to the root `package.json`, then
`yarn install` to wire up the workspace. Cross-package deps use the workspace protocol, e.g.
`"@kingmap-rts/kingsmap-protocol": "workspace:^"`.

## Publishing

Versions are **independent** per package (`lerna.json`). Publishing runs in **GitHub Actions**
(`.github/workflows/release.yml`) with the repository's own token — nobody needs a personal
token to release:

1. bump the version in the package's `package.json` (`yarn workspace @kingmap-rts/kingsmap-core version minor`);
2. merge to `main`.

The same workflow runs the checks on every pull request and every push to `main` (build,
typecheck, `check-quality`, `check-formatting`, test); on `main` its `publish` job starts only
after they pass and publishes every package whose version is not in the registry yet
(`scripts/publish-new.mjs`, protocol before core; no version bump = nothing to publish). It can
also be started by hand from the Actions tab. Local fallback with a PAT (`write:packages`) in `.env`:
`yarn publish:protocol` / `yarn publish:core`.

> **Core versions and online play.** Any change to what the simulation computes changes the
> state hashes: clients on different core versions desync and old match statistics stop verifying.
> Such changes get a **minor** bump, and the front and the backend move to it together.

## Scope

GitHub Packages requires the package scope to match the owner of the repository: the repos
live in the `kingmap-rts` organization, so the scope is `@kingmap-rts`. Moving them to another
owner means renaming the scope (package names, `.npmrc`, `.yarnrc.yml`, imports) and republishing.
