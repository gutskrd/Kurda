export {
  normalizeKurdish,
  foldDiacritics,
  letterCount,
  letterKey,
  dictionaryKey,
  foldLetter,
  answerKey,
} from './kurdish-text.js';
/** Usernames: the one rule the server, the browser and the phone check, and how a name is read out of text. */
export * from './username.js';
export { matchedParts, type TextPart } from './search-highlight.js';
export { plan, toLexicon, type Chunk, type ConvertedEntry, type SourceEntry } from './ferheng.js';
export { FERHENG_LANGS, publishedFerheng, type FerhengSource, type Manifest } from './ferheng-source.js';
export { escapeHtml, isPlainPath, stripControlChars, stripHiddenChars } from './sanitize.js';
export { XSS_PAYLOADS } from './xss-corpus.js';
export { COUNTRIES, countriesIn, countryName, type Country } from './countries.js';
export {
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
/** The lesson player: what follows an answer, missed items asked again, resumed lessons, answer drafts and the key bar. */
export {
  ASKS_BY_TYPE,
  EXERCISE_ASKS,
  GAP,
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
  PRACTICE_SESSION_SIZE,
  progress,
  reduce,
  runMilestone,
  splitGap,
  type DeliveredExercise,
  type ExerciseAsk,
  type ExerciseType,
  type Feedback,
  type FeedbackKind,
  type GradeResult,
  type NewWord,
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
export { addDays, firstDayOfWeek, streakWeek, weekStartsOn, weekdayName, type RecentDay, type WeekDay, type WeekDayState } from './streak-week.js';
/** The daily view's two weeks, its stats and what its insights say, read alike by both apps. */
export {
  TODAY_DAYS,
  insightTrend,
  recentDays,
  splitWeeks,
  weekInsights,
  weekStats,
  xpAxis,
  type Insight,
  type TodayBadge,
  type TodayDay,
  type TodayWeek,
  type TodayWeeks,
  type WeekStats,
} from './daily-view.js';
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
/** Event quests: their order, whether each can be claimed, and what each pays. */
export {
  eventQuestShare,
  eventQuestState,
  eventQuestTitle,
  eventRewardParts,
  sortEventQuests,
  type ActiveEvent,
  type EventQuest,
  type EventQuestReward,
  type EventQuests,
  type EventQuestState,
  type EventQuestType,
  type EventRewardCurrency,
} from './event-quests.js';
/** The daily XP goal's targets and its status. */
export { GOAL_OPTIONS, isGoalOption, type DailyGoalStatus, type GoalOption } from './daily-goal.js';
/** A right answer's praise in the course's own Kurdish: content, kept beside the player rather than in the translations. */
export { PRAISE, praiseFor, praiseWords } from './praise.js';
/** What a lesson pays, for the server's XP rules and the "+10–20 XP" a stop's card shows. */
export { ACCURACY_BONUS_XP, BASE_LESSON_XP, PAID_STORY_REPEATS_PER_DAY, REPEAT_XP_FACTOR, lessonXpRange } from './xp.js';
/** How often a buzz may be felt, on the phone and on a touch screen alike. */
export { HAPTIC_EVENTS, PACING, createPacer, type HapticEvent, type Pacer, type PacingRules } from './haptics.js';
/** Spring motion, the rubber band past an edge, and where a flick comes to rest, for the phone's sheets and menus. */
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
/** The one celebration for a lesson, a level, a rank, a league or a badge, timed the same on both apps. */
export {
  BURST,
  CELEBRATE_MS,
  burstPlan,
  celebrationEndMs,
  celebrationPlan,
  type CelebrationPlan,
  type Fleck as CelebrationFleck,
} from './celebration.js';
/** What else a finished lesson did (today's goal, the streak, a new level, the league) and what its results offer next. */
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
/** A win as it is shared: the mark its line ends on, the word game's grid, and which wins are offered for sharing. */
export * from './win-share.js';
/** A win's own address, and the picture a link to it is drawn with. */
export * from './win-link.js';
/** The lesson path a course map is drawn as: the current skill, milestones, unit colours and stop places. */
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
  type Finish,
  type LessonPath,
  type LessonState,
  type PathChanges,
  type PathLesson,
  type PathMapInput,
  type PathSkill,
  type PathSkillState,
  type PathSection,
  type PathSnapshot,
  type PathStop,
  type PathUnit,
  type PathUnitInput,
  type PlacedStop,
  type ReviewStop,
  type RingAt,
  type RingChange,
  type SectionState,
  type SkillStop,
  type StopState,
  type StoryStop,
  type TrophyStop,
  type UnitTone,
  unitTone,
} from './lesson-path.js';
/** A topic's rounds: the ring round its stop and the stars under it, from how often each lesson was finished. */
export { PATH_RING, TOPIC_STARS, nextInRound, ringPieces, roundStars, starPath, topicRounds, type TopicRounds } from './lesson-rounds.js';
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
/** Grammar notes ("Tips"), parsed once for the phone and the browser. */
export { parseInline, parseMarkdown, type Block, type Span } from './grammar-markdown.js';
/** Group role rules, which every app reads to decide what to show. */
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

/** Tags and badges: the API decides whether a claim is allowed, and both clients offer the same options. */
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
/** The one-time notice that the shop's art was replaced; the items stay their owners' and nothing is handed back. */
export { shouldShowRefreshNotice, type RefreshedInventory } from './cosmetics.js';

/** Writing a post, words and up to four pictures in one box: the limits, the post kind, character counting and the saved draft. */
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
 * Words to know (colours, numbers, days and months), taught as the alphabet is: each word in both dialects with its
 * meaning, its sound, the "Check yourself" round, and numbers up to 9999 spelled out.
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
 * The two Kurdish alphabets as the alphabet pages teach them: letters, sounds, example words, where each sound plays from
 * and the "Check yourself" round. Plain names from alphabet/ take a prefix here so they cannot clash.
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
/** Which Kurdish texts a lesson wants recorded and the key a recording is filed under, shared by the audio studio and the API. */
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
/** Hevalo's and Xezo's reaction lines: the catalogue, the key each take is filed under, and which plays when. */
export * from './reactions.js';

/** Age from a birth month and year: the API decides who is a minor, and both sign-up forms ask and refuse alike. */
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

/** Letters by bird: pen pals writing in Kurdish, within an age band, carried by each writer's bird. */
export {
  BIRD_CALLS_PER_DAY,
  BIRD_OUT_DAYS,
  LANDINGS_MAX,
  LETTERS_CHANGED,
  LETTERS_PAGE,
  LETTERS_PAGE_MAX,
  LETTERS_PER_DAY,
  LETTER_AGE_BANDS,
  LETTER_BIRDS,
  LETTER_BIRD_ORDER,
  LETTER_BIRD_PRICE,
  LETTER_MAX,
  LETTER_MIN,
  PEN_PALS_MAX,
  SKY_BIRDS_SHOWN,
  VISIT_HOURS,
  freshLetters,
  isLetterBird,
  letterAgeBand,
  letterBirdOf,
  letterNoticeOf,
  letterProblem,
  letterText,
  letterThreadPath,
  withEarlierLetters,
  type BirdOutResult,
  type LetterAgeBand,
  type LetterFlight,
  type LetterItem,
  type LetterLanding,
  type LetterNotice,
  type LetterPerson,
  type LetterProblem,
  type LetterReturnReason,
  type LetterThread,
  type LetterVisitor,
  type LettersChangedEvent,
  type LettersHome,
  type LettersRefusal,
  type PenPal,
  type VisitorAnswer,
} from './letters.js';
/** A letter's own paper, the drawing and notes on it, the colours it is drawn in, and the letter widget's shapes. */
export * from './letter-paper.js';
/** The letters window, worked out once for both apps: which bird is where on the sill, and what is said under it. */
export {
  emptyLook,
  firstLook,
  flightOf,
  landingsOf,
  lookAfterAnswer,
  lookAfterBirdChosen,
  lookAfterCall,
  lookAfterLanded,
  lookAfterOwnGone,
  lookAfterRecall,
  lookAfterSend,
  lookAfterSendOn,
  lookAfterVisitorGone,
  lookInMotion,
  lookWithMoment,
  nextLook,
  untilServerTime,
  type LetterWindowScene,
  type WindowLanded,
  type WindowLook,
  type WindowMoment,
  type WindowReturn,
  type WindowSpot,
} from './letter-window.js';

/** Stories and their quizzes: presets, word bands, paragraph and sentence splitting, and the API shapes. */
export * from './stories.js';
/** What a story must be before it is saved or published, one copy for the API, the importer and the editor. */
export * from './story-authoring.js';
/** The covers a story can have (the shop's backgrounds, keyed as `stories.cover` stores them) and the kilim used without one. */
export * from './story-covers.js';
/** The riddles and proverbs: lists and translations, what solves a riddle, the day's riddle and proverb, and the API shapes. */
export * from './lore.js';

/** Inviting friends to online games and playing again (play), gifts in the chat (gifts) and the chat messages that carry them (chat-cards). */
export * from './play.js';
export * from './gifts.js';

/** The learning games: the registry, the two varieties as 'kmr' | 'ckb' with their script rules, content schemas and round shapes. */
export * from './games/index.js';

/** Shop items by kind: the categories, search, filters and orders the shop, the inventory and the gift picker share. */
export * from './shop-items.js';
export * from './shop-descriptions.js';
export * from './chat-cards.js';
/** Unread chat counts for the badges, a group's capped, and how a badge writes one. */
export * from './chat-unread.js';
/** The Kurdish openers an empty chat offers, and which variety it offers them in. */
export * from './chat-greetings.js';

/** Typing Kurdish (the race, Peyvok's keyboard, the keyboard guide): how typed text is read and scored, and the race's shapes. */
export * from './typing.js';

/** The one-time rating box, "Send feedback", the store prompt (never tied to the stars) and the admin's feedback inbox. */
export * from './feedback.js';

/** Crash reports from the apps: what one may carry, the limits, and how its text is cleaned of anything that could name somebody. */
export * from './client-errors.js';

/** Hevalo the deer holding up a board, for the rating box and the keyboard guide on both apps. */
export * from './deer.js';

/** Reports, moderation cases, sanctions and appeals. */
export * from './reports.js';
/** How a shared picture is checked before others see it: held, refused with a reason, or asked about again. */
export * from './picture-review.js';
/** Accounts held while a person checks a possible return of a banned person, and what a ban does to content. */
export * from './account-hold.js';
/** Copyright notices from the public form, counter-notices and strikes. */
export * from './copyright.js';
/** Game Ranks: the ranked games, the tier table, seasons and rewards, Rated or Friendly, and the API shapes. */
export * from './ranks.js';
/** Who provides Hevalo and how to reach them. */
export { PROVIDER, isProviderPlaceholder, type ProviderIdentity } from './provider.js';

/** Learning Leagues (the weekly table that rewards effort) and badges. */
export * from './leagues.js';
export * from './badges.js';

/**
 * Badge medallions, rank and league emblems and season frames as SVG strings: inlined on the web, `SvgXml` on the phone.
 * The art's own key lists carry an `Art` prefix so they cannot clash with the catalogues' lists, which own the names.
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
  STAMP_GLOW,
  STAMP_GLOW_REACH,
  STAMP_MEANING_INK,
  STAMP_NIGHT_GLOW,
  STAMP_NIGHT_REACH,
  STAMP_SHAPE,
  STAMP_SHELF_GLOW,
  stampBox,
  stampGlow,
  stampLook,
  stampOutline,
  stampPerforations,
  stampShapeFor,
  stampSize,
  stampSvg,
  type StampLook,
  type StampOptions,
  type StampShape,
  SHARE_CARD,
  SHARE_CARD_KINDS,
  isShareCardKind,
  shareCardSvg,
  type ShareCardKind,
  type ShareCardOptions,
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
  pathSignpostSvg,
  pathStonesSvg,
  pathStopSvg,
  type PathSignpostOptions,
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
  gameEmblemHue,
  gameEmblemTone,
  isGameEmblem,
  PLAY_GAME_EMBLEM,
  playGameHue,
  type GameArtOptions,
  type GameEmblem,
  type GameEmblemLayer,
  type GamePose,
  TREE_FOOT,
  TREE_TOP,
  TREE_WATER_LANDS,
  hasTreeArt,
  treeColour,
  treeRig,
  treeSeasonAir,
  treeSvg,
  waterDropSvg,
  wateringCanSvg,
  type TreeOptions,
  type TreeRig,
  type TreeSeasonAir,
  TREE_DRINK,
  TREE_GROW,
  TREE_PLANT_DROP,
  TREE_REVIVE,
  TREE_SHAKE,
  TREE_SWAY,
  TREE_SWING,
  TREE_WAVE,
  TREE_WAVE_AT,
  treeGrowFrom,
  treeHeft,
  treePhase,
  treeSwayDeg,
  treeWave,
  TREE_SKIES,
  treeAir,
  treeCloudSvg,
  treeSceneSvg,
  treeSkyAt,
  TREE_STUDIO,
  TREE_STUDIO_HORIZON,
  TREE_STUDIO_PLACE,
  treeStudioSvg,
  type TreeStudioOptions,
  type TreeAir,
  type TreeSceneOptions,
  type TreeSky,
  horizonSky,
  horizonSvg,
  type HorizonOptions,
  LETTER_BIRD_FEET,
  LETTER_FAR_OFF,
  LETTER_FLIGHT,
  LETTER_NOTES,
  LETTER_OPENING,
  LETTER_PLANT_SWAY,
  LETTER_PLAY,
  LETTER_PLAY_BESIDE,
  LETTER_SILL,
  LETTER_SILL_SPOTS,
  LETTER_SKY,
  LETTER_SPRITES,
  LETTER_WINDOW_DEPTH,
  LETTER_WINDOW_PARTS,
  letterBirdSvg,
  letterDrifts,
  letterEnvelopeSvg,
  letterFlightFrom,
  letterFlightShadow,
  letterPlayShadow,
  letterPlayShows,
  letterShadowSvg,
  letterSillBox,
  letterSillShift,
  letterSpriteSvg,
  letterWindowSvg,
  type LetterBirdOptions,
  type LetterDrift,
  type LetterEnvelopeOptions,
  type LetterPlay,
  type LetterPlayMove,
  type LetterShadowKey,
  type LetterShadowOptions,
  type LetterSkyBird,
  type LetterSpot,
  type LetterSprite,
  type LetterSpriteOptions,
  type LetterWindowOptions,
  type LetterWindowPart,
  letterPaperSvg,
  type LetterPaperOptions,
  PIGEON_POSES,
  type PigeonPose,
  type SongbirdPose,
  WORD_PICTURES,
  WORD_PICTURE_IDS,
  wordPictureSvg,
  type WordPictureId,
  type WordPictureOptions,
  BOOK_APPLE_BITES,
  BOOK_BACKDROP,
  BOOK_PAINTS,
  BOOK_POSES,
  BOOK_SETTINGS,
  BOOK_SPOTS,
  bookAppleSvg,
  bookBackdropSvg,
  bookCastSvg,
  bookPaintSvg,
  bookPostmarkSvg,
  bookRidgeAt,
  bookSkyMarks,
  bookSpotSvg,
  type BookArtOptions,
  type BookCastOptions,
  type BookOrb,
  type BookPaint,
  type BookPose,
  type BookSetting,
  type BookSkyBox,
  type BookSkyMark,
  type BookSpot,
} from './art/index.js';
/** The art's metals, for what a screen draws around an emblem (a progress bar, a glow, confetti), so the colours match exactly. */
export {
  RANK_METAL as ART_RANK_METAL,
  LEAGUE_METAL as ART_LEAGUE_METAL,
  TIER_METAL as ART_TIER_METAL,
  type Metal as ArtMetal,
} from './art/palette.js';
/** The nine hues things are coloured in beside the app's own violet, each in the same four steps, light and dark. */
export { HUES, HUE_NAMES, hueSteps, isHueName, type HueName, type HueScheme, type HueSteps } from './hues.js';
/** The streak's fire: its flames, sparks and logs, their colours and how each part moves, drawn the same by both apps. */
export * from './art/fire.js';
/** A drawing bent through a map of the plane, as his head turned in the round is drawn. */
export { mapMarkup, mapPath, type PlaneMap } from './art/warp.js';
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
  type FireLevel,
  type FireStage,
} from './fire-stages.js';
/** The learner's tree: its kinds and prices, how it grows with water and fares without it, planting and watering. */
export * from './tree.js';
/** The kept streak's card: when its medal moves and when each part of the card arrives, alike on both apps. */
export { STREAK_LEAVE_MS, STREAK_LEAVE_POSE, smoothPoses, streakReveal, type MedalPose, type StreakReveal } from './streak-reveal.js';
/** The fire as a moment of its own: the day it grew, a run's milestone, and the stages a streak climbs. */
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
/** How much of each thing one person may have (groups, friends, requests, blocks, saved words, invites, games) and the one refusal shape. */
export * from './limits.js';
// The security log's kinds of event, how serious each is and how the panel names it.
export * from './security-log.js';
// Every picture an admin can replace with an upload, and how the apps find the replacement.
export * from './art-slots.js';
// The addresses vulnerability scanners try, which no Hevalo page can ever be.
export * from './scanner-paths.js';
// Taking Hevalo offline for a while from the admin, and what people see meanwhile.
export * from './maintenance.js';
/** The multiplayer learning games: the word games' letter rules, the engine's contract, the game room and The Last Letter. */
export * from './games/letters.js';
export * from './games/multi/games.js';
export * from './games/multi/rules.js';
export * from './games/multi/view.js';
export * from './games/last-letter/rules.js';
export * from './games/last-letter/learn.js';
export * from './games/last-letter/slip.js';

/** The games where players write their own Kurdish: what a clue or a guess may be, and Impostor's rules. */
export * from './games/clues.js';
export * from './games/multi/order.js';
export * from './games/impostor/rules.js';
export * from './games/impostor/couch.js';
export * from './pending-signup.js';

/** How a notification is sorted into the list's filters and pictured at the end of its row. */
export * from './notices.js';
