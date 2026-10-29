/**
 * What the practice hub offers, from what GET /practice/hub says: the one
 * thing most worth doing now, for the card at the top, and the row for every
 * other kind of practice — each either ready to start or saying, in one line,
 * why it is not. Pure, so the choices are tested apart from the screen.
 */
import type { PracticeHub, PracticeHubUnit, PracticeMode } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/Icon';

/**
 * The card at the top:
 *   due    — words waiting for review, with how many;
 *   unit   — nothing due: the unit finished last, to go back over;
 *   weak   — nothing due and no unit finished: the hardest words again;
 *   none   — nothing learned yet: the lessons are where it starts.
 */
export type Hero = { kind: 'due'; count: number } | { kind: 'unit'; unit: PracticeHubUnit } | { kind: 'weak' } | { kind: 'none' };

export function heroOf(hub: PracticeHub): Hero {
  if (hub.due > 0) return { kind: 'due', count: hub.due };
  const latest = hub.units[0];
  if (latest) return { kind: 'unit', unit: latest };
  if (hub.available > 0) return { kind: 'weak' };
  return { kind: 'none' };
}

/** A line to look up: a catalogue key, and the count it says, if any. */
export interface Line {
  key: TranslationKey;
  count?: number;
}

/**
 * What a row does when pressed: start a session of its kind, open the unit
 * picker, or open Settings to allow the microphone. Null for a row with
 * nothing to do, which is shown, dimmed, with its reason.
 */
export type RowAction = { kind: 'start'; mode: PracticeMode } | { kind: 'pick' } | { kind: 'settings' } | null;

export interface HubRow {
  key: 'mistakes' | 'words' | 'listen' | 'speak' | 'unit';
  icon: IconName;
  title: TranslationKey;
  detail: Line;
  /** something is waiting in it (mistakes to put right), said in gold as well as in words */
  waiting: boolean;
  action: RowAction;
}

/**
 * Every other kind of practice, in a fixed order, never hidden: a kind with
 * nothing in it says what would put something there. Speaking also answers to
 * the learner turning speaking off, and to a microphone refused for good —
 * then the row is the way to Settings, where only it can be allowed again.
 */
export function hubRows(hub: PracticeHub, { micRefused }: { micRefused: boolean }): HubRow[] {
  const count = (n: number, one: TranslationKey, many: TranslationKey): Line => (n === 1 ? { key: one } : { key: many, count: n });
  return [
    {
      key: 'mistakes',
      icon: 'target',
      title: 'practice.hub.mistakes',
      detail: hub.mistakes > 0 ? count(hub.mistakes, 'practice.hub.mistakesOne', 'practice.hub.mistakesCount') : { key: 'practice.hub.mistakesNone' },
      waiting: hub.mistakes > 0,
      action: hub.mistakes > 0 ? { kind: 'start', mode: 'mistakes' } : null,
    },
    {
      key: 'words',
      icon: 'text',
      title: 'practice.hub.words',
      detail: { key: hub.words ? 'practice.hub.wordsDetail' : 'practice.hub.wordsNone' },
      waiting: false,
      action: hub.words ? { kind: 'start', mode: 'words' } : null,
    },
    {
      key: 'listen',
      icon: 'headphones',
      title: 'practice.hub.listen',
      detail: { key: hub.listen ? 'practice.hub.listenDetail' : 'practice.hub.listenNone' },
      waiting: false,
      action: hub.listen ? { kind: 'start', mode: 'listen' } : null,
    },
    speakRow(hub, micRefused),
    {
      key: 'unit',
      icon: 'trophy',
      title: 'practice.hub.unit',
      detail: hub.units.length > 0 ? count(hub.units.length, 'practice.hub.unitOne', 'practice.hub.unitCount') : { key: 'practice.hub.unitNone' },
      waiting: false,
      action: hub.units.length > 0 ? { kind: 'pick' } : null,
    },
  ];
}

function speakRow(hub: PracticeHub, micRefused: boolean): HubRow {
  const row = { key: 'speak', icon: 'microphone', title: 'practice.hub.speak', waiting: false } as const;
  if (hub.skipSpeaking) return { ...row, detail: { key: 'practice.hub.speakOff' }, action: null };
  if (!hub.speak) return { ...row, detail: { key: 'practice.hub.speakNone' }, action: null };
  if (micRefused) return { ...row, detail: { key: 'practice.hub.micOff' }, action: { kind: 'settings' } };
  return { ...row, detail: { key: 'practice.hub.speakDetail' }, action: { kind: 'start', mode: 'speak' } };
}
