/**
 * What the practice hub offers, from what GET /practice/hub says: the one
 * thing most worth doing now, for the card at the top, and the row for every
 * other kind of practice — each either ready to start or saying, in one line,
 * why it is not. Among the rows, each beside the kind it is nearest to, are
 * the lessons' two exercises that have a screen of their own
 * (practice/exercises.ts), when they can be done now. Pure, so the choices
 * are tested apart from the screen.
 */
import { ACCURACY_BONUS_XP, BASE_LESSON_XP, type PracticeHub, type PracticeHubUnit, type PracticeMode, type UnitTone } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/Icon';
import type { ExerciseRoute, PhoneExercise } from './exercises';

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
 * picker, open Settings to allow the microphone, or open an exercise's own
 * screen. Null for a row with nothing to do, which is shown, dimmed, with its
 * reason.
 */
export type RowAction = { kind: 'start'; mode: PracticeMode } | { kind: 'pick' } | { kind: 'settings' } | { kind: 'open'; route: ExerciseRoute } | null;

export interface HubRow {
  key: 'mistakes' | 'words' | 'listen' | 'speak' | 'unit' | PhoneExercise['key'];
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
 *
 * The exercises are the exception to "never hidden": one is in the list only
 * while it can be done (`exercises` holds those), since what keeps it away is
 * content an editor has yet to publish, which nothing the learner does would
 * change. Building a sentence follows the words it is made of, and Hear It,
 * Find It follows listening.
 */
export function hubRows(hub: PracticeHub, { micRefused, exercises = [] }: { micRefused: boolean; exercises?: readonly PhoneExercise[] }): HubRow[] {
  const count = (n: number, one: TranslationKey, many: TranslationKey): Line => (n === 1 ? { key: one } : { key: many, count: n });
  const exercise = (key: PhoneExercise['key']): HubRow[] =>
    exercises.filter((e) => e.key === key).map((e) => ({ key: e.key, icon: e.icon, title: e.title, detail: { key: e.detail }, waiting: false, action: { kind: 'open', route: e.route } }));
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
    ...exercise('sentence'),
    {
      key: 'listen',
      icon: 'headphones',
      title: 'practice.hub.listen',
      detail: { key: hub.listen ? 'practice.hub.listenDetail' : 'practice.hub.listenNone' },
      waiting: false,
      action: hub.listen ? { kind: 'start', mode: 'listen' } : null,
    },
    ...exercise('hear'),
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

/**
 * What a practice session pays, said on the button that starts one: half of
 * what a fresh lesson does, from none right to all right. The server's
 * practice service halves `lessonCompletionXp` and rounds the same way, so
 * the promise is the one it keeps.
 */
export const PRACTICE_XP_FACTOR = 0.5;

export function practiceXpRange(): { min: number; max: number } {
  return {
    min: Math.max(1, Math.round(BASE_LESSON_XP * PRACTICE_XP_FACTOR)),
    max: Math.max(1, Math.round((BASE_LESSON_XP + ACCURACY_BONUS_XP) * PRACTICE_XP_FACTOR)),
  };
}

/** The colour each kind's badge wears (coursemap/path.ts `TONES`): one each, so the rows are told apart at a glance. */
export const ROW_TONES: Record<HubRow['key'], UnitTone> = { mistakes: 'rose', words: 'saffron', sentence: 'river', listen: 'meadow', hear: 'dusk', speak: 'clay', unit: 'pine' };

/** The colour the card at the top is painted in: a unit's own, else by what it offers. */
export function heroTone(hero: Hero): UnitTone {
  if (hero.kind === 'unit') return hero.unit.tone;
  return hero.kind === 'due' ? 'meadow' : hero.kind === 'weak' ? 'saffron' : 'pine';
}
