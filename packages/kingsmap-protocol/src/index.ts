/**
 * @kingmap-rts/kingsmap-protocol — the runtime half of the contract between the game server and
 * the browser: strict validators for what players send and the seat layout. The types and the
 * shared constants are in @kingmap-rts/kingsmap-types.
 */
export { cleanIntent } from './intent';
export { cleanMatchStats } from './stats';
export { spreadSeats } from './seats';
