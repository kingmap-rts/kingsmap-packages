/**
 * Sign-in API (kingsmap-backend, auth). The access token is short-lived and goes in
 * `Authorization: Bearer …`; the refresh token lives in an httpOnly cookie the browser sends to
 * /api/auth/* by itself (fetch with `credentials: 'include'`).
 *
 *   GET   /api/auth/providers          → AuthProvider[]   (the OAuth ones configured on the server)
 *   POST  /api/auth/guest              ← GuestSignInRequest → AuthSession   (+ refresh cookie)
 *   POST  /api/auth/refresh            (cookie) ← RefreshRequest → AuthSession · 401
 *   POST  /api/auth/logout             (cookie) ← RefreshRequest → 204
 *   POST  /api/auth/crazygames         ← CrazyGamesSignInRequest → AuthSession · 401 · 404 (off)
 *   GET   /api/auth/:provider          → 302 to Google / Discord
 *   GET   /api/auth/:provider/callback → 302 to the game: ?auth=ok | ?auth=error&reason=AuthFailure
 *   GET   /api/me                      (Bearer)             → UserProfile
 *   PATCH /api/me                      (Bearer) ← UpdateProfileRequest → UserProfile
 *
 * Signing in with a provider while a guest links it to the guest (rating and history stay); if
 * that provider account already belongs to someone, the player signs into that account instead.
 *
 * Inside a game portal's iframe (CrazyGames) the API's cookie is third-party and the browser
 * drops it. There the page keeps the refresh token itself (`tokenInBody`, see `BodyTokenRequest`).
 */
import type { UserProfile } from './user';

/**
 * The refresh token in the body instead of the cookie (a portal iframe, where cookies are dropped).
 * With `tokenInBody` the server ignores the cookie, sets none and answers with
 * `AuthSession.refreshToken`; the page stores it and sends it back as `refreshToken`.
 */
export interface BodyTokenRequest {
  tokenInBody?: boolean;
  /** the refresh token the page keeps (body mode only) */
  refreshToken?: string;
}

/** body of refresh and logout; empty on kingsmap.com (the cookie is used) */
export type RefreshRequest = BodyTokenRequest;

/** first visit: creates a guest account */
export interface GuestSignInRequest extends BodyTokenRequest {
  /** cleaned by the server; a default name when empty or offensive */
  nickname?: string;
  /** UI language, e.g. 'uk' */
  locale?: string;
}

/** answer of guest sign-in and refresh */
export interface AuthSession {
  /** JWT for `Authorization: Bearer` */
  accessToken: string;
  /** seconds until the access token expires; refresh a bit earlier */
  expiresIn: number;
  user: UserProfile;
  /** only in body mode (`tokenInBody`): the new refresh token, which replaces the old one */
  refreshToken?: string;
}

/**
 * Sign-in with a CrazyGames account inside their portal. Always body mode: the answer carries the
 * refresh token, and `refreshToken` (the guest playing on this device) gets the account linked.
 */
export interface CrazyGamesSignInRequest extends BodyTokenRequest {
  /** `CrazyGames.SDK.user.getUserToken()`: a JWT, valid for an hour */
  token: string;
  /** UI language of a brand-new account, e.g. 'en' */
  locale?: string;
}

export interface UpdateProfileRequest {
  nickname?: string;
  locale?: string;
}

/** error codes in `{ code }` bodies of /api/auth and /api/me */
export enum AuthError {
  /** no session or it expired: sign in again (as a guest or with a provider) */
  Unauthorized = 'unauthorized',
  Banned = 'banned',
  /** an account may change its nickname once per `NicknameCooldownDays` */
  NicknameCooldown = 'nickname_cooldown',
  /** the server runs without a database */
  Unavailable = 'auth_unavailable',
}

/** `reason` in the ?auth=error redirect after a provider sign-in */
export enum AuthFailure {
  /** the player pressed "cancel" at the provider */
  Cancelled = 'cancelled',
  /** the state check failed (stale or forged link): just try again */
  State = 'state',
  /** the provider did not answer as expected */
  Provider = 'provider',
  Banned = 'banned',
}

export enum AuthLimits {
  /** days between nickname changes of a full account (guests change freely) */
  NicknameCooldownDays = 30,
}
