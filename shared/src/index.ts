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
