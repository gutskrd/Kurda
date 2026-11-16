/**
 * The phone's side of the lesson path: the colours a unit takes, the words a
 * stop says to a screen reader, which course the path shows first, and where
 * to scroll to find the current skill. The path itself — which skill is
 * current, the milestones, where each stop sits — is @kurda/shared's
 * `lessonPath`, which the website draws from too.
 *
 * Pure, so it is tested without a screen.
 */
import { lessonPath, type PathStop, type PathStopLook, type UnitTone } from '@kurda/shared';
import type { ColorScheme } from '../theme/appearance';
import { LIGHT } from '../theme/palette';
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
 * on both. They are the app's hues (shared `hues.ts`) cut for a banner: on
 * the dark page the colours are light and the words on them dark; on the
 * light page they are vivid and deep enough for white words, except saffron,
 * which stays a gold and is written on in a dark brown, since a yellow deep
 * enough for white is a brown. Each pair is 4.5:1 or better, which
 * `path.test.ts` holds them to.
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

/** The grey of what is not open yet, and of the line still ahead, in each scheme: the page's own quiet violet-grey, not a neutral one. */
export const REST: Record<ColorScheme, { fill: string; lip: string; ink: string; line: string }> = {
  dark: { fill: '#2b283c', lip: '#1a1828', ink: '#9e9cb0', line: 'rgba(255,255,255,0.2)' },
  light: { fill: '#e3e1ec', lip: '#cac8d7', ink: '#716e85', line: 'rgba(20,17,46,0.18)' },
};

/**
 * The glyph on a stop's drawn face where the face is not the unit's colour:
 * on an open stop's cream (the unit's deep colour by day; by evening the
 * cream stays light, so the valley's ink) and on a closed one's field stone.
 */
export const FACE_INK: Record<ColorScheme, { paper: (tone: ToneColors) => string; stone: string }> = {
  light: { paper: (tone) => tone.text, stone: '#857861' },
  dark: { paper: () => '#3d2a1f', stone: '#d6d2dc' },
};

/** The sun's gold under an earned trophy. */
export const GOLD_LIP: Record<ColorScheme, string> = { dark: '#b88d1f', light: '#b07f00' };
/**
 * The glyph on that gold: the palette's `textOnGold`, under the name the
 * fire's ladder still asks for it by. It is the same brown in both schemes,
 * which is what lets it stay a constant here; a screen with the palette in
 * hand reads `colors.textOnGold` itself.
 */
export const GOLD_INK = LIGHT.textOnGold;

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
 * up and pass in as `state`. A unit's guide is named for its unit, as its
 * banner's button was before it stood on the path.
 */
export function stopLabel(stop: PathStop<SkillNode>, unit: { number: number; title: string }): { words: Words; state?: TranslationKey } {
  const unitNumber = unit.number;
  if (stop.kind === 'review') return { words: { key: 'coursemap.path.reviewLabel', params: { count: stop.due } } };
  if (stop.kind === 'guide') return { words: { key: 'coursemap.path.guideFor', params: { unit: unit.title } } };
  if (stop.kind === 'trophy') {
    return {
      words: { key: 'coursemap.path.trophyLabel', params: { n: unitNumber } },
      state: stop.earned ? 'coursemap.path.trophyEarned' : 'coursemap.path.trophyAhead',
    };
  }
  if (stop.kind === 'story') return { words: { key: stop.open ? 'coursemap.path.storyLabel' : 'coursemap.path.storyLabelShut', params: { title: stop.title } } };
  const state = stateWord(stop);
  return stop.lessonsTotal > 0
    ? { words: { key: 'coursemap.path.label', params: { title: stop.skill.title, done: stop.lessonsDone, total: stop.lessonsTotal } }, state }
    : { words: { key: 'coursemap.path.labelShort', params: { title: stop.skill.title } }, state };
}

/**
 * How a stop is drawn (shared `pathStopSvg`): a skill by how it stands, the
 * guide as its open book (grey until its unit is begun), review as an open
 * stop, a unit's end as its chest — open once earned — the story after it as
 * a scroll, rolled and tied until the chapter is done, and the first skill of
 * a unit that can be jumped to as the gate the jump goes through.
 */
export function stopLook(stop: PathStop<SkillNode>, jump = false): PathStopLook {
  if (jump) return 'jump';
  if (stop.kind === 'review') return 'review';
  if (stop.kind === 'guide') return stop.open ? 'guide' : 'guideLocked';
  if (stop.kind === 'trophy') return stop.earned ? 'chestOpen' : 'chest';
  if (stop.kind === 'story') return stop.open ? 'story' : 'storyLocked';
  if (stop.state === 'done') return stop.finish === 'strong' ? 'strong' : stop.finish === 'refresh' ? 'refresh' : 'done';
  return stop.state;
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
