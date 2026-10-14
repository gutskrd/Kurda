/**
 * Pure Game Ranks view helpers (contract 4 §R, §U) — no React Native.
 *
 * Every word a rank is shown with comes from the catalogue: the tier's name
 * (Kurmancî everywhere, Soranî script in ckb) and what it means in the
 * reader's language, the one plain reason a result is explained with, and why
 * a Rated game plays as friendly. Numbers are signed with a true minus, so a
 * loss reads as −6 rather than a hyphen.
 */
import type {
  Division,
  FriendlyReason,
  PointsTier,
  RankCard,
  RankReason,
  RankResult,
  RankTier,
  SeasonName,
} from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export const TIER_NAME_KEY: Record<RankTier, TranslationKey> = {
  dest: 'ranks.tier.dest',
  gir: 'ranks.tier.gir',
  zozan: 'ranks.tier.zozan',
  ciya: 'ranks.tier.ciya',
  lutke: 'ranks.tier.lutke',
  sterk: 'ranks.tier.sterk',
};

export const TIER_MEANING_KEY: Record<RankTier, TranslationKey> = {
  dest: 'ranks.meaning.dest',
  gir: 'ranks.meaning.gir',
  zozan: 'ranks.meaning.zozan',
  ciya: 'ranks.meaning.ciya',
  lutke: 'ranks.meaning.lutke',
  sterk: 'ranks.meaning.sterk',
};

/** Divisions are written the way the emblem's chevrons count them: III lowest, I highest. */
export const ROMAN: Record<Division, string> = { 3: 'III', 2: 'II', 1: 'I' };

/** "Gir II", or "Stêrk" (the apex has no divisions). */
export function rankName(t: Translate, tier: RankTier, division: Division | null): string {
  const name = t(TIER_NAME_KEY[tier]);
  return tier === 'sterk' || division === null ? name : `${name} ${ROMAN[division]}`;
}

/**
 * What the tier's name means, or null where the name already says it — in
 * Kurmancî "Gir" means hill, and "Gir · Gir" says nothing twice.
 */
export function tierMeaning(t: Translate, tier: RankTier): string | null {
  const meaning = t(TIER_MEANING_KEY[tier]);
  return meaning.trim().toLocaleLowerCase() === t(TIER_NAME_KEY[tier]).trim().toLocaleLowerCase() ? null : meaning;
}

/** "Gir II (Hill)" — for a screen reader, which hears the emblem's name once. */
export function rankLabel(t: Translate, tier: RankTier, division: Division | null): string {
  const meaning = tierMeaning(t, tier);
  return meaning ? `${rankName(t, tier, division)} (${meaning})` : rankName(t, tier, division);
}

/** A points change with a true minus: +18, −6, ±0. */
export function signed(n: number): string {
  const v = Math.round(n);
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${Math.abs(v)}`;
  return '±0';
}

/**
 * The one plain reason, never a sad one. A loss to a stronger player is a
 * close game; a loss to a weaker one is an off day; leaving says only that.
 */
export const REASON_KEY: Record<RankReason, TranslationKey> = {
  placement: 'ranks.reason.placement',
  'beat-stronger': 'ranks.reason.beatStronger',
  'expected-win': 'ranks.reason.expectedWin',
  won: 'ranks.reason.won',
  draw: 'ranks.reason.draw',
  'lost-to-stronger': 'ranks.reason.lostToStronger',
  'lost-to-weaker': 'ranks.reason.lostToWeaker',
  lost: 'ranks.reason.lost',
  left: 'ranks.reason.left',
  shield: 'ranks.reason.shield',
};

/** Why a game set to Rated plays as friendly — about the players in general… */
export const FRIENDLY_REASON_KEY: Record<FriendlyReason, TranslationKey> = {
  chosen: 'ranks.friendly.chosen',
  solo: 'ranks.friendly.solo',
  'need-two': 'ranks.friendly.needTwo',
  unverified: 'ranks.friendly.unverified',
  'no-birth-month': 'ranks.friendly.noBirthMonth',
  restricted: 'ranks.friendly.restricted',
  cooldown: 'ranks.friendly.cooldown',
  'repeat-opponent': 'ranks.friendly.repeatOpponent',
};

/** …and, where the reason is the viewer's own, said to them with what they can do. */
const SELF_REASON_KEY: Partial<Record<FriendlyReason, TranslationKey>> = {
  unverified: 'ranks.friendly.self.unverified',
  'no-birth-month': 'ranks.friendly.self.noBirthMonth',
  restricted: 'ranks.friendly.self.restricted',
  cooldown: 'ranks.friendly.self.cooldown',
};

export function friendlyReasonKey(reason: FriendlyReason, self = false): TranslationKey {
  return (self ? SELF_REASON_KEY[reason] : undefined) ?? FRIENDLY_REASON_KEY[reason];
}

export const SEASON_NAME_KEY: Record<SeasonName, TranslationKey> = {
  zivistan: 'season.name.zivistan',
  bihar: 'season.name.bihar',
  havin: 'season.name.havin',
  payiz: 'season.name.payiz',
};

export const SEASON_MEANING_KEY: Record<SeasonName, TranslationKey> = {
  zivistan: 'season.meaning.zivistan',
  bihar: 'season.meaning.bihar',
  havin: 'season.meaning.havin',
  payiz: 'season.meaning.payiz',
};

/** "Payîz 2026". */
export function seasonTitle(t: Translate, season: { name: SeasonName; year: number }): string {
  return `${t(SEASON_NAME_KEY[season.name])} ${season.year}`;
}

/** Calm days-left wording: no countdown, no hours, nothing red. */
export function daysLeftText(t: Translate, days: number): string {
  if (days <= 0) return t('season.lastDay');
  if (days === 1) return t('season.oneDayLeft');
  return t('season.daysLeft', { count: days });
}

/** What a rank card shows in its headline: placing, or the tier and division. */
export type CardHeadline =
  | { kind: 'placing'; played: number; of: number }
  | { kind: 'ranked'; tier: RankTier; division: Division | null };

export function cardHeadline(card: Pick<RankCard, 'tier' | 'division' | 'placement'>): CardHeadline {
  if (card.placement || !card.tier) {
    return { kind: 'placing', played: card.placement?.played ?? 0, of: card.placement?.of ?? 5 };
  }
  return { kind: 'ranked', tier: card.tier, division: card.tier === 'sterk' ? null : card.division };
}

/** "88 to Gir I", "Top of the climb", or nothing while placing. */
export function nextStepText(t: Translate, card: Pick<RankCard, 'progress' | 'placement' | 'tier'>): string | null {
  if (card.placement || !card.tier || !card.progress) return null;
  const { next, pointsToGo } = card.progress;
  if (card.tier === 'sterk' || !next || pointsToGo === null) return t('ranks.topOfClimb');
  return t('ranks.toNext', { count: pointsToGo, rank: rankName(t, next.tier, next.division) });
}

/**
 * The moment after a game: a tier reached, a division reached, the first
 * placement finished — or nothing to celebrate (a points change alone).
 */
export type Celebration = 'placed' | 'tier' | 'division' | null;

export function celebrationOf(result: RankResult): Celebration {
  if (!result.counted) return null;
  if (result.tierBefore === null && result.tierAfter !== null && result.placement === null) return 'placed';
  if (result.tierUp) return 'tier';
  if (result.divisionUp) return 'division';
  return null;
}

/** How the change reads: up is warm, down is neutral (never red), even is quiet. */
export type ResultTone = 'up' | 'down' | 'even';

export function resultTone(delta: number): ResultTone {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'even';
}

/** The emblem a counted result shows: placing (with games played), or the tier after. */
export function resultEmblem(
  result: Extract<RankResult, { counted: true }>,
): { kind: 'placing'; done: number } | { kind: 'ranked'; tier: PointsTier; division: Division | null } {
  if (result.placement || !result.tierAfter) return { kind: 'placing', done: Math.min(5, result.placement?.played ?? 0) };
  return { kind: 'ranked', tier: result.tierAfter, division: result.divisionAfter };
}

/** The numbers a count-up passes through on its way, as whole points. */
export function countUpValue(from: number, to: number, progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return Math.round(from + (to - from) * p);
}

