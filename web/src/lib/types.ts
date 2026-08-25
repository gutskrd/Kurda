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
  /** resolved avatar (populated by /me; absent right after login until refresh) */
  avatarUrl?: string | null;
}

export interface AuthPayload {
  user: SessionUser;
  tokens: TokenPair;
}

/**
 * Streak summary as returned by GET /me (api streaks StreakSummary). This is an
 * OBJECT, not a number — rendering it directly throws React error #31.
 */
export interface StreakSummary {
  current: number;
  longest: number;
  freezes: number;
  lastActiveOn: string | null;
}

/**
 * A resolved equipped background (server has already checked ownership/premium
 * and turned the R2 key into a ready-to-render URL). `type` picks the element:
 * image/gif → <img>, video → <video>.
 */
export interface ProfileBackground {
  sku: string;
  assetKey: string;
  type: 'image' | 'gif' | 'video';
  url: string;
}

/** A resolved equipped icon (web-static URL). */
export interface ProfileIcon {
  sku: string;
  assetKey: string;
  url: string;
}

/**
 * Level + progress, derived server-side from XP with the single shared formula.
 * `progress` is 0..1 toward the next level. Never compute level on the client.
 */
export interface LevelInfo {
  xp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
}

/** A favorite poem/story as exposed publicly — id + title only. */
export interface FavoriteRef {
  id: string;
  title: string;
}

/**
 * Resolved cosmetic + progression fields shared by /me and /users/:id. All
 * optional so older responses (and privacy-hidden profiles) stay valid.
 */
export interface ProfileCosmetics {
  /** Resolved avatar: uploaded photo → selected default avatar → null. */
  avatarUrl?: string | null;
  background?: ProfileBackground | null;
  icon?: ProfileIcon | null;
  level?: LevelInfo;
  premium?: boolean;
  favoritePoem?: FavoriteRef | null;
  favoriteStory?: FavoriteRef | null;
}

/** The signed-in user's full profile (GET /me). */
export interface MeProfile extends SessionUser, ProfileCosmetics {
  bio: string | null;
  xp: number;
  /** /me returns the full streak object; use streak.current for the count. */
  streak: StreakSummary;
  profileVisibility: 'everyone' | 'friends' | 'nobody';
  profilePhotoUrl: string | null;
  createdAt: string;
  /** self-only equip state, for the cosmetic pickers (not exposed publicly) */
  selectedAvatarKey?: string | null;
  equippedBackgroundSku?: string | null;
  equippedIconSku?: string | null;
  premiumUntil?: string | null;
}

export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self';

/** Another user's public profile (GET /users/:id — privacy/block gated). */
export interface PublicProfile extends ProfileCosmetics {
  userId: string;
  username: string;
  displayName: string | null;
  friendStatus: FriendStatus;
  /** true when privacy hides the details (identity still shown to allow a request) */
  private: boolean;
  bio?: string | null;
  profilePhotoUrl?: string | null;
  xp?: number;
  streak?: number;
  tier?: string;
  rating?: number;
  achievements?: number;
}

/** A friend or search hit. */
export interface UserSummary {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/** A friend suggestion (GET /friends/suggestions) — with mutual-friend count. */
export interface SuggestedFriend extends UserSummary {
  mutualCount: number;
}

/** A 1:1 direct message (chat). */
export interface DmMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

/** A conversation summary (GET /chat/conversations). */
export interface Conversation {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  lastMessage: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

/** Wallet balances (GET /me/wallet). */
export interface WalletBalances {
  zer: number;
  gems: number;
}

/** A buyable catalog item (GET /shop). Owned unique items are hidden here. */
export interface ShopItem {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: 'zer' | 'gems';
  price: number;
  isUnique: boolean;
  premiumOnly: boolean;
  /** resolved thumbnail URL for cosmetics (null for non-media / unconfigured storage) */
  assetUrl: string | null;
}

/** An owned item (GET /me/inventory), incl. resolved cosmetic asset. */
export interface InventoryItem {
  sku: string;
  name: string;
  category: string;
  quantity: number;
  premiumOnly: boolean;
  assetUrl: string | null;
}

/** Result of POST /shop/purchase. */
export interface PurchaseResult {
  purchased: boolean;
  duplicate: boolean;
  sku: string;
  balance: number;
}

/** Daily reward status (GET /rewards/daily). */
export interface DailyRewardStatus {
  canClaim: boolean;
  claimableDay: number;
  reward: number;
  schedule: number[];
  alreadyClaimedToday: boolean;
  cycleDay: number;
}

/** Result of POST /rewards/daily/claim. */
export interface ClaimResult {
  claimed: boolean;
  cycleDay: number;
  reward: number;
  balance: number;
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
