# @kingmap-rts/kingsmap-types

Every type and shared constant of King's Map, for every project: the front end, the backend,
the core, the tools. Import types from here, not from the packages that use them.

| Area              | What                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `game/vocabulary` | `Resource`, `UnitType`, `SpecType`, `PathId`, `PerkId`, `Difficulty`, …                                    |
| `game/message`    | `GameMessage` — what the game tells a player, as a key + params (no text)                                  |
| `game/intent`     | `Intent` — every player command                                                                            |
| `game/world`      | `World`, `Player`, `Unit`, `Building`, `Convoy`, `Link`, `Site`, …                                         |
| `game/rules`      | shapes of the rule tables: `UnitSpec`, `BuildingSpec`, `PathSpec`, …                                       |
| `game/match`      | `GameOptions`, `GameResult`, `GameMap`                                                                     |
| `game/map`        | enums `Terrain`, `Deposit` (tile codes)                                                                    |
| `net/lockstep`    | enums `Lockstep` (`TurnMs`, `TickSeconds`, `HashEvery`) and `Limits` (`MaxPlayers`, `StatsMaxBytes`)       |
| `net/messages`    | `ClientMsg`, `ServerMsg`, `ServerError`, `SeatIntent`, `LobbyPlayer`, `OpenRoom`                           |
| `net/stats`       | `MatchStats`, `MatchSummary`, `MatchPlayerSummary`                                                         |
| `api/http`        | the backend's HTTP bodies: `OnlineStats`, `FeedbackRequest`, `ClientErrorReport`                           |
| `api/user`        | players and accounts: `UserProfile`, `PublicUser`, enum `AuthProvider`                                     |
| `api/auth`        | sign-in API: `AuthSession`, `GuestSignInRequest`, `UpdateProfileRequest`, enums `AuthError`, `AuthFailure` |

```ts
import {
  Lockstep,
  Terrain,
  type Intent,
  type ServerMsg,
} from '@kingmap-rts/kingsmap-types';
```

Validators (`cleanIntent`, `cleanMatchStats`) are in `@kingmap-rts/kingsmap-protocol`; the simulation
and the rule numbers are in `@kingmap-rts/kingsmap-core`.
