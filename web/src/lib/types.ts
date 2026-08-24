/**
 * Shared API contract types for the web client. These mirror the shapes the
 * existing API + mobile client already use (see mobile/src/api/types.ts and
 * mobile/src/auth/AuthContext.tsx) so the web app speaks the same protocol —
 * no new/duplicated backend logic.
 */

/** Every API call returns a result — callers never try/catch fetch. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiError {
  kind: 'network' | 'unauthorized' | 'rate_limited' | 'client' | 'server';
  /** Envelope code from the server (VALIDATION_ERROR, EMAIL_TAKEN, ...). */
  code?: string;
  message: string;
  retryAfterSec?: number;
  requestId?: string;
  status?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** The signed-in user, as returned by /auth/* and /me. */
export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  emailVerified: boolean;
}

export interface AuthPayload {
  user: SessionUser;
  tokens: TokenPair;
}

/** The signed-in user's full profile (GET /me). */
export interface MeProfile extends SessionUser {
  bio: string | null;
  xp: number;
  streak: number;
  profileVisibility: 'everyone' | 'friends' | 'nobody';
  profilePhotoUrl: string | null;
  createdAt: string;
}

/** Another user's public profile (GET /users/:id — privacy/block gated). */
export interface PublicProfile {
  username: string;
  displayName: string | null;
  xp: number;
  streak: number;
  tier: string;
  rating: number;
  achievements: number;
}

/** A friend or search hit. */
export interface UserSummary {
  userId: string;
  username: string;
  displayName?: string | null;
}

/** A community library post (story or poem) — the one public browse endpoint. */
export interface LibraryPost {
  id: string;
  authorId: string;
  authorRole: string;
  type: 'story' | 'poem';
  title: string;
  body: string;
  language: string;
  viewCount: number;
  commentCount: number;
  audioUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
}
