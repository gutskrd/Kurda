export {
  normalizeKurdish,
  foldDiacritics,
  letterCount,
  letterKey,
  dictionaryKey,
  foldLetter,
  answerKey,
} from './kurdish-text.js';
export { matchedParts, type TextPart } from './search-highlight.js';
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
export * from './join-link.js';
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
  RUN_SHOWN_FROM,
  VERDICT_TIMING,
  AnswerQueue,
  currentExercise,
  currentStep,
  feedbackKind,
  initPlayer,
  isReask,
  nextRun,
  practisableMistakes,
  progress,
  reduce,
  runMilestone,
  type DeliveredExercise,
  type ExerciseType,
  type Feedback,
  type FeedbackKind,
  type GradeResult,
  type PendingAnswer,
  type PlayableSession,
  type PromptToken,
  type PlayerAction,
  type PlayerState,
  type PlayerStatus,
  type PutAway,
  type PutAwayType,
  type RecordedAnswer,
  type ResumeMemory,
  type SelfRating,
  type Step,
  type SubmitFn,
  type Verdict,
} from './lesson-player.js';
/** The week a kept streak is shown in, laid out the same on the phone and the website. */
export { streakWeek, weekStartsOn, type RecentDay, type WeekDay, type WeekDayState } from './streak-week.js';
/** Restoring a streak that ended: what it costs, how long it is offered, and what a Hevalo+ member is given. */
export * from './streak-repair.js';
export * from './plus.js';
/** Today's three quests, and the chests they pay: learning only, never anything paid. */
export {
  QUEST_KINDS,
  justDone,
  nextChest,
  questRows,
  waitingRows,
  withOpened,
  type ChestOpening,
  type ChestTier,
  type Quest,
  type QuestDay,
  type QuestKind,
  type QuestRow,
  type QuestStep,
} from './quests.js';
/** A right answer's praise, in the course's own Kurdish: content, kept beside the player rather than in the translations. */
export { PRAISE, praiseFor, praiseWords } from './praise.js';
/** What a lesson pays, for the server's XP rules and the "+10–20 XP" a stop's card shows. */
export { ACCURACY_BONUS_XP, BASE_LESSON_XP, PAID_STORY_REPEATS_PER_DAY, REPEAT_XP_FACTOR, lessonXpRange } from './xp.js';
/** How often a buzz may be felt, on the phone and on a touch screen alike. */
export { HAPTIC_EVENTS, PACING, createPacer, type HapticEvent, type Pacer, type PacingRules } from './haptics.js';
/** Apple's springs, the rubber band past an edge, and where a flick comes to rest: what the phone's sheets and menus move by. */
export {
  APPLE_SPRINGS,
  DECELERATION,
  RUBBER_BAND,
  project,
  releaseVelocity,
  rubberBand,
  shouldDismiss,
  snapTarget,
  springFor,
  type DragSample,
  type Spring,
  type SpringSpec,
} from './motion-physics.js';
/** The one celebration — a lesson, a level, a rank, a league, a badge — timed and thrown the same on both. */
export {
  BURST,
  CELEBRATE_MS,
  burstPlan,
  celebrationEndMs,
  celebrationPlan,
  type CelebrationPlan,
  type Fleck as CelebrationFleck,
} from './celebration.js';
/**
 * What else a finished lesson did — today's goal, the streak, a new level, the
 * league — and what the results offer next, read and timed the same on both.
 */
export {
  NO_LESSON_MOMENTS,
  RESULTS_TIMING,
  anyLessonMoment,
  freezeLine,
  lessonMoments,
  resultsActions,
  resultsGrade,
  type FreezeLine,
  type LessonMoments,
  type LessonOutcome,
  type LessonStanding,
  type LessonStreakMark,
  type ResultsAction,
  type ResultsActions,
  type ResultsGrade,
} from './lesson-moments.js';
/** After the results: the sitting's time and pace, Hevalo's words on a kept streak, and the moments that follow, alike on both. */
export {
  QUICK_PACE,
  afterResults,
  resultsOutcome,
  sittingClock,
  sittingPace,
  streakMood,
  streakSpeech,
  type AfterResults,
  type ResultsOutcome,
  type StreakMood,
} from './lesson-end.js';
/**
 * The lesson path a course map is drawn as: which skill is current, the
 * milestones, each unit's colour and where every stop sits — so the browser
 * and the phone draw the same path.
 */
export {
  PATH_GEOMETRY,
  PATH_MASCOT,
  PATH_RETURN,
  PATH_JUMP,
  UNIT_TONES,
  UNIT_TONE_ORDER,
  jumpMistakesAllowed,
  jumpPassed,
  jumpPlan,
  lean,
  lessonPath,
  lessonStates,
  mascotSpot,
  nextLaunch,
  pathChanges,
  pathSnapshot,
  stopKeys,
  type Finish,
  type LessonPath,
  type LessonState,
  type PathChanges,
  type PathLesson,
  type PathMapInput,
  type PathSkill,
  type PathSkillState,
  type PathSnapshot,
  type PathStop,
  type PathUnit,
  type PathUnitInput,
  type PlacedStop,
  type GuideStop,
  type ReviewStop,
  type SkillStop,
  type StopState,
  type TrophyStop,
  type UnitTone,
  unitTone,
} from './lesson-path.js';
/** The land the lesson path runs through: each unit's landscape, landmark and host, and where they stand. */
export {
  PATH_GROUNDS,
  PATH_LANDMARKS,
  PATH_LANDS,
  PATH_MOTION,
  PATH_SCENERY,
  PATH_TRAIL,
  hopAt,
  hostBox,
  landClear,
  landmarkBox,
  mascotBox,
  pathLand,
  trailStones,
  type PathBox,
  type PathGround,
  type PathHost,
  type PathLand,
  type PathLandmark,
  type TrailStone,
  type WorldStop,
} from './path-world.js';
/** Practice as a hub: its kinds of session, what each draws on, and what the hub shows. */
export { PRACTICE_MODES, PRACTICE_MODE_TYPES, type PracticeHub, type PracticeHubUnit, type PracticeMode } from './practice.js';
export {
  KURMANJI_KEYS,
  MIN_RECORDING_BYTES,
  MIN_RECORDING_MS,
  SORANI_KEYS,
  emptyDraft,
  emptyLiveMatch,
  emptyMatch,
  encodeAnswer,
  insertAtSelection,
  isArabicScript,
  isDraftComplete,
  isLeftMatched,
  isRightMatched,
  isSoraniDialect,
  letterDiff,
  liftTile,
  pairKey,
  placeTile,
  recordingProblem,
  tapLeft,
  tapLive,
  tapRight,
  tileAnswer,
  typedHint,
  typingKeys,
  type DiffSegment,
  type DraftAnswer,
  type LiveMatchOutcome,
  type LiveMatchState,
  type MatchPair,
  type MatchState,
  type PickedCard,
  type Selection,
  type TypedHint,
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
  GROUP_NAME_MIN,
  GROUP_NAME_MAX,
  GROUP_DESCRIPTION_MAX,
  canEditGroup,
  isRole,
  roleRank,
  outranks,
  canManage,
  canSetRole,
  type Role,
} from './group-roles.js';
/** Removed or banned, asking to come back, and clearing a group's chat: the rules both apps and the server read. */
export {
  GROUP_BAN_DURATIONS,
  GROUP_BAN_REASON_MAX,
  GROUP_REQUEST_NOTE_MAX,
  GROUP_REQUEST_COOLDOWN_DAYS,
  banEndsAt,
  canModerateGroup,
  requestCooldownDays,
  type GroupBan,
  type GroupBanDuration,
  type GroupChatCleared,
  type GroupRejoinRequest,
  type GroupRequestState,
  type GroupStanding,
} from './group-membership.js';

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
 * Refreshed shop items: the one-time notice that the shop's art was replaced.
 * The items stay their owners'; nothing bought is ever handed back.
 */
export { shouldShowRefreshNotice, type RefreshedInventory } from './cosmetics.js';

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
  LETTER_CLIPS,
  isAlphabetClipKey,
  type AlphabetClip,
  type AlphabetClipGroup,
} from './alphabet-audio.js';
/**
 * Words to know — colours, numbers, the days and the months — taught as the
 * alphabet is: each word in both dialects with what it means, its sound (the
 * alphabet's recordings and studio), the "Check yourself" round, and any
 * number up to 9999 spelled out. One copy for the website and the phone.
 */
export {
  CALENDAR_MONTHS,
  COLOURS as WORD_COLOURS,
  NEWROZ,
  RELATIVE_DAYS,
  SEASONS,
  SEASON_ORDER,
  WORD_SET_IDS,
  dayAfter,
  dayParts,
  findWord,
  glossIn,
  isWordSetId,
  kurdishWeekday,
  wordGloss,
  wordGroups,
  wordIn,
  wordSet,
  type CalendarMonth,
  type Colour as WordColour,
  type Day as WordDay,
  type DayOfYear,
  type Dialect as WordDialect,
  type Gloss as WordGloss,
  type KurdishMonth,
  type Month as WordMonth,
  type NumberWord,
  type Season,
  type SetWord,
  type Word as KurdishWord,
  type WordGroup,
  type WordGroupId,
  type WordSetId,
} from './word-sets/words.js';
export { KURDISH_NUMBER_MAX, easternDigits, kurdishNumber, readDigits } from './word-sets/number.js';
export { askWordAgain, makeWordRound, type WordQuestion, type WordQuestionKind } from './word-sets/practice.js';
export { WORD_CLIPS as SYNTHESISED_WORD_CLIPS } from './word-sets/clips.js';
export {
  SYNTHESISED_WORDS_PATH,
  WORD_SET_CLIPS,
  isWordSetClipKey,
  wordSetRecordings,
  wordSetSounds,
  type WordSetSounds,
} from './word-sets/sounds.js';
/**
 * The two Kurdish alphabets as the alphabet pages teach them: each letter, its
 * sound beside the reader's own language, a word to remember it by, where each
 * sound plays from, and the "Check yourself" round — one copy for the website
 * and the phone. The plainer names inside alphabet/ take a prefix here, so
 * they cannot clash with the rest of the package.
 */
export {
  LATIN as LATIN_LETTERS,
  SORANI as SORANI_LETTERS,
  MEANINGS as ALPHABET_MEANINGS,
  bandOf,
  compareLocaleOf,
  formsOf,
  indexInWord,
  likeFor,
  soraniLikeFor,
  type Band as LetterBand,
  type CompareLocale,
  type LatinLetter,
  type Likeness as SoundLikeness,
  type Meaning as AlphabetMeaning,
  type SoraniLetter,
} from './alphabet/letters.js';
export {
  ROUND as ALPHABET_ROUND,
  again as askAgain,
  makeRound as alphabetRound,
  type Option as AlphabetOption,
  type Question as AlphabetQuestion,
  type Script as AlphabetScript,
  type Topic as AlphabetTopic,
} from './alphabet/practice.js';
export {
  latinGroups as latinLetterGroups,
  latinHint as latinLetterHint,
  meaningLocale as exampleMeaningLocale,
  soraniGroups as soraniLetterGroups,
  type GroupId as LetterGroupId,
  type LetterGroup,
} from './alphabet/page.js';
export { CLIPS as SYNTHESISED_ALPHABET_CLIPS } from './alphabet/clips.js';
export {
  SYNTHESISED_ALPHABET_PATH,
  alphabetClipText,
  alphabetRecordings,
  alphabetSounds,
  latinSoundKey,
  latinWordKey,
  pairWordKey,
  soraniSoundKey,
  soraniWordKey,
  type AlphabetSounds,
} from './alphabet/sounds.js';
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
  shownInPrompt,
} from './lesson-audio.js';
/** Conversations in lessons: their shape, limits, and the keys each part's recordings are filed under. */
export * from './conversation.js';

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
/** The pictures a story can wear as its cover: the shop's backgrounds, keyed as `stories.cover` stores them. */
export * from './story-covers.js';

/**
 * Inviting friends to any online game and playing again (play), gifts that
 * arrive in the chat (gifts), and the chat messages that carry them
 * (chat-cards) — the same names, states and limits in the API and both apps.
 */
export * from './play.js';
export * from './gifts.js';

/**
 * The learning games (Build a Sentence and the games after it): the
 * one registry, the two varieties as 'kmr' | 'ckb' with their script rules,
 * the schemas of the games' own content and the shapes a round is sent in.
 */
export * from './games/index.js';

/**
 * Shop items by kind — the categories, the search, the filters and the orders
 * the shop, the inventory and the gift picker share (shop-items).
 */
export * from './shop-items.js';
export * from './chat-cards.js';

/**
 * Typing Kurdish (the race, Peyvok's keyboard, the keyboard guide): how a
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
 * Crash reports from the apps: what one may carry, the limits the phone trims
 * to and the server holds it to, and how its text is cleaned of anything that
 * could name somebody.
 */
export * from './client-errors.js';

/**
 * Hevalo the deer holding up a board: the board, its forelegs and where the
 * mascot's picture goes, for the rating box and the keyboard guide on both apps.
 */
export * from './deer.js';

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
/**
 * Game Ranks: the games with a rank, the tier table and its helpers, the
 * season calendar and rewards, Rated/Friendly and the shapes the API sends —
 * one copy for the API, both apps and the admin panel.
 */
export * from './ranks.js';
/** Who provides Hevalo and how to reach them: the one file the owner fills in. */
export { PROVIDER, isProviderPlaceholder, type ProviderIdentity } from './provider.js';

/**
 * Learning Leagues (the weekly table that rewards effort) and badges: the tier
 * keys, the week, the goal and the zones; the badge catalogue and its progress
 * sums — one copy for the API, both apps and the admin.
 */
export * from './leagues.js';
export * from './badges.js';

/**
 * Badge medallions, rank and league emblems and season frames, drawn by code
 * as SVG strings (contract 4, B3): inlined on the web, `SvgXml` on the phone.
 * The art's own key lists are exported with an `Art` prefix so they cannot
 * clash with the badge catalogue's and the ranks' lists, which own the names.
 */
export {
  EMAIL_PICTURES,
  emailPictureLoopMs,
  emailPictureStill,
  emailPictureSvg,
  emailPictureTone,
  type EmailArtOptions,
  type EmailPicture,
  badgeSvg,
  badgeShineSvg,
  badgeShines,
  badgeColour,
  dayMedalSvg,
  streakMedalSvg,
  type DayMedal,
  type MedalOptions,
  rankEmblemSvg,
  placementEmblemSvg,
  PLACEMENT_GAMES,
  leagueEmblemSvg,
  seasonFrameSvg,
  seasonFrameShineSvg,
  SEASON_FRAME_INNER,
  SEASON_FRAME_SHINE,
  SMALL_BADGE,
  SMALL_EMBLEM,
  SMALL_LEAGUE,
  SMALL_FRAME,
  coinSvg,
  gemSvg,
  CURRENCY_CANVAS,
  type CurrencyOptions,
  wordSetSvg,
  IMPOSTOR_CATEGORY_PICTURES,
  IMPOSTOR_EMBLEMS_DRAWN,
  IMPOSTOR_WAYS_DRAWN,
  impostorCategoriesInOrder,
  impostorCategoryRank,
  impostorCategorySvg,
  impostorCategoryTone,
  impostorEmblemSvg,
  impostorWaySvg,
  impostorWayTone,
  type ImpostorArtOptions,
  type ImpostorEmblem,
  type ImpostorWay,
  type WordSetArtOptions,
  type WordsCardId,
  TICKET_ART_BOX,
  TICKET_ART_OUTLINE,
  TICKET_ART_PERFORATION,
  TICKET_ART_STUB,
  TICKET_ART_TEAR,
  TICKET_ART_TILES,
  CHEST_BOX,
  CHEST_FOOT,
  CHEST_HOP,
  CHEST_HOP_LAND,
  CHEST_HOP_LID,
  CHEST_HOP_LIGHT,
  CHEST_HOP_MS,
  CHEST_HOP_SHADOW,
  CHEST_HOP_SPARKLE,
  CHEST_LAYERS,
  CHEST_SMALL,
  CHEST_TINTS,
  CHEST_TINY,
  CHEST_VIEW,
  chestDrawing,
  chestGlint,
  chestHopAt,
  chestLayerSvg,
  chestSvg,
  type ChestBox,
  type ChestDrawing,
  type ChestHopCurve,
  type ChestHopFrame,
  type ChestLayer,
  type ChestLayerId,
  type ChestOptions,
  type ChestSvgOptions,
  PATH_LANDMARK_LOOP,
  PATH_STOP_ART,
  PATH_STOP_LOOKS,
  PATH_STOP_TONES,
  pathGroundColour,
  pathLandSvg,
  pathLandmarkSvg,
  pathLoopSvg,
  pathStonesSvg,
  pathStopSvg,
  type PathLandOptions,
  type PathLandmarkOptions,
  type PathLoop,
  type PathLoopKind,
  type PathLoopOptions,
  type PathStonesOptions,
  type PathStopLook,
  type PathStopOptions,
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
  type PlacementEmblemOptions,
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
  GAME_EMBLEMS,
  GAME_EMBLEM_SAMPLES,
  gameEmblemLayers,
  gameEmblemLoopMs,
  gameEmblemSvg,
  gameEmblemTone,
  isGameEmblem,
  type GameArtOptions,
  type GameEmblem,
  type GameEmblemLayer,
  type GamePose,
  TREE_FOOT,
  TREE_TOP,
  TREE_WATER_LANDS,
  hasTreeArt,
  treeColour,
  treeSvg,
  waterDropSvg,
  wateringCanSvg,
  type TreeOptions,
  TREE_SKIES,
  treeAir,
  treeCloudSvg,
  treeSceneSvg,
  treeSkyAt,
  type TreeAir,
  type TreeSceneOptions,
  type TreeSky,
} from './art/index.js';
/**
 * The art's metals, for the parts of a screen drawn around an emblem — a
 * progress bar, a glow, a confetti fleck — so they are the emblem's own
 * colours rather than a near copy kept beside it.
 */
export {
  RANK_METAL as ART_RANK_METAL,
  LEAGUE_METAL as ART_LEAGUE_METAL,
  TIER_METAL as ART_TIER_METAL,
  type Metal as ArtMetal,
} from './art/palette.js';
/** The streak's fire: its flames, sparks and logs, their colours and how each part moves, drawn the same by both apps. */
export * from './art/fire.js';
/** How big the fire burns: its stages from cold logs to the Newroz fire, by the streak's days or a run of right answers. */
export {
  COLD_FIRE,
  FIRE_GROW,
  FIRE_STAGES,
  FIRE_STAGE_DAYS,
  fireGrewToday,
  fireLevel,
  fireStageIndex,
  nextFireStage,
  runFireLevel,
  stageBefore,
  type FireLevel,
  type FireStage,
} from './fire-stages.js';
/** The learner's tree: its kinds and prices, how it grows with water and fares without it, planting and watering. */
export * from './tree.js';
/** The kept streak's card coming alive: when its medal takes its turn and when each part of the card arrives, alike on both. */
export { STREAK_LEAVE_MS, STREAK_LEAVE_POSE, smoothPoses, streakReveal, type MedalPose, type StreakReveal } from './streak-reveal.js';
/** The fire as a moment of its own: the day it grew and how it lights up, a run's milestone, and the ladder of stages a streak climbs. */
export {
  FIRE_GREW_READ_MS,
  FLAME_IGNITE,
  RUN_MOMENT_MS,
  fireLadder,
  flameMoment,
  runMoment,
  type FireLadderPlace,
  type FireLadderStep,
  type FlameMoment,
  type LitFireStage,
} from './fire-moments.js';
/** The mouth shapes a speaking character shows, and the timeline a recording's mouth follows. */
export * from './lipsync/index.js';
/** Hevalo, Hamo and Xezo: the characters who say a recording, drawn once for web and phone. */
export * from './characters/index.js';
/** "Chrome on Windows": the name a signed-in browser is listed under. */
export { DEVICE_NAME_MAX, deviceNameFrom } from './device-name.js';
/** How the wall can be ordered — newest, oldest, most popular, most discussed — and how far back a ranked wall looks. */
export * from './feed-sort.js';
/**
 * How much of each thing one person may have — groups, friends, requests,
 * blocks, saved words, invites, games — and the one shape a refusal for any
 * of them takes, so the API and both apps agree on the numbers and the words.
 */
export * from './limits.js';
// the security log's kinds of event, how serious each is and how the panel names it
export * from './security-log.js';
// every picture an admin can replace with an upload, and how the apps find the replacement
export * from './art-slots.js';
// the addresses vulnerability scanners try, which no Hevalo page can ever be
export * from './scanner-paths.js';
// taking Hevalo offline for a while from the admin, and what people see meanwhile
export * from './maintenance.js';
/**
 * The multiplayer learning games: the dialect letter rules the word games
 * share, the generic engine's contract and the room every game is drawn in,
 * and The Last Letter's rules and Learn entry.
 */
export * from './games/letters.js';
export * from './games/multi/games.js';
export * from './games/multi/rules.js';
export * from './games/multi/view.js';
export * from './games/last-letter/rules.js';
export * from './games/last-letter/learn.js';
export * from './games/last-letter/slip.js';

/**
 * The games where players write their own Kurdish: what a clue or a guess
 * may be, and Impostor's rules.
 */
export * from './games/clues.js';
export * from './games/multi/order.js';
export * from './games/impostor/rules.js';
export * from './games/impostor/couch.js';
export * from './pending-signup.js';
