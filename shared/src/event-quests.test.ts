import { describe, expect, it } from 'vitest';
import { eventQuestShare, eventQuestState, eventQuestTitle, eventRewardParts, sortEventQuests, type EventQuest } from './event-quests.js';

function quest(over: Partial<EventQuest>): EventQuest {
  return { id: 'x', type: 'earn_xp', target: 100, current: 0, complete: false, claimed: false, claimable: false, reward: {}, ...over };
}

describe('eventQuestShare', () => {
  it('is how far along a quest is, from 0 to 1', () => {
    expect(eventQuestShare({ current: 50, target: 100 })).toBe(0.5);
    expect(eventQuestShare({ current: 150, target: 100 })).toBe(1);
    expect(eventQuestShare({ current: -5, target: 100 })).toBe(0);
    expect(eventQuestShare({ current: 5, target: 0 })).toBe(0);
  });
});

describe('eventQuestState and sortEventQuests', () => {
  it('reads a quest’s flags as one state', () => {
    expect(eventQuestState(quest({ claimed: true, claimable: false }))).toBe('claimed');
    expect(eventQuestState(quest({ claimable: true }))).toBe('claimable');
    expect(eventQuestState(quest({}))).toBe('locked');
  });

  it('lists what can be claimed first and what was claimed last', () => {
    const claimed = quest({ id: 'c', claimed: true });
    const going = quest({ id: 'g' });
    const ready = quest({ id: 'r', claimable: true });
    expect(sortEventQuests([claimed, going, ready]).map((q) => q.id)).toEqual(['r', 'g', 'c']);
  });
});

describe('eventRewardParts', () => {
  it('lists what a quest pays, Zêr first, and nothing for no reward', () => {
    expect(eventRewardParts({ zer: 200, gems: 30 })).toEqual([
      { currency: 'zer', amount: 200 },
      { currency: 'gems', amount: 30 },
    ]);
    expect(eventRewardParts({ gems: 40 })).toEqual([{ currency: 'gems', amount: 40 }]);
    expect(eventRewardParts({ zer: 0 })).toEqual([]);
  });
});

describe('eventQuestTitle', () => {
  const titled = { titleEn: 'Welcome spring', titleKu: 'Bi xêr hatî bihar' };

  it('gives the author’s title in English and Kurmancî', () => {
    expect(eventQuestTitle(titled, 'en')).toBe('Welcome spring');
    expect(eventQuestTitle(titled, 'ku')).toBe('Bi xêr hatî bihar');
  });

  it('leaves other languages, and a quest without a title, to the app’s own words', () => {
    expect(eventQuestTitle(titled, 'de')).toBeNull();
    expect(eventQuestTitle(titled, 'ckb')).toBeNull();
    expect(eventQuestTitle({}, 'en')).toBeNull();
  });
});
