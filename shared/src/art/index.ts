/**
 * Hevalo's badge, rank, league and season-frame art, drawn by code (contract 4,
 * B3). Every function returns an SVG string: the web inlines it, the phone
 * draws it with react-native-svg's `SvgXml`, and both show the same pixels.
 *
 * Deterministic — the same arguments give the same string — and self-contained:
 * no images, fonts or links, nothing fetched.
 */
export * from './keys.js';
export { badgeSvg, badgeShineSvg, badgeShines, badgeColour, SMALL_BADGE, type BadgeOptions, type BadgeShineOptions, type BadgeState } from './badges.js';
export { dayMedalSvg, streakMedalSvg, type DayMedal, type MedalOptions } from './medals.js';
export { TREE_FOOT, TREE_TOP, TREE_WATER_LANDS, hasTreeArt, treeColour, treeSeasonAir, treeSvg, waterDropSvg, wateringCanSvg, type TreeOptions, type TreeSeasonAir } from './trees.js';
export {
  TREE_SKIES,
  TREE_STUDIO,
  TREE_STUDIO_HORIZON,
  TREE_STUDIO_PLACE,
  treeAir,
  treeCloudSvg,
  treeSceneSvg,
  treeSkyAt,
  treeStudioSvg,
  type TreeAir,
  type TreeSceneOptions,
  type TreeSky,
  type TreeStudioOptions,
} from './tree-scene.js';
export { horizonSky, horizonSvg, type HorizonOptions } from './horizon.js';
export {
  LETTER_BIRD_FEET,
  LETTER_FLIGHT,
  LETTER_OPENING,
  LETTER_PLAY,
  LETTER_SILL,
  LETTER_WINDOW_DEPTH,
  LETTER_WINDOW_PARTS,
  letterBirdSvg,
  letterEnvelopeSvg,
  letterFlightShadow,
  letterPlayShadow,
  letterPlayShows,
  letterShadowSvg,
  letterWindowSvg,
  type LetterBirdOptions,
  type LetterEnvelopeOptions,
  type LetterPlay,
  type LetterPlayMove,
  type LetterShadowKey,
  type LetterShadowOptions,
  type LetterWindowOptions,
  type LetterWindowPart,
} from './letters.js';
export { PIGEON_POSES, type PigeonPose } from './pigeon.js';
export type { SongbirdPose } from './songbird.js';
export { rankEmblemSvg, placementEmblemSvg, PLACEMENT_GAMES, SMALL_EMBLEM, type PlacementEmblemOptions, type RankEmblemOptions } from './ranks.js';
export { leagueEmblemSvg, SMALL_LEAGUE, type LeagueEmblemOptions } from './leagues.js';
export { coinSvg, gemSvg, CURRENCY_CANVAS, type CurrencyOptions } from './currency.js';
export { wordSetSvg, type WordSetArtOptions, type WordsCardId } from './word-sets.js';
export {
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
} from './impostor.js';
export {
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
} from './games.js';
export { EMAIL_PICTURES, emailPictureLoopMs, emailPictureStill, emailPictureSvg, emailPictureTone, type EmailArtOptions, type EmailPicture } from './email.js';
export { TICKET_ART_BOX, TICKET_ART_OUTLINE, TICKET_ART_PERFORATION, TICKET_ART_STUB, TICKET_ART_TEAR, TICKET_ART_TILES } from './ticket.js';
export {
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
} from './chest.js';
export {
  seasonFrameSvg,
  seasonFrameShineSvg,
  SEASON_FRAME_INNER,
  SEASON_FRAME_SHINE,
  SMALL_FRAME,
  type SeasonFrameOptions,
  type SeasonFrameShineOptions,
} from './frames.js';
export {
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
} from './path-land.js';
