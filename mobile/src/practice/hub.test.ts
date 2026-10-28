import { describe, expect, it } from 'vitest';
import type { PracticeHub } from '@kurda/shared';
import { heroOf, hubRows } from './hub';

const empty: PracticeHub = { due: 0, available: 0, mistakes: 0, listen: false, speak: false, words: false, skipSpeaking: false, units: [] };
const unit = (n: number) => ({ unitId: `u${n}`, title: `Unit title ${n}`, number: n, tone: 'meadow' as const });
const row = (hub: PracticeHub, key: string, micRefused = false) => hubRows(hub, { micRefused }).find((r) => r.key === key)!;

describe('the card at the top of the practice hub', () => {
  it('offers the words due first, with how many', () => {
    expect(heroOf({ ...empty, due: 7, available: 20, units: [unit(2)] })).toEqual({ kind: 'due', count: 7 });
  });

  it('offers the unit finished last when nothing is due', () => {
    expect(heroOf({ ...empty, available: 20, units: [unit(3), unit(1)] })).toEqual({ kind: 'unit', unit: unit(3) });
  });

  it('offers the hardest words when nothing is due and no unit is finished', () => {
    expect(heroOf({ ...empty, available: 4 })).toEqual({ kind: 'weak' });
  });

  it('sends somebody who has learned nothing yet to the lessons', () => {
    expect(heroOf(empty)).toEqual({ kind: 'none' });
  });
});

describe('the rows of the practice hub', () => {
  it('lists every kind, in the same order, whatever is in them', () => {
    expect(hubRows(empty, { micRefused: false }).map((r) => r.key)).toEqual(['mistakes', 'words', 'listen', 'speak', 'unit']);
  });

  it('says why a kind with nothing in it cannot start, and gives it nothing to do', () => {
    for (const r of hubRows(empty, { micRefused: false })) expect(r.action).toBeNull();
    expect(row(empty, 'mistakes').detail).toEqual({ key: 'practice.hub.mistakesNone' });
    expect(row(empty, 'unit').detail).toEqual({ key: 'practice.hub.unitNone' });
  });

  it('counts the mistakes to put right, and marks them as waiting', () => {
    expect(row({ ...empty, mistakes: 1 }, 'mistakes')).toMatchObject({ detail: { key: 'practice.hub.mistakesOne' }, waiting: true });
    expect(row({ ...empty, mistakes: 5 }, 'mistakes')).toMatchObject({
      detail: { key: 'practice.hub.mistakesCount', count: 5 },
      action: { kind: 'start', mode: 'mistakes' },
    });
  });

  it('opens the unit picker when a unit is finished', () => {
    expect(row({ ...empty, units: [unit(1), unit(2)] }, 'unit')).toMatchObject({ detail: { key: 'practice.hub.unitCount', count: 2 }, action: { kind: 'pick' } });
  });

  it('keeps speaking off when the learner turned it off, before anything else', () => {
    expect(row({ ...empty, speak: true, skipSpeaking: true }, 'speak', true)).toMatchObject({ detail: { key: 'practice.hub.speakOff' }, action: null });
  });

  it('sends speaking to Settings when the microphone was refused for good', () => {
    expect(row({ ...empty, speak: true }, 'speak', true)).toMatchObject({ detail: { key: 'practice.hub.micOff' }, action: { kind: 'settings' } });
    expect(row({ ...empty, speak: true }, 'speak')).toMatchObject({ action: { kind: 'start', mode: 'speak' } });
  });
});
