// A headless online player: joins a quick match, simulates every turn like the browser does, sends random
// orders that exercise every mechanic, reports hashes, and prints its final state hash as JSON.
//   yarn workspace @kingmap-rts/kingsmap-tools net:client ws://localhost:8787/ws Name uk|en turns seed
import {
  CORE_VERSION,
  createGame,
  type Game,
} from '@kingmap-rts/kingsmap-core';
import {
  Lockstep,
  type Intent,
  type SeatIntent,
  type ServerMsg,
} from '@kingmap-rts/kingsmap-types';

// the language argument is kept for old scripts; the core has no text, so it changes nothing
const [url, nick, , turnsS, seedS] = process.argv.slice(2);
const TURNS = +turnsS;
const seed = +seedS;
let rs = seed >>> 0;
const rnd = () => (rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];

const ws = new WebSocket(url);
let game: Game | null = null;
let me = -1;
let next = 0;
let desyncs = 0;
let errors = 0;
const turns: SeatIntent[][] = [];
const out = (m: unknown) => ws.readyState === 1 && ws.send(JSON.stringify(m));
const sendI = (i: Intent) => out({ t: 'i', i });

function randomOrders(g: Game) {
  const G = g.world;
  const p = G.players[me];
  if (!p.alive) return;
  const mine = G.units.filter(u => u.owner === me && !u.dead);
  const others = G.players.filter(q => q.id !== me && q.alive).map(q => q.id);
  const r = rnd();
  if (r < 0.18)
    sendI({
      t: 'train',
      type: pick(['inf', 'inf', 'raid', 'siege', 'wagon'] as const),
    });
  else if (r < 0.32 && mine.length) {
    const ids = mine.filter(() => rnd() < 0.5).map(u => u.id);
    const h = p.hq;
    sendI({
      t: 'move',
      ids,
      x: h.x + Math.floor(rnd() * 30 - 15),
      y: h.y + Math.floor(rnd() * 30 - 15),
      mode: rnd() < 0.5 ? 'move' : 'amove',
    });
  } else if (r < 0.4 && mine.length) {
    const foe = G.units.find(u => u.owner !== me && !u.dead);
    if (foe)
      sendI({
        t: 'attack',
        ids: mine.slice(0, 6).map(u => u.id),
        target: foe.id,
      });
  } else if (r < 0.48) {
    for (let k = 0; k < 40; k++) {
      const x = p.hq.x + Math.floor(rnd() * 24 - 12);
      const y = p.hq.y + Math.floor(rnd() * 24 - 12);
      if (!g.buildError(me, x, y)) {
        sendI({ t: 'build', x, y });
        break;
      }
    }
  } else if (r < 0.53 && mine.length)
    sendI({ t: 'squad', ids: mine.map(u => u.id) });
  else if (r < 0.56 && mine.length)
    sendI({
      t: 'unsquad',
      ids: mine
        .filter(u => u.n > 1)
        .slice(0, 1)
        .map(u => u.id),
    });
  else if (r < 0.62 && others.length) sendI({ t: 'ally', to: pick(others) });
  else if (r < 0.64 && others.length) sendI({ t: 'unally', to: pick(others) });
  else if (r < 0.67 && others.length) sendI({ t: 'renew', to: pick(others) });
  else if (r < 0.71 && others.length)
    sendI({
      t: 'gift',
      to: pick(others),
      res: pick(['wood', 'steel', 'food', 'crystal'] as const),
    });
  else if (r < 0.75 && others.length)
    sendI({
      t: 'say',
      to: pick(others),
      k: pick(['hi', 'peace', 'together', 'help', 'thanks', 'warn'] as const),
    });
  else if (r < 0.78)
    sendI({
      t: 'ping',
      x: p.hq.x + 3,
      y: p.hq.y,
      k: pick(['attack', 'help', 'retreat'] as const),
    });
  else if (r < 0.81)
    sendI(
      p.res.crystal >= 3 && !p.doc
        ? {
            t: 'doctrine',
            d: pick(['guild', 'shadow', 'forge', 'land'] as const),
          }
        : {
            t: 'perk',
            id: pick(['harvest', 'pace', 'drill', 'carav', 'arson'] as const),
          },
    );
  else if (r < 0.83)
    sendI({
      t: 'cast',
      x: p.hq.x + Math.floor(rnd() * 16 - 8),
      y: p.hq.y + Math.floor(rnd() * 16 - 8),
    });
  else if (r < 0.86) sendI({ t: 'auto', on: rnd() < 0.5 });
  else if (r < 0.88)
    sendI({
      t: 'trade',
      from: pick(['wood', 'ore', 'steel', 'food'] as const),
      to: pick(['wood', 'steel', 'food'] as const),
    });
  else if (r < 0.9) {
    const b = G.buildings.find(
      b => b.owner === me && b.type === 'depot' && !b.spec,
    );
    if (b)
      sendI({
        t: 'spec',
        b: b.id,
        s: pick(['forge', 'barracks', 'fort'] as const),
      });
  }
}

function pump(g: Game) {
  while (turns[next]) {
    for (const [seat, it] of turns[next]) {
      try {
        g.apply(seat, it);
      } catch (err) {
        errors++;
        console.error('apply threw', it, err);
      }
    }
    try {
      g.step();
    } catch (err) {
      errors++;
      console.error('step threw', err);
    }
    next++;
    g.drainNotices();
    if (next % Lockstep.HashEvery === 0)
      out({ t: 'hash', n: next, h: g.hash() });
    if (next % 20 === 0) randomOrders(g);
    if (next >= TURNS) {
      const G = g.world;
      console.log(
        JSON.stringify({
          nick,
          me,
          turns: next,
          hash: g.hash(),
          desyncs,
          errors,
          units: G.units.length,
          squads: G.units.filter(u => u.n > 1).length,
          pacts: G.pacts.length,
          alive: G.players.filter(p => p.alive).length,
          over: G.over,
        }),
      );
      ws.close();
      process.exit(0);
    }
  }
}

ws.onopen = () => out({ t: 'hello', nick, core: CORE_VERSION });
ws.onmessage = e => {
  const m: ServerMsg = JSON.parse(String(e.data));
  if (m.t === 'welcome') out({ t: 'quick' });
  else if (m.t === 'start' && !game) {
    me = m.seat;
    game = createGame({ seed: m.seed, diff: m.diff, humans: m.humans });
  } else if (m.t === 'turn' && game) {
    turns[m.n] = m.i;
    pump(game);
  } else if (m.t === 'desync') desyncs++;
};
