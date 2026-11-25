/**
 * @kingmap-rts/kingsmap-types — every type shared by the projects of King's Map: the game's
 * vocabulary, intents and messages, the world the simulation produces, the rule table shapes,
 * the WebSocket protocol, match statistics, the backend's HTTP API and player accounts — plus the shared constants as
 * enums (lockstep clock, limits, map codes, the colour palette). No logic here.
 */
export * from './game/map';
export * from './net/lockstep';
export * from './api/user';
export * from './api/auth';
export * from './style/color';
export type * from './game/vocabulary';
export type * from './game/message';
export type * from './game/intent';
export type * from './game/world';
export type * from './game/rules';
export type * from './game/match';
export type * from './game/ledger';
export type * from './net/messages';
export type * from './net/stats';
export type * from './api/http';
