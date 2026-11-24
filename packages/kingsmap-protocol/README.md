# @kingmap-rts/kingsmap-protocol

The runtime half of the contract between the game server and the browser — no types here
(they are in `@kingmap-rts/kingsmap-types`):

- `cleanIntent(x)` — strict validator for what a player sends; returns a clean `Intent` or null
  ('leave' is server-only and always rejected);
- `cleanMatchStats(x)` — shape check for match statistics uploaded by clients;
- `spreadSeats(k)` — spreads human seats around the ring of start positions.

```ts
import { cleanIntent } from '@kingmap-rts/kingsmap-protocol';
import type { ClientMsg } from '@kingmap-rts/kingsmap-types';

const m: ClientMsg = JSON.parse(data);
if (m.t === 'i') {
  const intent = cleanIntent(m.i);
  if (intent) pending.push([seat, intent]);
}
```
