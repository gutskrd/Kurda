/**
 * Hevalo's badge, rank, league and season-frame art, drawn by code (contract 4,
 * B3). Every function returns an SVG string: the web inlines it, the phone
 * draws it with react-native-svg's `SvgXml`, and both show the same pixels.
 *
 * Deterministic — the same arguments give the same string — and self-contained:
 * no images, fonts or links, nothing fetched.
 */
export * from './keys.js';
export { badgeSvg, badgeShineSvg, badgeShines, SMALL_BADGE, type BadgeOptions, type BadgeShineOptions, type BadgeState } from './badges.js';
export { rankEmblemSvg, placementEmblemSvg, PLACEMENT_GAMES, SMALL_EMBLEM, type PlacementEmblemOptions, type RankEmblemOptions } from './ranks.js';
export { leagueEmblemSvg, SMALL_LEAGUE, type LeagueEmblemOptions } from './leagues.js';
export { coinSvg, gemSvg, CURRENCY_CANVAS, type CurrencyOptions } from './currency.js';
export {
  CHEST_BOX,
  CHEST_LAYERS,
  CHEST_SMALL,
  CHEST_TINTS,
  CHEST_TINY,
  CHEST_VIEW,
  chestDrawing,
  chestGlint,
  chestLayerSvg,
  chestSvg,
  type ChestBox,
  type ChestDrawing,
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
