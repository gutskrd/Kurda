/** Pure league/leaderboard view helpers (KUR-064) — no React Native. */
import type { TranslationKey } from '../i18n/translations';

export type Zone = 'promotion' | 'demotion' | 'safe';

/** Server mirror: only demote when the cohort is big enough (KUR-062). */
export const MIN_FOR_DEMOTION = 10;

/**
 * What a tier is called, and what it looks like.
 *
 * `labelKey` rather than a word: the ten names were written here in English and
 * rendered straight onto the rankings screen, so nine languages read "Bronze
 * League". The colour and the emoji are the same everywhere; only the name is
 * anybody's language.
 *
 * A tier the server invents that this map does not know still has to draw
 * something, so the fallback keeps the raw key as its own label and says so
 * with a null `labelKey` — there is nothing to look up.
 */
export interface TierMeta {
  /** the catalogue entry for this tier's name, or null for an unknown tier */
  labelKey: TranslationKey | null;
  /** what to show when there is no catalogue entry: the tier as the server named it */
  label: string;
  color: string;
  emoji: string;
}

export const TIER_META: Record<string, TierMeta> = {
  bronze: { labelKey: 'leagues.tier.bronze', label: 'bronze', color: '#CD7F32', emoji: '🥉' },
  silver: { labelKey: 'leagues.tier.silver', label: 'silver', color: '#9AA5B1', emoji: '🥈' },
  gold: { labelKey: 'leagues.tier.gold', label: 'gold', color: '#E8B923', emoji: '🥇' },
  sapphire: { labelKey: 'leagues.tier.sapphire', label: 'sapphire', color: '#2D6CDF', emoji: '🔷' },
  ruby: { labelKey: 'leagues.tier.ruby', label: 'ruby', color: '#C81E4A', emoji: '🔺' },
  emerald: { labelKey: 'leagues.tier.emerald', label: 'emerald', color: '#2E9E6B', emoji: '💚' },
  amethyst: { labelKey: 'leagues.tier.amethyst', label: 'amethyst', color: '#9B59B6', emoji: '🟣' },
  pearl: { labelKey: 'leagues.tier.pearl', label: 'pearl', color: '#8FA0B3', emoji: '🤍' },
  obsidian: { labelKey: 'leagues.tier.obsidian', label: 'obsidian', color: '#3A3F44', emoji: '⬛' },
  diamond: { labelKey: 'leagues.tier.diamond', label: 'diamond', color: '#4FC3E8', emoji: '💎' },
};

export function tierMeta(tier: string): TierMeta {
  return TIER_META[tier] ?? { labelKey: null, label: tier, color: '#9AA5B1', emoji: '🏅' };
}

/**
 * Which zone a rank sits in for a cohort of `total`: the top `promoteCount`
 * promote, the bottom `demoteCount` demote (only when the cohort is big enough
 * to demote), everyone else is safe.
 */
export function zoneFor(rank: number, total: number, promoteCount: number, demoteCount: number): Zone {
  if (rank <= promoteCount) return 'promotion';
  if (total >= MIN_FOR_DEMOTION && rank > total - demoteCount) return 'demotion';
  return 'safe';
}

/** Next Monday 00:00 UTC after the week's Monday (`weekKey` = 'YYYY-MM-DD'). */
export function weekEnd(weekKey: string): number {
  return Date.parse(`${weekKey}T00:00:00Z`) + 7 * 24 * 60 * 60 * 1000;
}

/** Human countdown to the week end, e.g. "2d 4h" or "3h 12m" or "Ended". */
export function countdown(weekKey: string, now: number = Date.now()): string {
  let ms = weekEnd(weekKey) - now;
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms / 86_400_000);
  ms -= d * 86_400_000;
  const h = Math.floor(ms / 3_600_000);
  ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
