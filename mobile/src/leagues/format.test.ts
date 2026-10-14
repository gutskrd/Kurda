import { describe, expect, it } from 'vitest';
import type { LeagueStandingRow, LeagueWeekResult } from '@kurda/shared';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';
import { goalFraction, knownTier, lastWeekLine, leagueLabel, leagueMeaning, leagueName, tableItems, weekEndText, zoneRules } from './format';

const t = (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.en[key], vars);
const tKu = (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.ku[key], vars);
const tCkb = (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.ckb[key], vars);

const row = (rank: number, zone: LeagueStandingRow['zone'], isSelf = false): LeagueStandingRow => ({
  userId: `u${rank}`,
  username: `p${rank}`,
  weeklyXp: 500 - rank * 10,
  rank,
  isSelf,
  tier: 'cem',
  zone,
});

describe('league names', () => {
  it('names the six water tiers in Kurdish, with their meaning in the reader’s language', () => {
    expect(leagueName(t, 'kani')).toBe('Kanî');
    expect(leagueMeaning(t, 'kani')).toBe('Spring');
    expect(leagueLabel(t, 'okyanus')).toBe('Okyanûs League (Ocean)');
    expect(leagueName(tCkb, 'derya')).toBe('دەریا');
  });

  it('does not say the name twice where the name is already the meaning', () => {
    expect(leagueMeaning(tKu, 'cem')).toBeNull();
    expect(leagueLabel(tKu, 'cem')).toBe('Lîga Çem');
  });

  it('shows no tier rather than a guess: an old or unknown key is not a tier', () => {
    expect(knownTier('gol')).toBe('gol');
    expect(knownTier('bronze')).toBeNull();
    expect(knownTier(null)).toBeNull();
  });
});

describe('weekEndText', () => {
  it('says the close in the reader’s own time, as a weekday and an hour — not a countdown', () => {
    // Monday 00:00 UTC is Sunday evening in New York and Monday morning in Erbil
    expect(weekEndText('2026-10-19T00:00:00.000Z', 'en', 'America/New_York')).toMatch(/Sun.*20:00|Sun.*8:00/);
    expect(weekEndText('2026-10-19T00:00:00.000Z', 'en', 'Asia/Baghdad')).toMatch(/Mon.*03:00|Mon.*3:00/);
    expect(weekEndText('not a date', 'en')).toBe('');
  });
});

describe('goalFraction', () => {
  it('fills to the goal and stops there', () => {
    expect(goalFraction(75, 150)).toBe(0.5);
    expect(goalFraction(400, 150)).toBe(1);
    expect(goalFraction(0, 0)).toBe(1);
  });
});

describe('tableItems', () => {
  it('heads the promotion and demotion zones in words, with a gap where staying begins', () => {
    const items = tableItems([row(1, 'promotion'), row(2, 'promotion'), row(3, 'stay', true), row(4, 'stay'), row(5, 'demotion')]);
    expect(items.map((i) => (i.kind === 'row' ? i.row.rank : i.kind === 'zone' ? i.zone : 'gap'))).toEqual([
      'promotion',
      1,
      2,
      'gap',
      3,
      4,
      'demotion',
      5,
    ]);
  });

  it('starts without a heading when nobody is moving up', () => {
    const items = tableItems([row(1, 'stay'), row(2, 'stay')]);
    expect(items.every((i) => i.kind === 'row')).toBe(true);
  });
});

describe('zoneRules', () => {
  it('says how many move up and down, and that the goal is part of it', () => {
    expect(zoneRules(t, { tier: 'cem', promoteCount: 5, demoteCount: 3, goalXp: 150 })).toEqual([
      'The top 5 with 150 XP or more move up.',
      'Of those who miss the goal, the last 3 move down.',
    ]);
  });

  it('says nobody moves down from the first tiers, and names the trophy at the top', () => {
    expect(zoneRules(t, { tier: 'dilop', promoteCount: 2, demoteCount: 0, goalXp: 150 })).toContain('Nobody moves down from here.');
    expect(zoneRules(t, { tier: 'okyanus', promoteCount: 0, demoteCount: 2, goalXp: 150 })[0]).toMatch(/Pêla/);
  });
});

describe('lastWeekLine', () => {
  const base: LeagueWeekResult = {
    weekKey: '2026-10-05',
    mode: 'league',
    tier: 'kani',
    tierAfter: 'cem',
    outcome: 'promoted',
    rank: 2,
    groupSize: 18,
    weeklyXp: 410,
    goalXp: 150,
    goalMet: true,
    trophy: false,
    gems: 10,
  };

  it('is one kind sentence for each outcome — a move down is a fresh start', () => {
    expect(lastWeekLine(t, base)).toBe('You moved up to Çem.');
    expect(lastWeekLine(t, { ...base, outcome: 'stayed', tierAfter: 'kani' })).toBe('You stayed in Kanî.');
    expect(lastWeekLine(t, { ...base, tier: 'gol', outcome: 'demoted', tierAfter: 'cem' })).toBe('This week you’re in Çem — a fresh start.');
    expect(lastWeekLine(t, { ...base, tier: 'okyanus', tierAfter: 'okyanus', outcome: 'stayed', trophy: true })).toMatch(/Pêla/);
  });

  it('speaks of the goal alone in personal mode', () => {
    expect(lastWeekLine(t, { ...base, mode: 'personal', tier: null, tierAfter: null, outcome: null })).toBe('You met your goal with 410 XP.');
  });
});
