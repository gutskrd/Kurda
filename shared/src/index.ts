export {
  normalizeKurdish,
  foldDiacritics,
  letterCount,
  letterKey,
  dictionaryKey,
  foldLetter,
  answerKey,
} from './kurdish-text.js';
export { plan, toLexicon, type Chunk, type ConvertedEntry, type SourceEntry } from './ferheng.js';
export { FERHENG_LANGS, publishedFerheng, type FerhengSource, type Manifest } from './ferheng-source.js';
export { escapeHtml, stripControlChars, hasHtmlSpecialChars } from './sanitize.js';
export { XSS_PAYLOADS } from './xss-corpus.js';
export { COUNTRIES, countriesIn, countryName, type Country } from './countries.js';
export {
  buildInviteUrl,
  invitePath,
  inviteLinkPattern,
  parseInvite,
  inviteRoutePath,
  type GameInvite,
  type GameInviteType,
} from './game-invites.js';
export {
  APP_LOCALES,
  APP_LOCALE_CODES,
  DEFAULT_LOCALE,
  isAppLocale,
  localeDir,
  localeFromTag,
  type AppLocale,
} from './locales.js';
/**
 * The lesson player: what comes next after an answer, a missed item asked
 * again, a resumed lesson, and the answer drafts and key bar — the browser and
 * the phone run the same rules, so they cannot disagree about what counts.
 */
export {
  REASK_GAP,
  AnswerQueue,
  currentExercise,
  currentStep,
  feedbackKind,
  initPlayer,
  isReask,
  practisableMistakes,
  progress,
  reduce,
  type DeliveredExercise,
  type ExerciseType,
  type Feedback,
  type FeedbackKind,
  type GradeResult,
  type PendingAnswer,
  type PlayableSession,
  type PlayerAction,
  type PlayerState,
  type PlayerStatus,
  type RecordedAnswer,
  type ResumeMemory,
  type SelfRating,
  type Step,
  type SubmitFn,
  type Verdict,
} from './lesson-player.js';
export {
  KURMANJI_KEYS,
  MIN_RECORDING_BYTES,
  MIN_RECORDING_MS,
  SORANI_KEYS,
  emptyDraft,
  emptyMatch,
  encodeAnswer,
  insertAtSelection,
  isArabicScript,
  isDraftComplete,
  isLeftMatched,
  isRightMatched,
  isSoraniDialect,
  letterDiff,
  recordingProblem,
  tapLeft,
  tapRight,
  typingKeys,
  type DiffSegment,
  type DraftAnswer,
  type MatchPair,
  type MatchState,
  type Selection,
} from './lesson-answers.js';
/** Grammar notes ("Tips"), parsed once for the phone and the browser (KUR-038). */
export { parseInline, parseMarkdown, type Block, type Span } from './grammar-markdown.js';
/**
 * Group role rules (KUR-084). Here rather than in the API because all three
 * apps decide what to show from them, and three copies of who-can-remove-whom
 * is three chances to disagree about it.
 */
export {
  ROLES,
  MAX_GROUP_MEMBERS,
  isRole,
  roleRank,
  outranks,
  canManage,
  canSetRole,
  type Role,
} from './group-roles.js';

/**
 * Tags & badges, for the same reason as the roles above: the API decides whether
 * a claim is allowed, and both clients have to offer the same options before one
 * is made.
 */
export {
  claimableCatalog,
  purchasableTags,
  tagLabel,
  type Acquisition,
  type ClaimedTag,
  type DisplayTag,
  type ProfileTags,
  type TagKind,
  type TagRow,
} from './tags.js';
/**
 * Refreshed shop items: the one-time notice and returning an item for what was
 * paid, after the shop's art was replaced.
 */
export {
  ITEM_RETURN_ERRORS,
  shouldShowRefreshNotice,
  type ItemRefund,
  type ItemReturnError,
  type RefreshedInventory,
  type RefundCurrency,
  type ReturnItemResult,
} from './cosmetics.js';

/**
 * Writing a post — words and up to four pictures in one box: the limits, what
 * kind of post it is, how characters are counted, and the draft kept on the
 * device, the same for the API and both apps.
 */
export * from './post-composer.js';
export {
  ALPHABET_CLIPS,
  ALPHABET_CLIP_GROUPS,
  ALPHABET_CLIP_MAX_SECONDS,
  isAlphabetClipKey,
  type AlphabetClip,
  type AlphabetClipGroup,
} from './alphabet-audio.js';
/**
 * Which Kurdish texts a lesson wants recorded, and the key a recording is filed
 * under — the admin's audio studio and the API's lesson delivery must agree.
 */
export {
  LESSON_AUDIO_MAX_SECONDS,
  LESSON_AUDIO_TEXT_MAX,
  lessonAudioKey,
  lessonAudioTargets,
  primaryAudioTarget,
} from './lesson-audio.js';

/**
 * Age from a birth month and year, for the same reason again: the API decides
 * who is a minor, and both sign-up forms must ask and refuse alike.
 */
export {
  ADULT_AGE,
  DIGITAL_CONSENT_AGE,
  EARLIEST_BIRTH_YEAR,
  MIN_SIGNUP_AGE,
  ageInYears,
  birthYearChoices,
  isBelowConsentAge,
  isBelowMinimumAge,
  isMinor,
  isPlausibleBirthMonth,
  type BirthMonth,
} from './age.js';

/**
 * Stories and their quizzes (they replaced the ranked quiz): the presets, the
 * word bands, how a story is cut into paragraphs and sentences, and the shapes
 * the API sends — so the API, both apps and the admin editor cannot disagree.
 */
export * from './stories.js';
/** What a story must be before it is saved or published, one copy for the API, the importer and the editor. */
export * from './story-authoring.js';

/**
 * Inviting friends to any online game and playing again (play), gifts that
 * arrive in the chat (gifts), and the chat messages that carry them
 * (chat-cards) — the same names, states and limits in the API and both apps.
 */
export * from './play.js';
export * from './gifts.js';
export * from './chat-cards.js';

/**
 * Typing Kurdish (the race, Wordle's keyboard, the keyboard guide): how a
 * typed text is read and scored, and the race's shapes — one reading for the
 * server and both apps.
 */
export * from './typing.js';

/**
 * The one-time rating box, "Send feedback", the native store prompt that is
 * never tied to the stars, and the admin's feedback inbox.
 */
export * from './feedback.js';

/**
 * Reports, moderation cases, sanctions and appeals: the categories and their
 * priorities, what can be reported, what each sanction stops, the standing and
 * appeal shapes the apps show, and the case shapes the admin panel reads.
 */
export * from './reports.js';
/**
 * Copyright notices from the public form, counter-notices and strikes: the
 * fields both laws ask for, the checks the form and the API share, and what
 * the case view returns.
 */
export * from './copyright.js';
/** Who provides Hevalo and how to reach them: the one file the owner fills in. */
export { PROVIDER, isProviderPlaceholder, type ProviderIdentity } from './provider.js';

/**
 * Badge medallions, rank and league emblems and season frames, drawn by code
 * as SVG strings (contract 4, B3): inlined on the web, `SvgXml` on the phone.
 * The art's own key lists are exported with an `Art` prefix so they cannot
 * clash with the badge catalogue's and the ranks' lists, which own the names.
 */
export {
  badgeSvg,
  badgeShineSvg,
  badgeShines,
  rankEmblemSvg,
  leagueEmblemSvg,
  seasonFrameSvg,
  seasonFrameShineSvg,
  SEASON_FRAME_INNER,
  SEASON_FRAME_SHINE,
  SMALL_BADGE,
  SMALL_EMBLEM,
  SMALL_LEAGUE,
  SMALL_FRAME,
  BADGES as ART_BADGES,
  BADGE_KEYS as ART_BADGE_KEYS,
  BADGE_FAMILIES as ART_BADGE_FAMILIES,
  RANK_BADGE as ART_RANK_BADGE,
  isBadgeKey as hasBadgeArt,
  SEASONS as ART_SEASONS,
  type BadgeOptions,
  type BadgeShineOptions,
  type BadgeState,
  type RankEmblemOptions,
  type LeagueEmblemOptions,
  type SeasonFrameOptions,
  type SeasonFrameShineOptions,
  type BadgeKey as ArtBadgeKey,
  type BadgeFamily as ArtBadgeFamily,
  type BadgeTier as ArtBadgeTier,
  type RankTier as ArtRankTier,
  type RankDivision as ArtRankDivision,
  type LeagueTier as ArtLeagueTier,
  type Season as ArtSeason,
} from './art/index.js';
