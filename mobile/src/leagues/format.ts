/** Pure league/leaderboard view helpers (KUR-064) — no React Native. */

export type Zone = 'promotion' | 'demotion' | 'safe';

/** Server mirror: only demote when the cohort is big enough (KUR-062). */
export const MIN_FOR_DEMOTION = 10;

export const TIER_META: Record<string, { label: string; color: string; emoji: string }> = {
  bronze: { label: 'Bronze', color: '#CD7F32', emoji: '🥉' },
  silver: { label: 'Silver', color: '#9AA5B1', emoji: '🥈' },
  gold: { label: 'Gold', color: '#E8B923', emoji: '🥇' },
  sapphire: { label: 'Sapphire', color: '#2D6CDF', emoji: '🔷' },
  ruby: { label: 'Ruby', color: '#C81E4A', emoji: '🔺' },
  emerald: { label: 'Emerald', color: '#2E9E6B', emoji: '💚' },
  amethyst: { label: 'Amethyst', color: '#9B59B6', emoji: '🟣' },
  pearl: { label: 'Pearl', color: '#8FA0B3', emoji: '🤍' },
  obsidian: { label: 'Obsidian', color: '#3A3F44', emoji: '⬛' },
  diamond: { label: 'Diamond', color: '#4FC3E8', emoji: '💎' },
};

export function tierMeta(tier: string): { label: string; color: string; emoji: string } {
  return TIER_META[tier] ?? { label: tier, color: '#9AA5B1', emoji: '🏅' };
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
