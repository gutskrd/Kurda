/**
 * What the practice hub offers, from GET /practice/hub: the one thing most worth doing for the top card, and a
 * row for every other kind, ready or saying in one line why not. The two lesson exercises with their own screens
 * (practice/exercises.ts) sit beside their nearest kind when available. Pure.
 */
import { ACCURACY_BONUS_XP, BASE_LESSON_XP, type HueName, type PracticeHub, type PracticeHubUnit, type PracticeMode } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/Icon';
import type { ExerciseRoute, PhoneExercise } from './exercises';

/**
 * The top card:
 *   due    words waiting for review, with their count;
 *   unit   nothing due: the unit finished last;
 *   weak   nothing due and no unit finished: the hardest words;
 *   none   nothing learned yet: the lessons.
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
 * What a row does when pressed: start a session, open the unit picker, open Settings for the microphone, or open
 * an exercise's screen. Null for a row with nothing to do, shown dimmed with its reason.
 */
export type RowAction = { kind: 'start'; mode: PracticeMode } | { kind: 'pick' } | { kind: 'settings' } | { kind: 'open'; route: ExerciseRoute } | null;

export interface HubRow {
  key: 'mistakes' | 'words' | 'listen' | 'speak' | 'unit' | PhoneExercise['key'];
  icon: IconName;
  title: TranslationKey;
  detail: Line;
  /** Something is waiting in it (mistakes to fix), shown in the ink as well as in words. */
  waiting: boolean;
  action: RowAction;
}

/**
 * Every other kind of practice, in a fixed order and never hidden: an empty kind says what would fill it.
 * Speaking also reflects the learner turning speaking off and a microphone denied for good, when the row leads to
 * Settings.
 *
 * Exercises are the exception: one is listed only while available (`exercises`), since only an editor publishing
 * content can change that. Building a sentence follows words, and Hear It, Find It follows listening.
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
 * What a practice session pays, shown on its start button: half a fresh lesson's XP, from none right to all
 * right. The server's practice service halves `lessonCompletionXp` and rounds the same way.
 */
export const PRACTICE_XP_FACTOR = 0.5;

export function practiceXpRange(): { min: number; max: number } {
  return {
    min: Math.max(1, Math.round(BASE_LESSON_XP * PRACTICE_XP_FACTOR)),
    max: Math.max(1, Math.round((BASE_LESSON_XP + ACCURACY_BONUS_XP) * PRACTICE_XP_FACTOR)),
  };
}

/**
 * Each kind's badge hue (shared `hues.ts`): distinct so rows are told apart, from one family so they read as one
 * list. Violet is left out: on this screen it belongs to the top card and its button.
 */
export const ROW_HUES: Record<HubRow['key'], HueName> = { mistakes: 'pink', words: 'gold', sentence: 'blue', listen: 'green', hear: 'indigo', speak: 'orange', unit: 'teal' };
