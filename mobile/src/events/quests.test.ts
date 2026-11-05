import { describe, expect, it } from 'vitest';
import {
  claimState,
  progressPct,
  questTitle,
  rewardParts,
  rewardSpoken,
  sortQuests,
  type QuestView,
} from './quests.js';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';

/** The real catalogue: a stub that echoes the key would hide a missing one. */
const tr =
  (locale: 'en' | 'ku') =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    interpolate(TRANSLATIONS[locale][key], vars);
const t = tr('en');

function q(over: Partial<QuestView>): QuestView {
  return {
    id: 'x',
    type: 'earn_xp',
    target: 100,
    current: 0,
    complete: false,
    claimed: false,
    claimable: false,
    reward: {},
    ...over,
  };
}

describe('progressPct', () => {
  it('clamps to [0, 1]', () => {
    expect(progressPct({ current: 50, target: 100 })).toBe(0.5);
    expect(progressPct({ current: 150, target: 100 })).toBe(1);
    expect(progressPct({ current: -5, target: 100 })).toBe(0);
    expect(progressPct({ current: 5, target: 0 })).toBe(0);
  });
});

describe('questTitle', () => {
  it('prefers titleEn, falls back per type', () => {
    // the server's own title passes through untranslated; ours does not
    expect(questTitle(q({ titleEn: 'Welcome spring' }), t)).toBe('Welcome spring');
    expect(questTitle(q({ type: 'win_games', titleEn: undefined }), t)).toBe(TRANSLATIONS.en['events.quest.winGames']);
    expect(questTitle(q({ type: 'win_games', titleEn: undefined }), tr('ku'))).toBe(
      TRANSLATIONS.ku['events.quest.winGames'],
    );
  });
});

describe('rewardParts and rewardSpoken', () => {
  it('lists the currencies a reward pays, Zêr first, and none for nothing', () => {
    expect(rewardParts({ zer: 200, gems: 30 })).toEqual([
      { currency: 'zer', amount: 200 },
      { currency: 'gems', amount: 30 },
    ]);
    expect(rewardParts({ gems: 40 })).toEqual([{ currency: 'gems', amount: 40 }]);
    expect(rewardParts({ zer: 0 })).toEqual([]);
    expect(rewardParts({})).toEqual([]);
  });

  it('says the reward in words, never as emoji', () => {
    expect(rewardSpoken({ zer: 200, gems: 30 }, t)).toBe('+200 Zêr, +30 Gems');
    expect(rewardSpoken({ zer: 1500 }, t, (n) => n.toLocaleString('en'))).toBe('+1,500 Zêr');
    expect(rewardSpoken({}, t)).toBe('');
  });
});

describe('claimState + sortQuests', () => {
  it('maps flags to a state', () => {
    expect(claimState(q({ claimed: true }))).toBe('claimed');
    expect(claimState(q({ claimable: true }))).toBe('claimable');
    expect(claimState(q({}))).toBe('locked');
  });

  it('orders claimable first, claimed last', () => {
    const claimed = q({ id: 'c', claimed: true });
    const locked = q({ id: 'l' });
    const claimable = q({ id: 'a', claimable: true });
    expect(sortQuests([claimed, locked, claimable]).map((x) => x.id)).toEqual(['a', 'l', 'c']);
  });
});
