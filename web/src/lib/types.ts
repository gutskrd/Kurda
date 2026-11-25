/** API contract types for the web client, matching the phone's (mobile/src/api/types.ts). */
import type { AccountHold, FeedImage, SupervisionState, LeagueTier, PendingPicture, PictureRejection, PictureReviewState, ProfileBadge, ProfileLeague, ShowcaseBadge, StreakRepairOffer, TreeGlimpse } from '@kurda/shared';

import type { ChatGameRef, ChatMessageKind, GiftCard, GroupStanding, PostGifts } from '@kurda/shared';

/** Every API call returns a result; callers never try/catch fetch. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiError {
  kind: 'network' | 'unauthorized' | 'rate_limited' | 'client' | 'server';
  /** Envelope code from the server (VALIDATION_ERROR, EMAIL_TAKEN, ...). */
  code?: string;
  message: string;
  retryAfterSec?: number;
  requestId?: string;
  status?: number;
  /**
   * The envelope's `details`, such as how long a mute lasts (shared `MutedErrorDetails`) or why an account is
   * suspended (`SuspendedErrorDetails`). Unknown on purpose: check the shape before trusting it.
   */
  details?: unknown;
  /** A refused picture's reason and the way to ask a person to look (shared `PictureRejection`), from a 422's body. */
  rejection?: PictureRejection;
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
  /** Resolved avatar; filled by /me, absent right after login until a refresh. */
  avatarUrl?: string | null;
  /** The interface language this account chose; absent on older responses. */
  locale?: string | null;
  /** No birth month on record (a Google or Apple sign-up, or an older account), so the app asks once first. Absent means no. */
  birthDateRequired?: boolean;
  /** Aged 13–17 today, as the server works it out (/me only). */
  minor?: boolean;
  /** Takes part in the weekly leagues (/me only). */
  leaguesEnabled?: boolean;
  /** Set while a person checks the account before it may post or message (/me only); null or absent for nearly everyone. */
  accountHold?: AccountHold | null;
  /** A supervised teen's limits and where they stand today (/me only); null or absent for everyone else. */
  supervision?: SupervisionState | null;
  /** 'child' for a child's profile made by a parent, which the website never opens; absent or 'person' for everyone else. */
  kind?: 'person' | 'child';
  /** Known to be 18 or over (/me only): not a guest or a child's profile, with a birth month that says so. Absent means no. */
  knownAdult?: boolean;
}

export interface AuthPayload {
  user: SessionUser;
  tokens: TokenPair;
}

/** The streak summary from GET /me. An object, not a number: rendering it directly throws React error #31. */
export interface StreakSummary {
  current: number;
  longest: number;
  freezes: number;
  lastActiveOn: string | null;
  /** Days with a finished lesson or practice session, ever; absent on older responses. */
  daysLearned?: number;
  /** Finished sessions towards the next freeze, out of `sessionsPerFreeze`. */
  freezeProgress?: number;
  sessionsPerFreeze?: number;
  /** The most freezes held at once: one, or two for a Hevalo+ member. */
  maxFreezes?: number;
  /** The ended streak that can still be won back, with today's sessions toward it and its deadline; null when none. */
  repair?: StreakRepairOffer | null;
  /** The ended run won back, and on which day; null or absent otherwise. */
  restored?: { days: number; on: string } | null;
}

/** What POST /me/streak/repair answers with: a Hevalo+ member's free restore. */
export interface StreakRepairResult {
  restored: boolean;
  duplicate: boolean;
  days: number;
  free: boolean;
  streak: StreakSummary;
}

/** Who sent an equipped item, when it arrived as a gift rather than a purchase. */
export interface Gifter {
  id: string;
  username: string;
}

/** An equipped background with a ready URL; `type` picks the element (<img> for image and gif, <video> for video). */
export interface ProfileBackground {
  sku: string;
  assetKey: string;
  type: 'image' | 'gif' | 'video';
  url: string;
  giftedBy?: Gifter | null;
}

/** A resolved equipped icon (web-static URL). */
export interface ProfileIcon {
  sku: string;
  assetKey: string;
  url: string;
  giftedBy?: Gifter | null;
}

/** Level and progress (0–1 towards the next level), computed by the server from XP; never compute it here. */
export interface LevelInfo {
  xp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
}

/** A favourite poem or story as shown publicly: id and title only. */
export interface FavoriteRef {
  id: string;
  title: string;
}

/** Cosmetic and progression fields of /me and /users/:id, optional for older responses and hidden profiles. */
export interface ProfileCosmetics {
  /** Uploaded photo, else the chosen default avatar, else null. */
  avatarUrl?: string | null;
  background?: ProfileBackground | null;
  icon?: ProfileIcon | null;
  level?: LevelInfo;
  premium?: boolean;
  /** Presence; only sent for yourself or a friend. */
  online?: boolean;
  favoritePoem?: FavoriteRef | null;
  favoriteStory?: FavoriteRef | null;
  /** ISO 3166 alpha-2 code (e.g. "DE"), shown as a flag and name. */
  country?: string | null;
}

/** The signed-in user's full profile (GET /me). */
export interface MeProfile extends SessionUser, ProfileCosmetics {
  bio: string | null;
  xp: number;
  /** The full streak object; use `streak.current` for the count. */
  streak: StreakSummary;
  /** 'everyone' is the public web; 'members' is everyone signed in. */
  profileVisibility: 'everyone' | 'members' | 'friends' | 'nobody';
  profilePhotoUrl: string | null;
  /** A new photo waiting for a person to check it, which only you see; others see `profilePhotoUrl` until then. */
  profilePhotoPending?: PendingPicture | null;
  createdAt: string;
  /** Self-only equip state, for the cosmetic pickers. */
  selectedAvatarKey?: string | null;
  equippedBackgroundSku?: string | null;
  equippedIconSku?: string | null;
  premiumIconEnabled?: boolean;
  premiumUntil?: string | null;
  /** The birth month on record, shown in Settings; null until answered, absent from older servers. */
  birthYear?: number | null;
  birthMonth?: number | null;
}

export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self';

/** Someone you have blocked (GET /friends/blocks). No `online`: neither side gets a live presence signal. */
export interface BlockedUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}

/** Another user's public profile (GET /users/:id), gated by privacy and blocks. */
export interface PublicProfile extends ProfileCosmetics {
  userId: string;
  username: string;
  displayName: string | null;
  friendStatus: FriendStatus;
  /** True when privacy hides the details; identity still shows so a request can be sent. */
  private: boolean;
  bio?: string | null;
  profilePhotoUrl?: string | null;
  xp?: number;
  streak?: number;
  /** Their league tier, or null when they do not take part or never joined. A key: translate it (ranks/names). */
  tier?: LeagueTier | null;
  league?: ProfileLeague | null;
  /** The avatar frame's SKU (season or shop frame), or null. */
  frameSku?: string | null;
  /** A shop frame's picture; season frames have none and are drawn from their SKU. */
  frameUrl?: string | null;
  /** The three badges they show (a minor's only to friends). */
  badges?: ShowcaseBadge[];
  /** Every badge they earned, newest first, under the same rule; absent on an older server. */
  earnedBadges?: ProfileBadge[];
  achievements?: number;
  /** Which activity sections this profile shows; null when private. */
  sections?: ProfileSections | null;
  /** Their tree today; null before planting or when private, absent on a server without trees. */
  tree?: TreeGlimpse | null;
}

/** Who wrote a post or a comment, resolved for display. */
export interface PostAuthorRef {
  id: string;
  username: string;
  avatarUrl: string | null;
  /** Set while the account is suspended or banned and what it shared was kept: the byline says so and opens nothing. */
  unavailable?: true;
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
  commentCount: number;
  createdAt: string;
  /** Only on the author's own copy, while its picture waits for a person to check it. */
  review?: PictureReviewState;
}

/** How a post has been received, and whether you took part. */
export interface PostEngagement {
  likes: number;
  bookmarks: number;
  reposts: number;
  liked: boolean;
  bookmarked: boolean;
  reposted: boolean;
}

/** One card on the community wall (GET /feed). */
export interface FeedItem {
  /** Unique across both source tables. */
  key: string;
  targetType: 'library' | 'image';
  id: string;
  /** The badge renders from `CARD_LABEL`, which falls back to the raw kind for one the server adds later. */
  kind: 'gotin' | 'story' | 'poem' | 'image' | 'meme';
  author: PostAuthorRef;
  title: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  /** The first picture's description; null when nobody wrote one. */
  imageAlt?: string | null;
  /** Every picture, in order (at most four); absent from an API older than pictures on posts. */
  images?: FeedImage[];
  /** Marked as a meme, for the Memes filter. */
  meme?: boolean;
  href: string;
  viewCount: number;
  commentCount: number;
  engagement: PostEngagement;
  /** The gifts given onto it, as this reader may see who gave them; absent from an older API. */
  gifts?: PostGifts;
  at: string;
  /** Only on the author's own copy, while a picture on it waits for a person to check it; nobody else is sent it. */
  review?: PictureReviewState;
}

/** The activity sections a profile can show, in the order they appear. */
export const PROFILE_SECTIONS = ['posts', 'games', 'likes', 'reposts', 'saved'] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];
export type ProfileSections = Record<ProfileSection, boolean>;

/** One thing someone posted or played (GET /users/:id/activity). */
export interface ActivityEntry {
  id: string;
  kind: ProfileSection;
  title: string;
  detail: string | null;
  /** Where it lives, when it has a page of its own. */
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
  /** On friend lists, requests and suggestions: online in the last few minutes. */
  online?: boolean;
  /** On search results: already friends with the searcher. */
  friend?: boolean;
}

/** A friend suggestion (GET /friends/suggestions) with its mutual-friend count. */
export interface SuggestedFriend extends UserSummary {
  mutualCount: number;
}

/** A default avatar option (GET /cosmetics/avatars); default-01 is always free. */
export interface AvatarOption {
  key: string;
  requiresPremium: boolean;
}

/** A chat message's gift or game card (shared `ChatMessageExtras`); without them it is plain text. */
export interface ChatExtras {
  kind?: ChatMessageKind;
  gift?: GiftCard | null;
  game?: ChatGameRef | null;
}

/** A one-to-one direct message. */
export interface DmMessage extends ChatExtras {
  id: string;
  senderId: string;
  /** The thread shows a name per burst, not per message. */
  username: string;
  /** Uploaded photo, else the chosen avatar. */
  avatarUrl: string | null;
  /** Null for a gift or a game card. */
  body: string | null;
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
  /** The last message's kind, so a gift or game card reads as one in the list. */
  lastKind?: ChatMessageKind;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

export type LetterFeedback = 'green' | 'yellow' | 'gray';
export type WordleStatus = 'playing' | 'won' | 'lost';

/** One scored guess, with feedback per Kurdish letter. */
export interface WordleGuessRow {
  guess: string;
  letters: string[];
  feedback: LetterFeedback[];
}

/** Client-safe Peyvok game view (POST /wordle/daily|practice, guess). */
export interface WordleGame {
  id: string;
  mode: 'daily' | 'practice';
  difficulty: 'easy' | 'medium' | 'hard';
  status: WordleStatus;
  targetLength: number;
  guesses: WordleGuessRow[];
  keyboard: Record<string, LetterFeedback>;
  remainingAttempts: number;
  /** Revealed only once the game is over. */
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

/** A group. Every group is private: members see it, and only its owner or an admin who is your friend can add you. */
export interface Group {
  id: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  archivedAt: string | null;
  memberCount: number;
  /** The group's picture on the CDN; null or absent shows its initials. */
  photoUrl?: string | null;
}

/** A group in the caller's own list (GET /me/groups), with their role. */
export interface MyGroup extends Group {
  myRole: GroupRole;
}

/** A member of a group (GET /groups/:id → members[]). */
export interface GroupMember {
  userId: string;
  username: string;
  /** Resolved by the server, so the roster shows faces rather than initials. */
  avatarUrl: string | null;
  role: GroupRole;
  joinedAt: string;
}

/**
 * A group with its roster and the caller's role (GET /groups/:id). Only members get it whole; a banned user gets the
 * name, picture and standing, and anyone else a 404.
 */
export interface GroupDetail extends Group {
  members: GroupMember[];
  /** Null for a banned user, the only non-member answered at all. */
  myRole: GroupRole | null;
  /** Where the caller stands; older servers leave it out, and `myRole` says as much. */
  standing?: GroupStanding;
  /** Requests to rejoin waiting, for the owner and admins. */
  pendingRequests?: number;
  /** A new picture waiting for a person to check it, for admins and whoever set it; members see `photoUrl` until then. */
  photoPending?: PendingPicture | null;
}
/** A group chat message (GET/POST /groups/:id/chat). */
export interface GroupMessage extends ChatExtras {
  id: string;
  senderId: string;
  username: string;
  /** Uploaded photo, else the chosen avatar. */
  avatarUrl: string | null;
  /** Null for a gift or a game card; '' once deleted. */
  body: string | null;
  createdAt: string;
  deleted: boolean;
}

/** Wallet balances (GET /me/wallet): Zêr, the one currency. */
export interface WalletBalances {
  zer: number;
}

/** A buyable catalogue item (GET /shop); owned unique items are left out. */
export interface ShopItem {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: 'zer';
  price: number;
  isUnique: boolean;
  premiumOnly: boolean;
  /** Thumbnail URL for cosmetics; null for items without media or without storage configured. */
  assetUrl: string | null;
}

/** An owned item (GET /me/inventory) with its cosmetic asset. */
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
  /** A lesson or practice was finished today, which a claim needs; absent on older responses, where `canClaim` decides. */
  learnedToday?: boolean;
  /** The daily Zêr is a Hevalo+ member's: false for anyone else, absent on older responses. */
  member?: boolean;
}

/** Result of POST /rewards/daily/claim. */
export interface ClaimResult {
  claimed: boolean;
  cycleDay: number;
  reward: number;
  balance: number;
  /** The small gift the day put in the gift bag, for everyone; null when the bag was full, absent from an older server. */
  bagGift?: { sku: string; name: string; assetUrl: string | null } | null;
  member?: boolean;
  /** Whether this account may be told what Hevalo+ adds: a known adult only. Absent means no. */
  nudges?: boolean;
}

/** A community library post (story or poem), from the public browse endpoint. */
export interface LibraryPost {
  id: string;
  authorId: string;
  authorRole: string;
  /** Resolved on the read paths, so a post shows who wrote it. */
  author: PostAuthorRef;
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
