/**
 * Pure Learning League view helpers (contract 4 §L, §U) — no React Native.
 *
 * The ten gem-named tiers this file used to carry are gone, and with them
 * their colours, emoji and the countdown: the six water tiers live in the
 * shared catalogue, their names in the catalogue of each language, and the
 * week's end is said as a calm local time ("Mon 01:00"), never as a clock
 * running down. A tier the app does not know is shown as no tier at all —
 * never the made-up "bronze" an empty profile used to wear.
 */
import { isLeagueTier, type LeagueStandingRow, type LeagueTier, type LeagueWeekResult, type LeagueZone } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export const LEAGUE_NAME_KEY: Record<LeagueTier, TranslationKey> = {
  dilop: 'leagues.tier.dilop',
  kani: 'leagues.tier.kani',
  cem: 'leagues.tier.cem',
  gol: 'leagues.tier.gol',
  derya: 'leagues.tier.derya',
  okyanus: 'leagues.tier.okyanus',
};

export const LEAGUE_MEANING_KEY: Record<LeagueTier, TranslationKey> = {
  dilop: 'leagues.meaning.dilop',
  kani: 'leagues.meaning.kani',
  cem: 'leagues.meaning.cem',
  gol: 'leagues.meaning.gol',
  derya: 'leagues.meaning.derya',
  okyanus: 'leagues.meaning.okyanus',
};

/** A stored tier as one the app knows, or null (nothing shown rather than a guess). */
export function knownTier(tier: unknown): LeagueTier | null {
  return isLeagueTier(tier) ? tier : null;
}

/** "Kanî" — Kurmancî everywhere, Soranî script in ckb. */
export function leagueName(t: Translate, tier: LeagueTier): string {
  return t(LEAGUE_NAME_KEY[tier]);
}

/** What the name means, or null where it would only repeat it. */
export function leagueMeaning(t: Translate, tier: LeagueTier): string | null {
  const meaning = t(LEAGUE_MEANING_KEY[tier]);
  return meaning.trim().toLocaleLowerCase() === leagueName(t, tier).trim().toLocaleLowerCase() ? null : meaning;
}

/** "Kanî League", "Kanî League (Spring)" for a screen reader. */
export function leagueLabel(t: Translate, tier: LeagueTier): string {
  const title = t('leagues.leagueName', { tier: leagueName(t, tier) });
  const meaning = leagueMeaning(t, tier);
  return meaning ? `${title} (${meaning})` : title;
}

/**
 * When the week closes, in the reader's own time: the weekday and the hour
 * ("Mon 01:00"), without a countdown. The close is Monday 00:00 UTC, which is
 * Sunday evening in the Americas and Monday morning further east.
 */
export function weekEndText(endsAt: string, locale: string, timeZone?: string): string {
  const at = new Date(endsAt);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(at);
  } catch {
    return at.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** 0…1 of the weekly goal. */
export function goalFraction(xp: number, goal: number): number {
  if (goal <= 0) return 1;
  return Math.max(0, Math.min(1, xp / goal));
}

/** The table, with a heading where each zone begins, so the zones are read in words and not only seen. */
export type TableItem = { kind: 'zone'; zone: Exclude<LeagueZone, 'stay'> } | { kind: 'row'; row: LeagueStandingRow } | { kind: 'gap' };

export function tableItems(rows: readonly LeagueStandingRow[]): TableItem[] {
  const items: TableItem[] = [];
  let last: LeagueZone | null = null;
  for (const row of rows) {
    if (row.zone !== last) {
      if (row.zone === 'promotion' || row.zone === 'demotion') items.push({ kind: 'zone', zone: row.zone });
      else if (last !== null) items.push({ kind: 'gap' });
      last = row.zone;
    }
    items.push({ kind: 'row', row });
  }
  return items;
}

/** What the zones mean in this group, for the line under the table's title. */
export function zoneRules(
  t: Translate,
  view: { tier: LeagueTier | null; promoteCount: number; demoteCount: number; goalXp: number },
): string[] {
  const lines: string[] = [];
  if (view.tier === 'okyanus') lines.push(t('leagues.rules.trophy'));
  else if (view.promoteCount > 0) lines.push(t('leagues.rules.promote', { count: view.promoteCount, goal: view.goalXp }));
  if (view.demoteCount > 0) lines.push(t('leagues.rules.demote', { count: view.demoteCount }));
  else if (view.tier) lines.push(t('leagues.rules.noDemotion'));
  return lines;
}

/** Last week, in one kind sentence: up, the same, a fresh start — or the trophy. */
export function lastWeekLine(t: Translate, result: LeagueWeekResult): string {
  if (result.mode === 'personal' || !result.tier) {
    return result.goalMet ? t('leagues.lastWeek.goalMet', { xp: result.weeklyXp }) : t('leagues.lastWeek.personal', { xp: result.weeklyXp });
  }
  if (result.trophy) return t('leagues.lastWeek.trophy');
  const after = result.tierAfter ?? result.tier;
  if (result.outcome === 'promoted') return t('leagues.lastWeek.promoted', { tier: leagueName(t, after) });
  if (result.outcome === 'demoted') return t('leagues.lastWeek.demoted', { tier: leagueName(t, after) });
  return t('leagues.lastWeek.stayed', { tier: leagueName(t, after) });
}
