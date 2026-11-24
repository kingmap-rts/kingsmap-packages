/**
 * @kingmap-rts/kingsmap-core — the deterministic simulation of King's Map.
 *
 * Lockstep: every client runs this core with the same seed, the server only relays player
 * intents per turn. Same seed + same intents in the same order = the same world everywhere
 * (compare Game.hash()). Types and shared constants (World, Intent, Lockstep, Terrain, …) come
 * from @kingmap-rts/kingsmap-types.
 *
 *   const game = createGame({ seed: 42, humans: { 0: 'Anna' } });
 *   game.apply(0, { t: 'train', type: 'inf' }); // null, or a GameMessage such as { key: 'error.noResources' }
 *   game.step();
 *   game.hash();
 */
export { createGame, Game } from './game';
export * as rules from './rules';
export { toCss, toPixi, toRgbChannels } from './color';
