/**
 * The phone's side of the lesson path: unit colours, screen-reader labels, stop rings, which course opens first,
 * and scroll positions. The path's structure itself is shared `lessonPath`, which the website uses too.
 */
import { TOPIC_STARS, lessonPath, levelHintKey, levelNameKey, levelOfCefr, type PathStop, type PathStopLook, type SkillStop, type UnitTone } from '@kurda/shared';
import type { ColorScheme } from '../theme/appearance';
import type { TranslationKey } from '../i18n/translations';
import { STATE_LABEL, type CourseEntry } from './node';
import type { SkillNode } from './types';

/** A unit's colours: `fill` and its darker `lip`, `ink` on the fill, and `text` for the colour on the page. */
export interface ToneColors {
  fill: string;
  lip: string;
  ink: string;
  text: string;
}

/**
 * Must match the website's path.css. Saffron stays gold with dark-brown ink, since a yellow dark enough for
 * white text is brown. `path.test.ts` holds every pair to 4.5:1 contrast.
 */
export const TONES: Record<ColorScheme, Record<UnitTone, ToneColors>> = {
  dark: {
    meadow: { fill: '#78d694', lip: '#459b61', ink: '#011c0a', text: '#92dfa7' },
    river: { fill: '#91c1ff', lip: '#5188cd', ink: '#05162c', text: '#a8ceff' },
    clay: { fill: '#ffa47a', lip: '#c16d45', ink: '#280d02', text: '#ffb798' },
    dusk: { fill: '#aeb8fe', lip: '#767ecd', ink: '#11132c', text: '#bec6ff' },
    pine: { fill: '#57d4d4', lip: '#009a9a', ink: '#001b1b', text: '#65e1e1' },
    rose: { fill: '#fd9ac6', lip: '#bc668e', ink: '#260b18', text: '#ffafd1' },
    saffron: { fill: '#eeb154', lip: '#b07a20', ink: '#221200', text: '#f5c076' },
  },
  light: {
    meadow: { fill: '#058644', lip: '#006531', ink: '#ffffff', text: '#00783b' },
    river: { fill: '#0073df', lip: '#0157ac', ink: '#ffffff', text: '#0161bd' },
    clay: { fill: '#c45001', lip: '#973c00', ink: '#ffffff', text: '#a24102' },
    dusk: { fill: '#6363eb', lip: '#4a47c0', ink: '#ffffff', text: '#504bd1' },
    pine: { fill: '#008282', lip: '#006262', ink: '#ffffff', text: '#067272' },
    rose: { fill: '#cd3688', lip: '#a51a6a', ink: '#ffffff', text: '#af0f6f' },
    saffron: { fill: '#c37902', lip: '#8f5d04', ink: '#241600', text: '#885703' },
  },
};

/**
 * What a unit wears on the path itself (its banner, finished lessons, the rail and the jump sheet): the page's ink, as
 * what is chosen or earned is everywhere, so the main button stays the one coloured thing. Its drawn stops keep their
 * unit's colours (`TONES`). Must match path.css's `lp-tone-*` rules.
 */
export const UNIT_INK: Record<ColorScheme, ToneColors> = {
  dark: { fill: '#f3f1fb', lip: '#a9a6bb', ink: '#14112e', text: '#f3f1fb' },
  light: { fill: '#14112e', lip: '#050410', ink: '#ffffff', text: '#14112e' },
};

/** Locked stops and the line still ahead, in each scheme. */
export const REST: Record<ColorScheme, { fill: string; lip: string; ink: string; line: string }> = {
  dark: { fill: '#2b283c', lip: '#1a1828', ink: '#9e9cb0', line: 'rgba(255,255,255,0.2)' },
  light: { fill: '#e3e1ec', lip: '#cac8d7', ink: '#716e85', line: 'rgba(20,17,46,0.18)' },
};

/** The glyph colour on an open stop's cream face and on a locked stop's stone. */
export const FACE_INK: Record<ColorScheme, { paper: (tone: ToneColors) => string; stone: string }> = {
  light: { paper: (tone) => tone.text, stone: '#857861' },
  dark: { paper: () => '#3d2a1f', stone: '#d6d2dc' },
};

/**
 * The unfilled track of a topic ring, and the edge under every piece so the ring reads on any ground. Filled
 * pieces use the palette's `primary`, and a whole ring its `gold`.
 */
export const RING: Record<ColorScheme, { track: string; edge: string }> = {
  light: { track: '#fffaf0', edge: 'rgba(36, 24, 70, 0.32)' },
  dark: { track: '#2b283c', edge: 'rgba(6, 4, 16, 0.6)' },
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
