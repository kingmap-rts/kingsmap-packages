/**
 * Players and accounts (kingsmap-backend, users / auth). A player starts as a guest and becomes
 * a full account by linking Google or Discord (or, inside the CrazyGames portal, a CrazyGames
 * account). The public name is `nickname#tag` (Mykola#0421).
 */

/** where a player can sign in from (Postgres enum auth_provider in the backend) */
export enum AuthProvider {
  Google = 'google',
  Discord = 'discord',
  /**
   * A CrazyGames account: only inside the CrazyGames portal (the game in their iframe), signed in
   * with a token from their SDK (`POST /api/auth/crazygames`), never through an OAuth redirect and
   * never listed by `GET /api/auth/providers`.
   */
  CrazyGames = 'crazygames',
}

/** the signed-in player's own profile */
export interface UserProfile {
  id: string;
  /** at most 16 characters, not unique on its own */
  nickname: string;
  /** 1..9999; show it with leading zeros: `#0421` */
  tag: number;
  /** true until a provider (Google, Discord, CrazyGames) is linked */
  isGuest: boolean;
  /** administrator rights, granted by hand on the server */
  isSuperuser: boolean;
  avatarUrl: string | null;
  /** UI language, e.g. 'uk' */
  locale: string;
  /** providers linked to this account */
  providers: AuthProvider[];
}

/** what other players see (leaderboards, match lists) */
export interface PublicUser {
  id: string;
  nickname: string;
  tag: number;
  avatarUrl: string | null;
}
