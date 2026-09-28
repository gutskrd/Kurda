/**
 * Pure league view helpers (KUR-062/064) — no React.
 *
 * The browser has shown leaderboards since Rankings was built and never the
 * league: `GET /me/league` went uncalled, so a week of XP earned in the browser
 * counted towards a promotion the browser could not show you.
 *
 * Written against the same shapes as the phone's `mobile/src/leagues/format.ts`
 * and kept as its own copy for the reason each app keeps its own presentation
 * helpers — the `MessageKey` union differs between them, so the tier table
 * cannot be shared as it stands.
 */
import type { MessageKey } from '../i18n/en';

/**
 * Bronze → Diamond, low to high, mirroring `api/src/leagues/league-logic.ts`.
 *
 * The order is what decides which tier a promotion moves you to, so it is not
 * incidental: a ladder in a different order here would name the wrong
 * destination on every row. A test pins it against the server's list.
 */
export const TIERS = [
  'bronze',
  'silver',
  'gold',
  'sapphire',
  'ruby',
  'emerald',
  'amethyst',
  'pearl',
  'obsidian',
  'diamond',
] as const;

export type Zone = 'promotion' | 'demotion' | 'safe';

/** Server mirror: cohorts smaller than this demote nobody (too small to be fair). */
export const MIN_FOR_DEMOTION = 10;

/**
 * What a tier is called, and what it looks like.
 *
 * `labelKey` rather than a word, for the reason the phone's copy of this says:
 * the ten names were written in English once and rendered straight onto a
 * screen, so nine languages read "Bronze League". The colour and the emoji are
 * the same everywhere; only the name is anybody's language.
 *
 * A tier the server invents that this map does not know still has to draw
 * something, so the fallback keeps the raw key as its own label and says so
 * with a null `labelKey` — there is nothing to look up.
 */
export interface TierMeta {
  /** the catalogue entry for this tier's name, or null for an unknown tier */
  labelKey: MessageKey | null;
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

/**
 * The tier a zone would move you to, or null when it would move you nowhere.
 *
 * This is how the browser says what a zone *means* without inventing the words
 * "promotion" and "demotion" in nine languages: the ten tier names are already
 * written in all of them, so a row can name its destination instead. It also
 * reads better than the colour the phone uses — a coloured edge and nothing
 * else tells a screen reader, or anyone who cannot separate red from green,
 * precisely nothing.
 *
 * Null at the ends of the ladder, because the server clamps there: Bronze
 * demotes to Bronze and Diamond promotes to Diamond, and a row promising a move
 * that cannot happen is worse than a row promising nothing.
 */
export function zoneDestination(tier: string, zone: Zone): string | null {
  const i = (TIERS as readonly string[]).indexOf(tier);
  if (i === -1 || zone === 'safe') return null;
  const next = zone === 'promotion' ? i + 1 : i - 1;
  if (next < 0 || next >= TIERS.length) return null;
  return TIERS[next]!;
}

/** Next Monday 00:00 UTC after the week's Monday (`weekKey` = 'YYYY-MM-DD'). */
export function weekEnd(weekKey: string): number {
  return Date.parse(`${weekKey}T00:00:00Z`) + 7 * 24 * 60 * 60 * 1000;
}

/**
 * How long is left, as "2d 4h" / "3h 12m" / "5m", or null once the week is over.
 *
 * Null rather than a word: the phone returns the string "Ended" from here, which
 * is one more piece of English that nine languages read untranslated. A caller
 * with nothing to count down to can say nothing, which needs no vocabulary.
 */
export function countdown(weekKey: string, now: number = Date.now()): string | null {
  let ms = weekEnd(weekKey) - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86_400_000);
  ms -= d * 86_400_000;
  const h = Math.floor(ms / 3_600_000);
  ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
