import type { HueName, PracticeHub, PracticeMode } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

/** The kinds of practice the hub lists besides review, in the phone's order. */
export type KindKey = 'mistakes' | 'words' | 'listen' | 'speak' | 'unit';

/** One kind's line under its name: a catalogue key, and the count it says, if any. */
export interface Line {
  key: MessageKey;
  count?: number;
}

export interface KindRow {
  key: KindKey;
  title: MessageKey;
  detail: Line;
  /** Whether a session of this kind would find anything; an empty kind stays listed, saying what would fill it. */
  ready: boolean;
  /** Something is waiting in it (mistakes to put right), said in the accent as well as in words. */
  waiting: boolean;
}

/** Each kind's badge hue (shared hues), as the phone gives them; the interface draws them all in the page's own steps. */
export const KIND_HUES: Record<KindKey | 'sentence' | 'hear', HueName> = {
  mistakes: 'pink',
  words: 'gold',
  sentence: 'blue',
  listen: 'green',
  hear: 'indigo',
  speak: 'orange',
  unit: 'teal',
};

/** The session a ready kind starts (POST /practice/session `mode`); a chapter's review also names its chapter. */
export const KIND_MODE: Record<Exclude<KindKey, 'unit'>, PracticeMode> = { mistakes: 'mistakes', words: 'words', listen: 'listen', speak: 'speak' };

/**
 * Every kind of practice from GET /practice/hub, never hidden: an empty kind says what would fill it, and speaking says
 * when the learner turned it off. The microphone is the page's to ask about, when speaking starts.
 */
export function kindRows(hub: PracticeHub): KindRow[] {
  const count = (n: number, one: MessageKey, many: MessageKey): Line => (n === 1 ? { key: one } : { key: many, count: n });
  return [
    {
      key: 'mistakes',
      title: 'practice.hub.mistakes',
      detail: hub.mistakes > 0 ? count(hub.mistakes, 'practice.hub.mistakesOne', 'practice.hub.mistakesCount') : { key: 'practice.hub.mistakesNone' },
      ready: hub.mistakes > 0,
      waiting: hub.mistakes > 0,
    },
    { key: 'words', title: 'practice.hub.words', detail: { key: hub.words ? 'practice.hub.wordsDetail' : 'practice.hub.wordsNone' }, ready: hub.words, waiting: false },
    { key: 'listen', title: 'practice.hub.listen', detail: { key: hub.listen ? 'practice.hub.listenDetail' : 'practice.hub.listenNone' }, ready: hub.listen, waiting: false },
    {
      key: 'speak',
      title: 'practice.hub.speak',
      detail: { key: hub.skipSpeaking ? 'practice.hub.speakOff' : hub.speak ? 'practice.hub.speakDetail' : 'practice.hub.speakNone' },
      ready: hub.speak && !hub.skipSpeaking,
      waiting: false,
    },
    {
      key: 'unit',
      title: 'practice.hub.unit',
      detail: hub.units.length > 0 ? count(hub.units.length, 'practice.hub.unitOne', 'practice.hub.unitCount') : { key: 'practice.hub.unitNone' },
      ready: hub.units.length > 0,
      waiting: false,
    },
  ];
}

/** Where a session of one kind starts: the review page with its kind, and for a chapter which one. */
export function practiceHref(mode: PracticeMode, unitId?: string): string {
  const query = new URLSearchParams({ mode });
  if (unitId) query.set('unit', unitId);
  return `/app/learn/review?${query.toString()}`;
}
