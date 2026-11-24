/**
 * Sign-in API (kingsmap-backend, auth). The access token is short-lived and goes in
 * `Authorization: Bearer …`; the refresh token lives in an httpOnly cookie the browser sends to
 * /api/auth/* by itself (fetch with `credentials: 'include'`).
 *
 *   GET   /api/auth/providers          → AuthProvider[]   (the ones configured on the server)
 *   POST  /api/auth/guest              ← GuestSignInRequest → AuthSession   (+ refresh cookie)
 *   POST  /api/auth/refresh            (cookie)             → AuthSession · 401
 *   POST  /api/auth/logout             (cookie)             → 204
 *   GET   /api/auth/:provider          → 302 to Google / Discord
 *   GET   /api/auth/:provider/callback → 302 to the game: ?auth=ok | ?auth=error&reason=AuthFailure
 *   GET   /api/me                      (Bearer)             → UserProfile
 *   PATCH /api/me                      (Bearer) ← UpdateProfileRequest → UserProfile
 *
 * Signing in with a provider while a guest links it to the guest (rating and history stay); if
 * that provider account already belongs to someone, the player signs into that account instead.
 */
import type { UserProfile } from './user';

/** first visit: creates a guest account */
export interface GuestSignInRequest {
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
