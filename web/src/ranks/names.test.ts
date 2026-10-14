import { describe, it, expect } from 'vitest';
import { BADGES, FRIENDLY_REASONS, RANK_REASONS, RANK_TIER_KEYS, LEAGUE_TIERS, BADGE_TIERS, SEASON_NAMES } from '@kurda/shared';
import { translator } from '../i18n/I18nProvider';
import { en } from '../i18n/en';
import { ku } from '../i18n/ku';
import { ckb } from '../i18n/ckb';
import { de } from '../i18n/de';
import {
  BADGE_TEXT,
  badgeHint,
  badgeNamed,
  badgeTierNamed,
  friendlyReason,
  leagueName,
  leagueNamed,
  rankLabel,
  rankTierNamed,
  reasonLine,
  seasonNamed,
  withMeaning,
} from './names';

const t = translator(en);

describe('names', () => {
  it('has words for every badge in the shared catalogue, and nothing else', () => {
    expect(Object.keys(BADGE_TEXT).sort()).toEqual(BADGES.map((b) => b.key).sort());
    // every secret, and only secrets, has a hint
    for (const b of BADGES) expect(Boolean(BADGE_TEXT[b.key]!.hint), b.key).toBe(b.secret);
  });

  it('names a tier in Kurdish with its meaning beside it', () => {
    expect(rankTierNamed(t, 'ciya')).toEqual({ name: 'Çiya', meaning: 'Mountain' });
    expect(withMeaning(t, rankTierNamed(t, 'zozan'))).toBe('Zozan (High pasture)');
    expect(leagueNamed(t, 'kani')).toEqual({ name: 'Kanî', meaning: 'Spring' });
    expect(badgeTierNamed(t, 'firuze')).toEqual({ name: 'Firûze', meaning: 'Turquoise' });
    expect(badgeNamed(t, 'agir')).toEqual({ name: 'Agir', meaning: 'Fire' });
  });

  it('translates the meaning, never the Kurdish name', () => {
    const tde = translator({ ...en, ...de });
    expect(rankTierNamed(tde, 'ciya')).toEqual({ name: 'Çiya', meaning: 'Berg' });
    expect(leagueNamed(tde, 'okyanus')).toEqual({ name: 'Okyanûs', meaning: 'Ozean' });
  });

  /** A Kurdish reader reads the name; "Çiya (Çiya)" would be noise. */
  it('gives Kurdish readers the name alone, Soranî in its own script', () => {
    const tku = translator({ ...en, ...ku });
    expect(rankTierNamed(tku, 'ciya')).toEqual({ name: 'Çiya', meaning: null });
    expect(withMeaning(tku, leagueNamed(tku, 'cem'))).toBe('Çem');
    const tckb = translator({ ...en, ...ckb });
    expect(rankTierNamed(tckb, 'ciya')).toEqual({ name: 'چیا', meaning: null });
  });

  it('writes divisions as Roman numerals, and none for Stêrk', () => {
    expect(rankLabel(t, 'gir', 2)).toBe('Gir II');
    expect(rankLabel(t, 'dest', 3)).toBe('Deşt III');
    expect(rankLabel(t, 'sterk', 1)).toBe('Stêrk');
    expect(rankLabel(t, 'lutke', null)).toBe('Lûtke');
  });

  it('has a plain reason for every reason code, and says nothing for one it does not know', () => {
    for (const r of RANK_REASONS) expect(reasonLine(t, r), r).toBeTruthy();
    expect(reasonLine(t, 'beat-stronger')).toBe('you beat a higher-ranked player');
    expect(reasonLine(t, 'lost-to-stronger')).toBe('close game against a stronger player');
    expect(reasonLine(t, 'something-new')).toBeNull();
  });

  it('explains every friendly reason, and speaks to the viewer when the reason is theirs', () => {
    for (const r of FRIENDLY_REASONS) expect(friendlyReason(t, r), r).toBeTruthy();
    expect(friendlyReason(t, 'unverified')).toBe('not everyone has confirmed their email yet.');
    expect(friendlyReason(t, 'unverified', true)).toBe('confirm your email to play rated games.');
    // no personal version: the shared sentence
    expect(friendlyReason(t, 'need-two', true)).toBe('it needs at least two players.');
    expect(friendlyReason(t, null)).toBeNull();
  });

  it('names the season with its year, and the league in the reader’s word order', () => {
    expect(seasonNamed(t, { name: 'payiz', year: 2026 })).toEqual({ name: 'Payîz 2026', meaning: 'Autumn' });
    expect(leagueName(t, 'cem')).toBe('Çem League');
    expect(leagueName(translator({ ...en, ...ku }), 'cem')).toBe('Lîga Çem');
  });

  it('finds a secret’s hint by its key', () => {
    expect(badgeHint(t, 'badges.kewe-ciye.hint')).toBe('Aim high.');
    expect(badgeHint(t, null)).toBeNull();
    expect(badgeHint(t, 'badges.nothing.hint')).toBeNull();
  });

  it('every key the names need is in English', () => {
    const keys = [...RANK_TIER_KEYS, ...LEAGUE_TIERS, ...BADGE_TIERS, ...SEASON_NAMES];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of RANK_TIER_KEYS) expect(en[`ranks.tier.${k}` as keyof typeof en]).toBeTruthy();
    for (const k of LEAGUE_TIERS) expect(en[`leagues.meaning.${k}` as keyof typeof en]).toBeTruthy();
  });
});
