import { describe, expect, it } from 'vitest';
import { FRIENDLY_REASONS, RANK_REASONS, RANK_TIER_KEYS, type RankResult } from '@kurda/shared';
import { LOCALES, TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';
import {
  FRIENDLY_REASON_KEY,
  REASON_KEY,
  TIER_MEANING_KEY,
  TIER_NAME_KEY,
  celebrationOf,
  countUpValue,
  friendlyReasonKey,
  rankLabel,
  rankName,
  resultEmblem,
  resultTone,
  signed,
  tierMeaning,
} from './format';

const t = (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.en[key], vars);
const tKu = (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.ku[key], vars);
const tCkb = (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.ckb[key], vars);

const counted = (over: Partial<Extract<RankResult, { counted: true }>> = {}): Extract<RankResult, { counted: true }> => ({
  game: 'wordle-battle',
  gameRef: 'g1',
  counted: true,
  pointsBefore: 380,
  pointsAfter: 404,
  delta: 24,
  reason: 'beat-stronger',
  tierBefore: 'gir',
  tierAfter: 'gir',
  divisionBefore: 3,
  divisionAfter: 2,
  tierUp: false,
  divisionUp: true,
  placement: null,
  shieldGames: 0,
  weight: 1,
  damping: 1,
  newAccountLimit: 1,
  progress: null,
  ...over,
});

describe('tier names', () => {
  it('writes the tier in Kurdish with its division as the emblem counts it, and the meaning in the reader’s language', () => {
    expect(rankName(t, 'gir', 2)).toBe('Gir II');
    expect(rankName(t, 'dest', 3)).toBe('Deşt III');
    expect(rankName(t, 'sterk', 1)).toBe('Stêrk');
    expect(rankLabel(t, 'zozan', 1)).toBe('Zozan I (High pasture)');
    expect(rankName(tCkb, 'ciya', 1)).toBe('چیا I');
  });

  it('does not repeat a name that is its own meaning', () => {
    expect(tierMeaning(tKu, 'lutke')).toBeNull();
    expect(rankLabel(tKu, 'lutke', 2)).toBe('Lûtke II');
  });

  it('has a name and a meaning for every tier in every language', () => {
    for (const locale of LOCALES) {
      for (const tier of RANK_TIER_KEYS) {
        expect(TRANSLATIONS[locale][TIER_NAME_KEY[tier]], `${locale} ${tier}`).toBeTruthy();
        expect(TRANSLATIONS[locale][TIER_MEANING_KEY[tier]], `${locale} ${tier}`).toBeTruthy();
      }
    }
  });
});

describe('reasons', () => {
  it('has one plain reason for every result, and a reason for every friendly game', () => {
    for (const r of RANK_REASONS) expect(TRANSLATIONS.en[REASON_KEY[r]]).toBeTruthy();
    for (const r of FRIENDLY_REASONS) expect(TRANSLATIONS.en[FRIENDLY_REASON_KEY[r]]).toBeTruthy();
  });

  it('never words a loss as a defeat', () => {
    for (const r of ['lost-to-stronger', 'lost-to-weaker', 'lost'] as const) {
      expect(t(REASON_KEY[r])).not.toMatch(/defeat|lost|fail|bad/i);
    }
    expect(t(REASON_KEY['lost-to-stronger'])).toBe('close game against a stronger player');
  });

  it('says a reason that is the viewer’s own to them, with what they can do', () => {
    expect(friendlyReasonKey('unverified', true)).toBe('ranks.friendly.self.unverified');
    expect(friendlyReasonKey('unverified', false)).toBe('ranks.friendly.unverified');
    // Nothing personal about a choice or a lobby of one.
    expect(friendlyReasonKey('chosen', true)).toBe('ranks.friendly.chosen');
  });
});

describe('signed', () => {
  it('signs a change with a true minus', () => {
    expect(signed(18)).toBe('+18');
    expect(signed(-6)).toBe('−6');
    expect(signed(0)).toBe('±0');
    expect(signed(7.6)).toBe('+8');
  });
});

describe('after a game', () => {
  it('celebrates a division, a tier and a first placement — and nothing else', () => {
    expect(celebrationOf(counted())).toBe('division');
    expect(celebrationOf(counted({ tierUp: true, tierBefore: 'dest', tierAfter: 'gir' }))).toBe('tier');
    expect(celebrationOf(counted({ tierBefore: null, tierAfter: 'dest', placement: null, divisionUp: false }))).toBe('placed');
    expect(celebrationOf(counted({ divisionUp: false, delta: 6 }))).toBeNull();
    expect(celebrationOf(counted({ delta: -6, divisionUp: false, reason: 'lost-to-stronger' }))).toBeNull();
    expect(celebrationOf({ game: 'stories', gameRef: 'x', counted: false, friendlyReason: 'chosen' })).toBeNull();
  });

  it('shows the placing emblem while placing and the tier after the game once placed', () => {
    expect(resultEmblem(counted({ placement: { played: 2, of: 5 }, tierAfter: null }))).toEqual({ kind: 'placing', done: 2 });
    expect(resultEmblem(counted())).toEqual({ kind: 'ranked', tier: 'gir', division: 2 });
  });

  it('reads a loss as quiet, never as red', () => {
    expect(resultTone(24)).toBe('up');
    expect(resultTone(-6)).toBe('down');
    expect(resultTone(0)).toBe('even');
  });

  it('counts the points up through whole numbers', () => {
    expect(countUpValue(380, 404, 0)).toBe(380);
    expect(countUpValue(380, 404, 0.5)).toBe(392);
    expect(countUpValue(380, 404, 1)).toBe(404);
    expect(countUpValue(380, 404, 7)).toBe(404);
    expect(countUpValue(410, 404, 0.5)).toBe(407);
  });
});
