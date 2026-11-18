import { describe, expect, it } from 'vitest';
import type { PracticeHub } from '@kurda/shared';
import { kindRows, practiceHref } from './hub';

const empty: PracticeHub = { due: 0, available: 0, mistakes: 0, listen: false, speak: false, words: false, skipSpeaking: false, units: [] };

describe('the kinds of practice', () => {
  it('lists every kind in the phone’s order, empty ones saying what would fill them', () => {
    const rows = kindRows(empty);
    expect(rows.map((r) => r.key)).toEqual(['mistakes', 'words', 'listen', 'speak', 'unit']);
    expect(rows.every((r) => !r.ready)).toBe(true);
    expect(rows.map((r) => r.detail.key)).toEqual([
      'practice.hub.mistakesNone',
      'practice.hub.wordsNone',
      'practice.hub.listenNone',
      'practice.hub.speakNone',
      'practice.hub.unitNone',
    ]);
  });

  it('counts mistakes and chapters, one in the singular', () => {
    const rows = kindRows({ ...empty, mistakes: 1, units: [{ unitId: 'u1', title: 'Hello', number: 1, tone: 'clay' }, { unitId: 'u2', title: 'Family', number: 2, tone: 'saffron' }] });
    expect(rows[0]).toMatchObject({ ready: true, waiting: true, detail: { key: 'practice.hub.mistakesOne' } });
    expect(rows[4]).toMatchObject({ ready: true, detail: { key: 'practice.hub.unitCount', count: 2 } });
  });

  it('closes speaking for a learner who turned it off, whatever there is to say', () => {
    const speak = kindRows({ ...empty, speak: true, skipSpeaking: true })[3]!;
    expect(speak).toMatchObject({ ready: false, detail: { key: 'practice.hub.speakOff' } });
  });

  it('starts each kind at the review page, a chapter with its chapter', () => {
    expect(practiceHref('listen')).toBe('/app/learn/review?mode=listen');
    expect(practiceHref('unit', 'u2')).toBe('/app/learn/review?mode=unit&unit=u2');
  });
});
