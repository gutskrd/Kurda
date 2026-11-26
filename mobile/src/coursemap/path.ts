/**
 * The phone's side of the lesson path: unit colours, screen-reader labels, stop rings, which course opens first,
 * and scroll positions. The path's structure itself is shared `lessonPath`, which the website uses too.
 */
import {
  PATH_REST,
  PATH_STOP_TONES,
  TOPIC_STARS,
  lessonPath,
  levelHintKey,
  levelNameKey,
  levelOfCefr,
  type PathStop,
  type PathStopLook,
  type SkillStop,
  type UnitColours,
  type UnitTone,
} from '@kurda/shared';
import type { ColorScheme } from '../theme/appearance';
import type { TranslationKey } from '../i18n/translations';
import { STATE_LABEL, type CourseEntry } from './node';
import type { SkillNode } from './types';

/** A unit's colours: `fill` and its darker `lip`, `ink` on the fill, and `text` for the colour on the page. */
export type ToneColors = UnitColours;

/**
 * Each unit's own vivid colour (shared `PATH_STOP_TONES`, which the website's path.css matches): its banner, the stop to
 * do now, the bubble over it, its finished lessons, the rail and the jump sheet. `path.test.ts` holds every pair to
 * 4.5:1 contrast.
 */
export const TONES: Record<ColorScheme, Record<UnitTone, ToneColors>> = PATH_STOP_TONES;

/** Locked stops and the line still ahead, in each scheme: flat slate (shared `PATH_REST`). */
export const REST: Record<ColorScheme, { fill: string; lip: string; ink: string; line: string }> = PATH_REST;

/** The glyph colour on an open stop's face, in its unit's ink, and on a locked stop's slate. */
export const FACE_INK: Record<ColorScheme, { paper: (tone: ToneColors) => string; stone: string }> = {
  light: { paper: (tone) => tone.ink, stone: PATH_REST.light.ink },
  dark: { paper: (tone) => tone.ink, stone: PATH_REST.dark.ink },
};

/**
 * The unfilled track of a topic ring, and the edge under every piece so the ring reads on any ground. Filled
 * pieces use the unit's colour on the stop to do now, and a whole ring its `gold`.
 */
export const RING: Record<ColorScheme, { track: string; edge: string }> = {
  light: { track: '#d6dfe3', edge: 'rgba(23, 36, 43, 0.28)' },
  dark: { track: '#2e3c43', edge: 'rgba(5, 8, 10, 0.6)' },
};

/** A star on a finished topic's gold coin, edged so it stands off the gold. */
export const STAR = { fill: '#fffaf0', edge: '#a8691a' } as const;

/** Blends two #rrggbb colours, `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** A catalogue key and its parameters. */
interface Words {
  key: TranslationKey;
  params?: Record<string, string | number>;
}

/** A skill's state, as a word read after its name. */
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
 * A stop's screen-reader label, e.g. "Family, you are here, 2 of 4 lessons done", or the current round once a
 * skill has a star. The state word comes back as its own key for the caller to translate.
 */
export function stopLabel(stop: PathStop<SkillNode>, unit: { number: number; title: string }): { words: Words; state?: TranslationKey } {
  const unitNumber = unit.number;
  if (stop.kind === 'review') return { words: { key: 'coursemap.path.reviewLabel', params: { count: stop.due } } };
  if (stop.kind === 'trophy') {
    return {
      words: { key: 'coursemap.path.trophyLabel', params: { n: unitNumber } },
      state: stop.earned ? 'coursemap.path.trophyEarned' : 'coursemap.path.trophyAhead',
    };
  }
  if (stop.kind === 'story') return { words: { key: stop.open ? 'coursemap.path.storyLabel' : 'coursemap.path.storyLabelShut', params: { title: stop.title } } };
  const state = stateWord(stop);
  const title = stop.skill.title;
  if (stop.lessonsTotal === 0) return { words: { key: 'coursemap.path.labelShort', params: { title } }, state };
  if (stop.rounds >= TOPIC_STARS) return { words: { key: 'coursemap.path.labelRounds', params: { title, last: TOPIC_STARS } }, state };
  if (stop.rounds > 0) {
    return { words: { key: 'coursemap.path.labelRound', params: { title, round: stop.rounds + 1, last: TOPIC_STARS, done: stop.pieces, total: stop.lessonsTotal } }, state };
  }
  return { words: { key: 'coursemap.path.label', params: { title, done: stop.lessonsDone, total: stop.lessonsTotal } }, state };
}

/** A skill's ring: `of` pieces (one per lesson), `filled` of them, and `whole` once all rounds are played. Null for stops without a ring. */
export function ringOf(stop: PathStop<SkillNode>): { of: number; filled: number; whole: boolean } | null {
  if (stop.kind !== 'skill' || stop.lessonsTotal === 0) return null;
  return ringAt(stop, { rounds: stop.rounds, pieces: stop.pieces });
}

/** A skill's ring at a given point in its rounds, e.g. before a lesson. */
export function ringAt(stop: Pick<SkillStop<SkillNode>, 'lessonsTotal'>, at: { rounds: number; pieces: number }): { of: number; filled: number; whole: boolean } {
  const whole = at.rounds >= TOPIC_STARS;
  return { of: stop.lessonsTotal, filled: whole ? stop.lessonsTotal : Math.min(at.pieces, stop.lessonsTotal), whole };
}

/**
 * How a stop is drawn (shared `pathStopSvg`). A finished skill is a gold coin whatever its review strength, and
 * fades only when a refresh would help. A chapter's story is a scroll on stone until the chapter is done; a unit
 * without a story ends at its chest. With `jump`, the stop is drawn as the gate a jump goes through.
 */
export function stopLook(stop: PathStop<SkillNode>, jump = false): PathStopLook {
  if (jump) return 'jump';
  if (stop.kind === 'review') return 'review';
  if (stop.kind === 'trophy') return stop.earned ? 'chestOpen' : 'chest';
  if (stop.kind === 'story') return stop.open ? 'story' : 'storyLocked';
  if (stop.state === 'done') return stop.finish === 'refresh' ? 'refresh' : 'done';
  return stop.state;
}

/**
 * A section level's name and description for its card, using the same level names as the stories (shared
 * `levelNameKey`) so learners never see a bare CEFR letter. Null when there is no level or it is past the ladder.
 */
export function levelWords(level: string | null): { name: TranslationKey; hint: TranslationKey } | null {
  const at = level ? levelOfCefr(level) : null;
  return at ? { name: levelNameKey(at), hint: levelHintKey(at) } : null;
}

/**
 * The course the path opens on: one begun with a skill left, else the first with a skill left, else the first.
 * A course whose map failed to load is never opened automatically.
 */
export function firstCourse(entries: readonly CourseEntry[]): string | null {
  const loaded = entries.filter((e): e is CourseEntry & { map: NonNullable<CourseEntry['map']> } => e.map !== null);
  const withCurrent = loaded.filter((e) => lessonPath(e.map).current !== null);
  const begun = withCurrent.find((e) => e.map.units.some((u) => u.skills.some((s) => s.state !== 'locked' && s.state !== 'unlocked')));
  return (begun ?? withCurrent[0] ?? loaded[0] ?? entries[0])?.course.id ?? null;
}

/** The scroll offset that centres a point in the visible area above the tab bar, never below zero. */
export function centredOffset(pointY: number, viewport: number, bottomInset: number): number {
  return Math.max(0, Math.round(pointY - (viewport - bottomInset) / 2));
}

/**
 * Which way the current skill is off screen, or null while any of it shows. `margin` keeps a stop half under the
 * top bar from flickering the button.
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
