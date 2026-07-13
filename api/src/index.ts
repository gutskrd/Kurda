export { buildApp } from './app.js';
export { loadConfig, type AppConfig } from './config/env.js';
export { HealthRegistry, type CheckResult, type HealthCheck } from './health/registry.js';
export { UsersRepository, type UserRow, type CreateUserInput } from './users/repository.js';
export { canonicalUsername, USERNAME_PATTERN } from './users/username.js';
export { AppError } from './plugins/errors.js';
export { RequestValidationError, type ValidationIssue } from './plugins/validation.js';
export { Cache, cacheKey, serialize, deserialize, type CacheClient, type CacheOptions } from './cache/cache.js';
export {
  applyJitter,
  shouldEarlyRecompute,
  DEFAULT_JITTER_RATIO,
  DEFAULT_XFETCH_BETA,
} from './cache/stampede.js';
export { JobQueue, QUEUE_NAME, DEFAULT_JOB_OPTIONS, type EnqueueOptions } from './jobs/queue.js';
export { defineJob, JobRegistry, type JobDefinition, type JobContext } from './jobs/registry.js';
export { sendEmailJob } from './jobs/email.js';
export { createWorker, buildRegistry } from './jobs/worker.js';
export { initSentry, captureError, scrubEvent } from './observability/sentry.js';
export { setupMetrics } from './observability/metrics.js';
export { setupRateLimit, DEFAULT_RATE_LIMIT, type RateLimitOptions } from './ratelimit/plugin.js';
export { RedisRateLimitStore, MemoryRateLimitStore, type RateLimitStore } from './ratelimit/store.js';
export { MediaStorage, createStorage, mediaKey, ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES, IMMUTABLE_CACHE_CONTROL, type UploadTicket } from './media/storage.js';
export { MediaService, ORPHAN_AGE_HOURS } from './media/service.js';
export { AuthService, hashPassword, verifyPassword, toPublicUser, type PublicUser, type RegisterInput } from './auth/service.js';
export { issueAccessToken, verifyAccessToken, issueTokenPair, hashRefreshToken, ACCESS_TOKEN_TTL_SECONDS, type AccessTokenClaims, type IssuedTokens } from './auth/tokens.js';
export { registerAuthRoutes, registerBodySchema } from './auth/routes.js';
export { loginBodySchema, refreshBodySchema } from './auth/routes.js';
export { setupAuth, requireAuth, requireRoles, type AuthFailure } from './plugins/auth.js';
export { createEmailToken, consumeEmailToken, EMAIL_TOKEN_TTL_HOURS, type EmailTokenPurpose } from './auth/email-tokens.js';
export { OAuthService, verifyProviderToken, defaultJwksResolver, type OAuthProvider, type ProviderIdentity, type JwksResolver } from './auth/oauth.js';
export { oauthBodySchema } from './auth/routes.js';
export { registerUserRoutes, sanitizeBio, patchMeBodySchema, USERNAME_CHANGE_COOLDOWN_DAYS, TIMEZONE_CHANGE_COOLDOWN_DAYS } from './users/routes.js';
export { LockoutService, lockDurationMinutes, LOCKOUT_THRESHOLD, FAILURE_WINDOW_MINUTES } from './auth/lockout.js';
export { GdprService, DELETION_GRACE_DAYS } from './gdpr/service.js';
export { makeAnonymizeJob, makeExportJob, ANONYMIZE_JOB_NAME, EXPORT_JOB_NAME } from './jobs/gdpr-jobs.js';
export { verifyCaptcha } from './auth/captcha.js';
export { isDisposableEmail } from './auth/disposable-domains.js';
export { CURRENT_POLICY_VERSION, DEFAULT_RESTRICTED_AGE_THRESHOLD, ageOn, isRestrictedAge } from './gdpr/consent.js';
export { consentBodySchema } from './users/routes.js';
export { registerAchievementRoutes } from './achievements/routes.js';
export { AchievementsService, ACHIEVEMENTS, achievementDef, type AchievementDef, type AwardResult } from './achievements/service.js';
export { WalletService, InsufficientFundsError, type Currency, type WalletOperation, type OperationResult, type Balances } from './wallet/service.js';
export { registerWalletRoutes } from './wallet/routes.js';
export { RealtimeGateway, TICKET_TTL_SECONDS, CLOSE_CONNECTED_ELSEWHERE, CLOSE_BAD_TICKET, type GatewayOptions } from './realtime/gateway.js';
export { RedisRoomBus, LocalRoomBus, type RoomBus, type RoomEvent } from './realtime/bus.js';
export { RedisKV, MemoryKV, type RealtimeKV } from './realtime/kv.js';
export { MatchmakingService, type MatchmakingOptions, type MatchRecord, type EnqueueResult } from './game/matchmaking.js';
export { MODE_CONFIG, formTeams, teamScoreboard, type GameMode, type ModeConfig, type TeamLine } from './game/modes.js';
export { RedisMatchQueue, MemoryMatchQueue, type MatchQueue, type QueueEntry } from './game/match-queue.js';
export { registerMatchmakingRoutes } from './game/routes.js';
export { GameEngine, ANSWER_GRACE_MS, type EngineOptions, type GamePhase, type GameMetrics } from './game/engine.js';
export {
  compensatedElapsed,
  isRttAnomalous,
  rttDistribution,
  RTT_CAP_MS,
  RTT_ANOMALY_MS,
} from './game/latency.js';
export {
  evaluate as evaluateCheat,
  FAST_MS,
  IMPOSSIBLE_MS,
  MIN_QUESTIONS_FOR_ACCURACY,
  type PlayerStats,
  type CheatFlag,
  type CheatVerdict,
} from './game/anti-cheat.js';
export { AntiCheatService } from './game/anti-cheat-service.js';
export {
  gameXp,
  ratingDeltaPlaceholder,
  GAME_BASE_XP,
  GAME_WIN_BONUS_XP,
} from './game/game-rewards.js';
export {
  RematchService,
  REMATCH_TTL_SECONDS,
  type RematchStatus,
} from './game/rematch-service.js';
export {
  expectedScore,
  kFactor,
  applyResults as applyEloResults,
  DEFAULT_RATING,
  PLACEMENT_GAMES,
  K_PLACEMENT,
  K_BASE,
  K_FLOOR,
  FORFEIT_DAMPING,
  type RatingPlayer,
  type RatingResult,
} from './ranking/elo.js';
export {
  RatingService,
  type GameOutcome,
  type RatingApplication,
  type AppliedRating,
  type RatingSummary,
} from './ranking/rating-service.js';
export { registerRatingRoutes } from './ranking/routes.js';
export {
  firstRoundMatches,
  seedByRating,
  seedOrder,
  nextPowerOfTwo,
  roundsForSize,
  parentSlot,
  type Seed,
} from './tournament/bracket.js';
export {
  TournamentService,
  NO_SHOW_MS,
  MIN_CAPACITY,
  MAX_CAPACITY,
  type CreateTournamentInput,
  type BracketMatchView,
} from './tournament/service.js';
export { registerTournamentRoutes } from './tournament/routes.js';
export {
  ShopService,
  type ShopItem,
  type CreateItemInput,
  type PurchaseResult,
} from './shop/service.js';
export { registerShopRoutes } from './shop/routes.js';
export {
  IapService,
  type RedeemResult,
  type GemPackInput,
} from './iap/service.js';
export {
  StubReceiptVerifier,
  createReceiptVerifier,
  type ReceiptVerifier,
  type VerifiedReceipt,
  type IapPlatform,
  type IapEnvironment,
} from './iap/verifier.js';
export { registerIapRoutes } from './iap/routes.js';
export {
  evaluate as evaluateFraud,
  VELOCITY_MAX_PER_HOUR,
  REFUND_ABUSE_THRESHOLD,
  type FraudFlag,
  type FraudSignals,
  type FraudVerdict,
} from './fraud/rules.js';
export { FraudService, type FraudReview } from './fraud/service.js';
export { registerFraudRoutes } from './fraud/routes.js';
export {
  faucetSink,
  driftRatio,
  isDrifting,
  EXCLUDED_REASONS,
  DRIFT_THRESHOLD,
  type LedgerEntry,
  type FaucetSink,
} from './economy/metrics.js';
export {
  EconomyService,
  type DailyPoint,
  type DriftReport,
} from './economy/service.js';
export { registerEconomyRoutes } from './economy/routes.js';
export {
  CYCLE_REWARDS,
  CYCLE_LENGTH,
  rewardForDay,
  nextCycleDay,
  statusFor as dailyRewardStatus,
  type DailyRewardState,
  type DailyRewardStatus,
} from './rewards/daily-cycle.js';
export { DailyRewardService, type ClaimResult } from './rewards/service.js';
export { registerDailyRewardRoutes } from './rewards/routes.js';
export {
  GemService,
  DEFAULT_GLOBAL_DAILY_CAP,
  type GemRule,
  type GrantResult,
} from './gems/service.js';
export { registerGemRoutes } from './gems/routes.js';
export {
  TIERS,
  promote as promoteTier,
  demote as demoteTier,
  weekStart,
  previousWeek,
  resolveStandings,
  COHORT_SIZE,
  PROMOTE_COUNT,
  DEMOTE_COUNT,
  type Tier,
  type CohortMember,
  type Standing,
} from './leagues/league-logic.js';
export { LeagueService, type LeagueView, type StandingRow } from './leagues/service.js';
export { registerLeagueRoutes } from './leagues/routes.js';
export {
  rankForScore,
  withRanks,
  isBoardType,
  type BoardType,
  type ScoreRow,
  type RankedEntry,
} from './leaderboards/rank.js';
export { LeaderboardService, type Board } from './leaderboards/service.js';
export { registerLeaderboardRoutes } from './leaderboards/routes.js';
export {
  seasonKey,
  seasonStart,
  previousSeason,
  softReset,
  seasonRewardGems,
  RATING_MEAN,
  RESET_FACTOR,
} from './seasons/season-logic.js';
export { SeasonService, type SeasonRecord } from './seasons/service.js';
export { registerSeasonRoutes } from './seasons/routes.js';
export { canonicalPair, FRIEND_CAP, REQUEST_TTL_DAYS, type Pair } from './friends/pair.js';
export {
  FriendService,
  type RequestOutcome,
  type FriendSummary,
} from './friends/service.js';
export { registerFriendRoutes } from './friends/routes.js';
export {
  SocialService,
  type Visibility,
  type FriendStatus,
  type SearchHit as UserSearchHit,
  type PublicProfile,
} from './social/service.js';
export { registerSocialRoutes } from './social/routes.js';
export {
  ChatService,
  MAX_MESSAGE_LEN,
  type DmMessage,
  type Conversation,
  type Notifier,
} from './chat/service.js';
export { registerChatRoutes } from './chat/routes.js';
export {
  ROLES,
  MAX_GROUP_MEMBERS,
  roleRank,
  outranks,
  canManage,
  canSetRole,
  type Role,
} from './groups/roles.js';
export { GroupService, type Group, type GroupMember } from './groups/service.js';
export { registerGroupRoutes } from './groups/routes.js';
export {
  GroupChatService,
  MAX_GROUP_MESSAGE_LEN,
  type GroupMessage,
  type MuteDuration,
  type RoomHub,
} from './groups/chat-service.js';
export { registerGroupChatRoutes } from './groups/chat-routes.js';
export type { PlayerAnswerEvidence, GameEndEvidence } from './game/engine.js';
export {
  questionPoints,
  rankScores,
  POINTS_BASE,
  SPEED_BONUS,
  type QuestionScoreInput,
  type ScoreLine,
} from './game/scoring.js';
export { selectQuestions, type GameQuestion, type QuestionFilter, type QuestionCategory } from './game/question-bank.js';
export { generateJoinCode, normalizeCode, isValidCode, CODE_ALPHABET, CODE_LENGTH } from './game/private-room.js';
export {
  PrivateRoomService,
  ROOM_TTL_SECONDS,
  HOST_GRACE_MS,
  MAX_PLAYERS,
  type PrivateRoom,
} from './game/private-room-service.js';
export { registerPrivateRoomRoutes } from './game/routes.js';
export { registerGameRoutes } from './game/routes.js';
export { type ClientMessageHandler } from './realtime/gateway.js';
export { ContentRepository, type ExerciseType, type LessonStatus, type LessonRow } from './content/repository.js';
export {
  validateContent,
  importCourse,
  courseContentSchema,
  type CourseContent,
  type ImportResult,
  type ImportSummary,
  type ImportIssue,
} from './content/import.js';
export {
  checkAnswer,
  validateExercisePayload,
  sanitizeExercise,
  answerSchemas,
  InvalidExercisePayloadError,
  type Verdict,
  type CheckResult as ExerciseCheckResult,
  type MultipleChoicePayload,
  type TranslatePayload,
  type MatchPairsPayload,
} from './content/exercises.js';
export { LessonSessionService, SESSION_TTL_HOURS, LESSON_XP_SOURCE, type SessionView, type AnswerResult, type SessionResults } from './content/sessions.js';
export { registerLessonRoutes } from './content/routes.js';
export {
  XpService,
  lessonCompletionXp,
  BASE_LESSON_XP,
  ACCURACY_BONUS_XP,
  REPEAT_XP_FACTOR,
  type XpAward,
} from './xp/service.js';
export { StreakService, type StreakSummary } from './streaks/service.js';
export {
  DailyGoalService,
  goalProgress,
  isGoalOption,
  GOAL_OPTIONS,
  DEFAULT_DAILY_GOAL,
  DAILY_GOAL_ZER_REWARD,
  GOAL_REWARDS_ENABLED,
  type DailyGoalStatus,
  type GoalOption,
} from './goals/service.js';
export { registerDailyGoalRoutes } from './goals/routes.js';
export {
  review,
  nextEasiness,
  dueAfter,
  qualityFromVerdict,
  INITIAL_SM2,
  MIN_EASINESS,
  DEFAULT_EASINESS,
  type Sm2State,
  type Quality,
} from './review/sm2.js';
export {
  ReviewService,
  REVIEW_QUEUE_LIMIT,
  type ReviewItem,
  type ReviewQueue,
} from './review/service.js';
export { registerReviewRoutes } from './review/routes.js';
export {
  PracticeService,
  PRACTICE_XP_FACTOR,
  PRACTICE_XP_SOURCE,
  type PracticeSession,
  type EmptyPractice,
  type PracticeResults,
} from './practice/service.js';
export { selectPracticeItems, PRACTICE_TARGET, PRACTICE_MIN } from './practice/practice-select.js';
export { registerPracticeRoutes } from './practice/routes.js';
export { registerMediaRoutes } from './media/routes.js';
export {
  nextLevel,
  isComplete,
  placedLevel,
  PLACEMENT_MAX_QUESTIONS,
  PLACEMENT_START_LEVEL,
  type PlacementStep,
} from './placement/placement.js';
export { skillStrength, MATURE_REPETITIONS, type ReviewStat } from './placement/skill-strength.js';
export { PlacementService, type PlacementView, type PlacementAnswerResult } from './placement/service.js';
export { SkillStrengthService, type SkillStrength } from './placement/strength-service.js';
export { registerPlacementRoutes } from './placement/routes.js';
export {
  skillState,
  isUnlocked,
  GOLD_STRENGTH,
  DECAY_STRENGTH,
  type SkillState,
} from './coursemap/node-state.js';
export {
  CourseMapService,
  type CourseMap,
  type SkillNode,
  type CourseSummary,
} from './coursemap/service.js';
export { registerCourseMapRoutes } from './coursemap/routes.js';
export {
  DictionaryRepository,
  normalizedHeadword,
  type Entry,
  type Sense,
  type PartOfSpeech,
  type XrefRelation,
} from './dictionary/repository.js';
export { boundedEditDistance, isWithinOneEdit, hasSearchableChars } from './dictionary/search.js';
export {
  validateLexicon,
  importLexicon,
  lexiconSchema,
  type LexiconEntry,
  type LexiconImportResult,
  type ImportConflict,
} from './dictionary/import.js';
export {
  DictionarySearchService,
  SEARCH_CACHE_TTL_SECONDS,
  type SearchResult,
  type SearchHit,
  type MatchType,
} from './dictionary/search-service.js';
export { wordOfDayIndex } from './dictionary/word-of-day.js';
export { WordOfDayService, type WordOfDay } from './dictionary/word-of-day-service.js';
export {
  SavedWordsService,
  dictItemId,
  NEW_WORDS_PER_DAY,
  type SavedWord,
  type SaveResult,
} from './dictionary/saved-words-service.js';
export { registerDictionaryRoutes } from './dictionary/routes.js';
export {
  type PronunciationScorer,
  type PronunciationScore,
  StubPronunciationScorer,
  defaultScorer,
} from './content/speaking-scorer.js';
export {
  localDate,
  dayDiff,
  shiftDate,
  settle,
  record,
  grantFreeze,
  MAX_FREEZES,
  type StreakState,
} from './streaks/streak-logic.js';
