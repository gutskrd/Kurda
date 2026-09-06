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
  /** presence — only present when viewing yourself or a friend */
  online?: boolean;
  favoritePoem?: FavoriteRef | null;
  favoriteStory?: FavoriteRef | null;
  /** ISO-3166 alpha-2 country code (e.g. "DE"), shown as a flag + name */
  country?: string | null;
}

/** The signed-in user's full profile (GET /me). */
export interface MeProfile extends SessionUser, ProfileCosmetics {
  bio: string | null;
  xp: number;
  /** /me returns the full streak object; use streak.current for the count. */
  streak: StreakSummary;
  /** 'everyone' is the public web; 'members' is everyone signed in. */
  profileVisibility: 'everyone' | 'members' | 'friends' | 'nobody';
  profilePhotoUrl: string | null;
  createdAt: string;
  /** self-only equip state, for the cosmetic pickers (not exposed publicly) */
  selectedAvatarKey?: string | null;
  equippedBackgroundSku?: string | null;
  equippedIconSku?: string | null;
  premiumIconEnabled?: boolean;
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
  /** global rating place, or null when they have not played ranked */
  rank?: number | null;
  achievements?: number;
  /** which activity sections this profile shows; null when it is private */
  sections?: ProfileSections | null;
}

/** Who wrote a post or a comment, resolved for display. */
export interface PostAuthorRef {
  id: string;
  username: string;
  avatarUrl: string | null;
}

/** A picture or meme posted to Dîmen (GET /images). */
export interface ImagePost {
  id: string;
  authorId: string;
  author: PostAuthorRef;
  imageMediaId: string;
  imageUrl: string | null;
  caption: string | null;
  category: 'meme' | 'image';
  language: string | null;
  viewCount: number;
  reactionCount: number;
  commentCount: number;
  createdAt: string;
}

/** How a post has been received, and whether you are part of it. */
export interface PostEngagement {
  likes: number;
  bookmarks: number;
  liked: boolean;
  bookmarked: boolean;
}

/** One card on the community wall (GET /feed). */
export interface FeedItem {
  /** unique across both source tables */
  key: string;
  targetType: 'library' | 'image';
  id: string;
  /**
   * A gotin — a saying, posted without a title — has been one of these since
   * the wall absorbed the three old pages, but this union never learned it.
   * Nothing narrows on `kind` today, so it went unnoticed; the badge renders
   * from `CARD_LABEL`, which is deliberately open and falls back to the raw
   * kind so an unfamiliar one from the server still shows something.
   */
  kind: 'gotin' | 'story' | 'poem' | 'image' | 'meme';
  author: PostAuthorRef;
  title: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  href: string;
  viewCount: number;
  commentCount: number;
  engagement: PostEngagement;
  at: string;
}

/** The activity sections a profile can show, in the order they appear. */
export const PROFILE_SECTIONS = ['stories', 'poems', 'images', 'games', 'likes', 'bookmarks'] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];
export type ProfileSections = Record<ProfileSection, boolean>;

/** One thing someone posted or played (GET /users/:id/activity). */
export interface ActivityEntry {
  id: string;
  kind: ProfileSection;
  title: string;
  detail: string | null;
  /** where it lives, when it has a page of its own */
  href: string | null;
  imageUrl: string | null;
  at: string;
}

/** A friend or search hit. */
export interface UserSummary {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  /** present on friend lists / requests / suggestions — online in the last few minutes */
  online?: boolean;
}

/** A friend suggestion (GET /friends/suggestions) — with mutual-friend count. */
export interface SuggestedFriend extends UserSummary {
  mutualCount: number;
}

/** A default-avatar option (GET /cosmetics/avatars). default-01 is always free. */
export interface AvatarOption {
  key: string;
  requiresPremium: boolean;
}

/** A 1:1 direct message (chat). */
export interface DmMessage {
  id: string;
  senderId: string;
  /** who wrote it — the thread shows a name per burst, not per message */
  username: string;
  /** resolved server-side (uploaded photo -> chosen avatar) */
  avatarUrl: string | null;
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
  online?: boolean;
  lastMessage: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

export type LetterFeedback = 'green' | 'yellow' | 'gray';
export type WordleStatus = 'playing' | 'won' | 'lost';

/** One scored guess row (feedback per Kurdish letter). */
export interface WordleGuessRow {
  guess: string;
  letters: string[];
  feedback: LetterFeedback[];
}

/** Client-safe Wordle game view (POST /wordle/daily|practice, guess). */
export interface WordleGame {
  id: string;
  mode: 'daily' | 'practice';
  difficulty: 'easy' | 'medium' | 'hard';
  status: WordleStatus;
  targetLength: number;
  guesses: WordleGuessRow[];
  keyboard: Record<string, LetterFeedback>;
  remainingAttempts: number;
  /** revealed only once the game is over */
  target: string | null;
  xpAwarded: number | null;
}

export type RhymeQuality = 'perfect' | 'near' | 'none';
export type RhymeReject = 'not-a-word' | 'is-prompt' | 'already-used' | 'no-rhyme' | 'profane';

/** Client-safe view of a solo rhyme-training round (POST /rhyme/training). */
export interface RhymeGame {
  id: string;
  mode: 'training';
  dialect: 'kurmanci' | 'sorani';
  prompt: string;
  windowMs: number;
  remainingMs: number;
  usedWords: string[];
  score: number;
  accepted: number;
  status: 'active' | 'ended';
  xpAwarded: number | null;
}

/** The verdict for one submitted rhyme. */
export interface RhymeResult {
  accepted: boolean;
  quality: RhymeQuality;
  points: number;
  normalized: string;
  reason?: RhymeReject;
}

export type GroupRole = 'owner' | 'moderator' | 'member';

/** A group / club (KUR-084). */
export interface Group {
  id: string;
  name: string;
  description: string | null;
  privacy: 'open' | 'invite';
  ownerId: string | null;
  archivedAt: string | null;
  memberCount: number;
}

/** A group in the caller's own list (GET /me/groups) — carries their role. */
export interface MyGroup extends Group {
  myRole: GroupRole;
}

/** A member of a group (GET /groups/:id → members[]). */
export interface GroupMember {
  userId: string;
  username: string;
  /** resolved server-side, so the roster shows real faces not initials */
  avatarUrl: string | null;
  role: GroupRole;
  joinedAt: string;
}

/** Group detail with its roster and the caller's own role (GET /groups/:id). */
export interface GroupDetail extends Group {
  members: GroupMember[];
  /** null when the caller is not a member */
  myRole: GroupRole | null;
}
/** A group chat message (GET/POST /groups/:id/chat). */
export interface GroupMessage {
  id: string;
  senderId: string;
  username: string;
  /** resolved server-side (uploaded photo -> chosen avatar) */
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  deleted: boolean;
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
  /** resolved server-side on the read paths, so a post shows who wrote it */
  author: { id: string; username: string; avatarUrl: string | null };
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
