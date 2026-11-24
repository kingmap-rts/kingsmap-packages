/**
 * The shape of the simulated world. Everything here is plain data: the systems mutate it,
 * renderers only read it. Field names are part of stateHash() inputs, so renaming a field
 * is fine but changing what it holds is a simulation change.
 */
import type { GameMessage } from './message';
import type {
  BuildingType,
  Difficulty,
  PathId,
  PerkId,
  PingKind,
  Resource,
  SiteType,
  SpecType,
  UnitType,
} from './vocabulary';

export type Bag = Record<Resource, number>;
export type Tile = [x: number, y: number];

/** what a unit is busy with (bots and squads use it to keep orders apart) */
export type UnitJob =
  | 'def'
  | 'wave'
  | 'push'
  | 'regroup'
  | 'escort'
  | 'reload'
  | 'return'
  | 'plunder'
  | 'cut'
  | 'hunt'
  | null;

interface EntityBase {
  id: number;
  owner: number;
  x: number;
  y: number;
  hp: number;
  maxhp: number;
  /** world time of the last hit (healing waits, raiders stop sabotaging) */
  lastHit: number;
  dead?: boolean;
}

export interface Unit extends EntityBase {
  kind: 'u';
  type: UnitType;
  /** soldiers in this squad (1 = single soldier) */
  n: number;
  /** health of one soldier: a squad's maxhp is n × mhp */
  mhp: number;
  ammo: number;
  /** loot carried by a bandit */
  bag: Bag | null;
  /** supplies carried by a wagon */
  cargo: { steel: number; food: number } | null;
  /** seconds a trebuchet has stood still (it fires once deployed) */
  deployT: number;
  /** wagon id that feeds this unit away from supply, 0 if none */
  supBy: number;
  supplied: boolean;
  /** moved this tick (1) or not (0) */
  mv: number;
  /** squad this soldier walks to and will merge into */
  joinTo: number;
  /** stays single until regrouped by the player */
  solo?: boolean;
  cd: number;
  /** seconds until the next target scan */
  scan: number;
  path: Tile[] | null;
  /** current target id, 0 if none */
  tgt: number;
  /** forced target (attack order), 0 if none */
  ftgt: number;
  /** post this unit was ordered to capture (it does not shoot that post), 0 or absent if none */
  capB?: number;
  dest: Tile | null;
  repath: number;
  order?: 'move' | 'amove' | null;
  job: UnitJob;
  jobUntil: number;
  /** facing angle, render only */
  ang: number;
  /** summoned units disappear at this world time */
  expire?: number;
  trapT?: number;
  trapCd?: number;
}

export interface RoadLink {
  nb: Building;
  key: string;
}

export interface Building extends EntityBase {
  kind: 'b';
  type: BuildingType;
  spec: SpecType | null;
  stock: Bag;
  /** production per second of the land this post owns */
  yld: Bag;
  /** road hops to the castle (99 = not connected) */
  hop: number;
  adj: RoadLink[];
  idle: number;
  sendT: number;
  /** capture progress (s) and who is capturing */
  cap: number;
  capBy: number;
  cd: number;
  /** connected to the castle by roads */
  linked: boolean;
  panicUntil?: number;
  /** extra claim radius from a land charter */
  rBonus?: number;
}

export interface Convoy extends EntityBase {
  kind: 'c';
  cargo: Bag;
  /** dominant resource, for the icon */
  res: Resource;
  /** destination building id */
  to: number;
  /** road it travels on */
  key?: string;
  /** road length at departure */
  L0?: number;
  /** burns halfway: seat of the trap owner + 1 */
  doom?: number;
  /** a gift caravan to this seat */
  giftTo?: number;
}

export type Entity = Unit | Building | Convoy;

export interface Link {
  a: Building;
  b: Building;
  owner: number;
  blocked: boolean;
  key: string;
}

export interface Site {
  type: SiteType;
  x: number;
  y: number;
  owner: number;
  /** id of the post whose land covers it, 0 if none */
  dep: number;
}

export interface BotParams {
  raid: number;
  forgeDiv: number;
  fortDiv: number;
  expand: number;
  wave0: number;
  waveInc: number;
  labor: number;
  cutMin: number;
  barracks: number;
  siegeW: number;
  wagonW: number;
  smartCut?: boolean;
  waveAt0?: number;
  /** campaign AI (default on); false = the prototype AI */
  ai2?: boolean;
  /** never takes a path (experiments) */
  noDoc?: boolean;
  /** never makes alliances (experiments) */
  noAlly?: boolean;
  /** never forms squads (experiments) */
  noSquad?: boolean;
  /** force a path (experiments) */
  doc?: PathId | null;
}

/** what a bot remembers between its decisions */
export interface BotState {
  P: BotParams;
  /** defend at home until this time */
  alert: number;
  /** seconds to the next decision */
  next: number;
  waveAt: number;
  wave: number;
  /** army size multiplier of the difficulty */
  cap: number;
  /** campaign: the enemy we push against and until when */
  tfoe?: number | null;
  tfoeUntil?: number;
  /** campaign: target building id, peak group size, last progress time and place */
  gT?: number;
  /** the path whose branch the bot climbs */
  path?: PathId;
  gPeak?: number;
  gProgT?: number;
  gLast?: [number, number];
  grudge?: number;
  renewKey?: string;
  renewYes?: boolean;
  giftAt?: number;
  diploAt?: number;
}

/** counters for match statistics (balance tools, end card); never read by the simulation */
export interface PlayerStats {
  built: number;
  specs: number;
  forge: number;
  barracks: number;
  fort: number;
  captures: number;
  capturedFrom: number;
  depotsDestroyed: number;
  depotsLost: number;
  hired: number;
  unitsLost: number;
  starved: number;
  kills: number;
  convoysKilled: number;
  convoysLost: number;
  loot: number;
  plunder: number;
  sitesGained: number;
  wasted: number;
  sabotage: number;
  sabotaged: number;
  delivered: number;
  cutInflict: number;
  cutSuffer: number;
  peakArmy: number;
  peakDepots: number;
  peakTiles: number;
  elimAt: number | null;
  elimBy: number | null;
  crystals: number;
  docAt: number | null;
  casts: number;
  pacts: number;
  betrayals: number;
  betrayed: number;
  giftsSent: number;
  giftsGot: number;
  waves: number;
  waveUnits: number;
  waveDist: number;
  hqTargets: number;
  hqDmg: number;
  recalls: number;
  traded?: number;
}

export interface Player {
  id: number;
  color: string;
  /** the nick of a human seat ('' for bots: the client names realms); never read by the simulation */
  name: string;
  bot: boolean;
  /** human player let the game hire troops automatically */
  auto: boolean;
  autoT?: number;
  /** building where new troops appear */
  spawn: number | null;
  alive: boolean;
  res: Bag;
  doc: PathId | null;
  perks: PerkId[];
  ultCd: number;
  wardUntil: number;
  traitorUntil: number;
  giftCd: number;
  pingCd: number;
  sayCd: number;
  stats: PlayerStats;
  pop: number;
  /** population capacity */
  cap: number;
  /** workers the land needs */
  labor: number;
  /** pop / labor, at most 1: scales production */
  eff: number;
  tiles: number;
  /** share of all land tiles */
  land: number;
  /** seconds holding the domination share */
  domT?: number;
  store?: number;
  hungry?: boolean;
  soldiers?: number;
  /** production multiplier of the difficulty (bots) */
  mult: number;
  ai: BotState;
  hq: Building;
}

export interface Pact {
  a: number;
  b: number;
  until: number;
  warned: boolean;
  /** each side asked to renew */
  ra: boolean;
  rb: boolean;
}

export interface AllyRequest {
  from: number;
  to: number;
  until: number;
  at: number;
}

export interface Ping {
  x: number;
  y: number;
  k: PingKind;
  owner: number;
  until: number;
}

export interface FireZone {
  x: number;
  y: number;
  r: number;
  until: number;
  owner: number;
}

/** visual effects and shots: render only, never read by the simulation */
export interface Effect {
  x: number;
  y: number;
  t: number;
  dur: number;
  r?: number;
  text?: string;
  color: string;
}
export interface Shot {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  c: string;
}

export interface MatchEvent {
  t: number;
  type: string;
  p: number | null | undefined;
  [k: string]: unknown;
}

export interface World {
  /** world time, seconds */
  t: number;
  diff: Difficulty;
  players: Player[];
  buildings: Building[];
  units: Unit[];
  convoys: Convoy[];
  links: Link[];
  byId: Map<number, Entity>;
  nextId: number;
  /** owner of every tile (-1 = nobody) */
  own: Int8Array;
  /** id of the post that claims every tile */
  tdep: Int32Array;
  /** building id on every tile (-1 = none) */
  bAt: Int32Array;
  /** road key -> time the road is free for the next caravan */
  linkFree: Map<string, number>;
  /** road key -> time it was last congested */
  cong: Map<string, number>;
  /** road key -> burning until */
  sab: Map<string, number>;
  /** road key -> arson progress */
  sabProg: Map<string, { p: number; by: number }>;
  /** road key -> king's highway until */
  royal: Map<string, number>;
  /** road key -> hidden trap */
  traps: Map<string, { owner: number; n: number }>;
  zones: FireZone[];
  /** pact[a][b] = alliance until (symmetric) */
  pact: number[][];
  pacts: Pact[];
  reqs: AllyRequest[];
  pings: Ping[];
  /** timers of periodic work */
  netT: number;
  snapT: number;
  sqT: number;
  over: boolean;
  winner: number | null;
  reason: 'domination' | 'elimination' | null;
  domWinner?: number;
  /** headless batch run: no notices */
  sim: boolean;
  /** [seat, message] for the UI, drained by the client (which translates the message) */
  notices: [number, GameMessage][];
  events: MatchEvent[];
  timeline: { t: number; pl: (number[] | null)[] }[];
  matchId: string;
  fx: Effect[];
  shots: Shot[];
  /** bumps when territory is recomputed (render hint) */
  terrV?: number;
}

export interface Point {
  x: number;
  y: number;
}

/** a price: any of wood / steel / food, plus people for units */
export interface Cost {
  wood?: number;
  steel?: number;
  food?: number;
  pop?: number;
}
