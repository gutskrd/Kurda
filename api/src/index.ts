export { buildApp } from './app.js';
export { loadConfig, type AppConfig } from './config/env.js';
export { HealthRegistry, type CheckResult, type HealthCheck } from './health/registry.js';
export { UsersRepository, type UserRow, type CreateUserInput } from './users/repository.js';
export { canonicalUsername, USERNAME_PATTERN } from './users/username.js';
export { AppError } from './plugins/errors.js';
export { RequestValidationError, type ValidationIssue } from './plugins/validation.js';
export { Cache, cacheKey, serialize, deserialize, type CacheClient } from './cache/cache.js';
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
export { RedisMatchQueue, MemoryMatchQueue, type MatchQueue, type QueueEntry } from './game/match-queue.js';
export { registerMatchmakingRoutes } from './game/routes.js';
export { GameEngine, type EngineOptions, type GamePhase } from './game/engine.js';
export { selectQuestions, type GameQuestion } from './game/question-bank.js';
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
