/** Creating a match: map, players, castles and starting troops. */
import type { Building, Difficulty, NewGameOptions, Player } from './types';
import { DEFAULT_BOT_PARAMS } from '../config/ai';
import { COLORS, SEATS, TILES } from '../config/map';
import { DIFFICULTY } from '../config/match';
import { G, matchState, activate, newMatch, setWorld } from '../state';
import { recomputeNetwork } from '../systems/network';
import { rand } from '../util/rng';
import { addBuilding, addUnit } from './entities';
import { genMap } from './map-gen';

export function newStats() {
  return {
    built: 0,
    specs: 0,
    forge: 0,
    barracks: 0,
    fort: 0,
    captures: 0,
    capturedFrom: 0,
    depotsDestroyed: 0,
    depotsLost: 0,
    hired: 0,
    unitsLost: 0,
    starved: 0,
    kills: 0,
    convoysKilled: 0,
    convoysLost: 0,
    loot: 0,
    plunder: 0,
    sitesGained: 0,
    wasted: 0,
    sabotage: 0,
    sabotaged: 0,
    delivered: 0,
    cutInflict: 0,
    cutSuffer: 0,
    peakArmy: 0,
    peakDepots: 0,
    peakTiles: 0,
    elimAt: null,
    elimBy: null,
    crystals: 0,
    docAt: null,
    casts: 0,
    pacts: 0,
    betrayals: 0,
    betrayed: 0,
    giftsSent: 0,
    giftsGot: 0,
    waves: 0,
    waveUnits: 0,
    waveDist: 0,
    hqTargets: 0,
    hqDmg: 0,
    recalls: 0,
  };
}

export function newGame(diff: Difficulty, opts: NewGameOptions) {
  opts = opts || {};
  const humans = opts.humans || { 0: '' };
  activate(newMatch(opts.seed != null ? opts.seed | 0 : 1));
  const starts = genMap();
  const Dd = DIFFICULTY[diff];
  setWorld({
    t: 0,
    diff,
    players: [],
    buildings: [],
    units: [],
    convoys: [],
    shots: [],
    fx: [],
    links: [],
    own: new Int8Array(TILES).fill(-1),
    tdep: new Int32Array(TILES),
    bAt: new Int32Array(TILES).fill(-1),
    linkFree: new Map(),
    cong: new Map(),
    sab: new Map(),
    sabProg: new Map(),
    nextId: 1,
    byId: new Map(),
    over: false,
    netT: 0,
    snapT: 0,
    events: [],
    timeline: [],
    matchId: 'm' + matchState.seed.toString(36),
    notices: [],
    sqT: 0,
    pacts: [],
    reqs: [],
    pings: [],
    pact: Array.from({ length: SEATS }, () => new Array(SEATS).fill(0)),
    royal: new Map(),
    traps: new Map(),
    zones: [],
    winner: null,
    reason: null,
    sim: false,
  });
  for (let i = 0; i < SEATS; i++) {
    const p: Player = {
      id: i,
      color: COLORS[i],
      name: humans[i] != null ? String(humans[i]).slice(0, 16) : '',
      bot: humans[i] == null,
      auto: false,
      spawn: null,
      alive: true,
      res: { wood: 90, ore: 0, steel: 45, food: 40, crystal: 0 },
      doc: null,
      perks: [],
      ultCd: 0,
      wardUntil: 0,
      traitorUntil: 0,
      giftCd: 0,
      pingCd: 0,
      sayCd: 0,
      stats: newStats(),
      pop: 12,
      cap: 30,
      labor: 10,
      eff: 1,
      tiles: 0,
      mult: i > 0 ? Dd.mult : 1,
      ai: {
        P: { ...DEFAULT_BOT_PARAMS },
        alert: 0,
        next: 2 + rand() * 2,
        waveAt: Dd.wave + rand() * 40,
        wave: 6,
        cap: Dd.cap,
      },
      land: 0,
      hq: null as unknown as Building, // the castle is built right below
    };
    G.players.push(p);
    const [sx, sy] = starts[i];
    p.hq = addBuilding('hq', i, sx, sy);
    for (let k = 0; k < 3; k++)
      addUnit('inf', i, sx + 0.5 + (k - 1) * 0.8, sy + 1.6);
  }
  recomputeNetwork();
}
