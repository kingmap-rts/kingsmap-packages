/**
 * Something the game tells a player, as a key and parameters — never as text.
 * The client turns it into words (i18n). Parameter conventions:
 * - seats (shown as the player's name): `player`, `ally`, `by`, `owner`, `target`
 * - rule ids (shown as their translated name): `building` ('hq' | 'depot' | SpecType),
 *   `site` (SiteType), `path` (PathId), `perk` (PerkId), `unit` (UnitType),
 *   `res` / `give` / `get` (Resource), `signal` (PingKind), `say` (SayKind)
 * - everything else is a plain number (seconds, amounts, percents, counts).
 */
export interface GameMessage {
  key: string;
  params?: Record<string, string | number>;
}
