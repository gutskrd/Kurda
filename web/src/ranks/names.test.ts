import { describe, it, expect } from 'vitest';
import { BADGES, RANK_TIER_KEYS, LEAGUE_TIERS, BADGE_TIERS } from '@kurda/shared';
import { translator } from '../i18n/I18nProvider';
import { en } from '../i18n/en';
import { ku } from '../i18n/ku';
import { ckb } from '../i18n/ckb';
import { de } from '../i18n/de';
import { BADGE_TEXT, badgeHint, badgeNamed, badgeTierNamed, leagueName, leagueNamed, rankTierNamed, withMeaning } from './names';

const t = translator(en);

describe('names', () => {
  it('has words for every badge in the shared catalogue, and nothing else', () => {
    expect(Object.keys(BADGE_TEXT).sort()).toEqual(BADGES.map((b) => b.key).sort());
    // Every secret, and only secrets, has a hint.
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

  it('names the league in the reader’s word order', () => {
    expect(leagueName(t, 'cem')).toBe('Çem League');
    expect(leagueName(translator({ ...en, ...ku }), 'cem')).toBe('Lîga Çem');
  });

  it('finds a secret’s hint by its key', () => {
    expect(badgeHint(t, 'badges.kewe-ciye.hint')).toBe('Aim high.');
    expect(badgeHint(t, null)).toBeNull();
    expect(badgeHint(t, 'badges.nothing.hint')).toBeNull();
  });

  it('every key the names need is in English', () => {
    const keys = [...RANK_TIER_KEYS, ...LEAGUE_TIERS, ...BADGE_TIERS];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of RANK_TIER_KEYS) expect(en[`ranks.tier.${k}` as keyof typeof en]).toBeTruthy();
    for (const k of LEAGUE_TIERS) expect(en[`leagues.meaning.${k}` as keyof typeof en]).toBeTruthy();
  });
});
