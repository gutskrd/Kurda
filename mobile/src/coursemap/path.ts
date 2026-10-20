/**
 * The phone's side of the lesson path: the colours a unit takes, the words a
 * stop says to a screen reader, which course the path shows first, and where
 * to scroll to find the current skill. The path itself — which skill is
 * current, the milestones, where each stop sits — is @kurda/shared's
 * `lessonPath`, which the website draws from too.
 *
 * Pure, so it is tested without a screen.
 */
import { lessonPath, type PathStop, type UnitTone } from '@kurda/shared';
import type { ColorScheme } from '../theme/appearance';
import type { TranslationKey } from '../i18n/translations';
import { STATE_LABEL, type CourseEntry } from './node';
import type { SkillNode } from './types';

/**
 * A unit's colours: `fill` behind its banner and its finished stops, `lip`
 * the darker edge under them, `ink` for words and glyphs on the fill, and
 * `text` for the colour as words on the page itself.
 */
export interface ToneColors {
  fill: string;
  lip: string;
  ink: string;
  text: string;
}

/**
 * The same values the website's path.css holds, so a unit is the same colour
 * on both. On the dark page the colours are light and the words on them dark;
 * on the light page they are deep and the words white — each pair at 4.5:1 or
 * better, which `path.test.ts` holds them to.
 */
export const TONES: Record<ColorScheme, Record<UnitTone, ToneColors>> = {
  dark: {
    meadow: { fill: '#7fcf9f', lip: '#4d9a6c', ink: '#0d1f15', text: '#8fdcad' },
    river: { fill: '#86bfe8', lip: '#4f88b3', ink: '#0b1a26', text: '#96c9ee' },
    clay: { fill: '#eda585', lip: '#b46e50', ink: '#2a120a', text: '#f2b59a' },
    dusk: { fill: '#b9aaf0', lip: '#8273bd', ink: '#18122e', text: '#c4b7f4' },
    pine: { fill: '#bcd283', lip: '#849a4f', ink: '#1a220a', text: '#c6da94' },
    rose: { fill: '#eda0bf', lip: '#b56a8a', ink: '#2b0f1b', text: '#f1b1ca' },
  },
  light: {
    meadow: { fill: '#2e7a52', lip: '#1f5739', ink: '#ffffff', text: '#256843' },
    river: { fill: '#2a6a93', lip: '#1c4c6b', ink: '#ffffff', text: '#235a7e' },
    clay: { fill: '#a9532f', lip: '#7d3c21', ink: '#ffffff', text: '#934627' },
    dusk: { fill: '#6551a6', lip: '#493a7d', ink: '#ffffff', text: '#57459a' },
    pine: { fill: '#56692b', lip: '#3e4c1e', ink: '#ffffff', text: '#4b5c25' },
    rose: { fill: '#a3446b', lip: '#78304e', ink: '#ffffff', text: '#8f3b5d' },
  },
};

/** The grey of what is not open yet, and of the line still ahead, in each scheme. */
export const REST: Record<ColorScheme, { fill: string; lip: string; ink: string; line: string }> = {
  dark: { fill: '#262a31', lip: '#1a1d22', ink: '#9a9ca1', line: 'rgba(255,255,255,0.2)' },
  light: { fill: '#e4e4e1', lip: '#c9c9c5', ink: '#74767c', line: 'rgba(17,17,17,0.18)' },
};

/** The sun's gold under an earned trophy, and the glyph on it. */
export const GOLD_LIP: Record<ColorScheme, string> = { dark: '#b88d1f', light: '#b07f00' };
export const GOLD_INK = '#3a2a00';

/**
 * Two colours blended, `t` of the way from `a` to `b` (both #rrggbb): the
 * faded fill of a skill that is ready for a refresh.
 */
export function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** A message to look up: a catalogue key and what fills it in. */
export interface Words {
  key: TranslationKey;
  params?: Record<string, string | number>;
}

/** How a skill stands, as a word said after its name. */
function stateWord(stop: Extract<PathStop<SkillNode>, { kind: 'skill' }>): TranslationKey {
  switch (stop.state) {
    case 'current':
      return 'coursemap.path.state.current';
    case 'available':
      return 'coursemap.path.state.open';
    case 'locked':
      return STATE_LABEL.locked;
    case 'done':
      return stop.finish === 'strong'
        ? 'coursemap.path.state.strong'
        : stop.finish === 'refresh'
          ? 'coursemap.path.state.refresh'
          : STATE_LABEL.completed;
  }
}

/**
 * The whole of a stop, in words, for its button: "Family, you are here, 2 of
 * 4 lessons done". The state word is a key of its own, for the caller to look
 * up and pass in as `state`.
 */
export function stopLabel(stop: PathStop<SkillNode>, unitNumber: number): { words: Words; state?: TranslationKey } {
  if (stop.kind === 'review') return { words: { key: 'coursemap.path.reviewLabel', params: { count: stop.due } } };
  if (stop.kind === 'trophy') {
    return {
      words: { key: 'coursemap.path.trophyLabel', params: { n: unitNumber } },
      state: stop.earned ? 'coursemap.path.trophyEarned' : 'coursemap.path.trophyAhead',
    };
  }
  const state = stateWord(stop);
  return stop.lessonsTotal > 0
    ? { words: { key: 'coursemap.path.label', params: { title: stop.skill.title, done: stop.lessonsDone, total: stop.lessonsTotal } }, state }
    : { words: { key: 'coursemap.path.labelShort', params: { title: stop.skill.title } }, state };
}

/**
 * Which course the path opens on: one already begun that still has a skill to
 * do, else the first with one to do, else the first listed. One whose map did
 * not load is still listed (and can be chosen, to try it again), but is not
 * opened on by itself.
 */
export function firstCourse(entries: readonly CourseEntry[]): string | null {
  const loaded = entries.filter((e): e is CourseEntry & { map: NonNullable<CourseEntry['map']> } => e.map !== null);
  const withCurrent = loaded.filter((e) => lessonPath(e.map).current !== null);
  const begun = withCurrent.find((e) => e.map.units.some((u) => u.skills.some((s) => s.state !== 'locked' && s.state !== 'unlocked')));
  return (begun ?? withCurrent[0] ?? loaded[0] ?? entries[0])?.course.id ?? null;
}

/**
 * Where to scroll so a point sits in the middle of what can be seen: the
 * screen's height less the tab bar over its foot. Never above the top.
 */
export function centredOffset(pointY: number, viewport: number, bottomInset: number): number {
  return Math.max(0, Math.round(pointY - (viewport - bottomInset) / 2));
}

/**
 * Is the current skill off the screen, and which way? Null while any of it can
 * be seen; `margin` is how much of it has to be gone before the way back
 * appears, so a stop half under the top bar does not flicker the button.
 */
export function awayFrom(
  pointY: number,
  scrollY: number,
  viewport: number,
  bottomInset: number,
  margin = 36,
): 'up' | 'down' | null {
  if (pointY < scrollY - margin) return 'up';
  if (pointY > scrollY + viewport - bottomInset + margin) return 'down';
  return null;
}
