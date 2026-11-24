# kingsmap-protocol — conventions

Validators for everything a player can send to the server, plus the seat layout. Types and the
shared constants (`Limits`, `Lockstep`) come from `@kingmap-rts/kingsmap-types`.

- **No types defined here** — add them to kingsmap-types.
- **Every new intent goes in two packages**: the `Intent` union in kingsmap-types, and
  `PLAYER_INTENTS` plus a `case` in `cleanIntent()` here that builds a clean copy (never return
  the input object itself).
- Validators **reject** anything they do not recognise; numbers are checked with
  `Number.isFinite`, seats with `0 <= seat < Limits.MaxPlayers`, id lists are capped at 250.
