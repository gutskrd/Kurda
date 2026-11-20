import {
  PICTURE_SCAN_CATEGORIES,
  PICTURE_SCAN_LEVELS,
  type PictureRejectReason,
  type PictureScanCategory,
  type PictureScanLevel,
  type PictureSurface,
  type ReportCategory,
} from '@kurda/shared';

/**
 * What a picture check's findings mean, pure and deterministic: how sure the check is per category, turned into clear,
 * held for a person, refused with a reason, or a child-safety hit. Anything uncertain is held rather than shown, and a
 * letter's drawing is never refused outright (only held), except for child safety.
 */

export type PictureLevels = Record<PictureScanCategory, PictureScanLevel>;

export type PictureOutcome =
  | { state: 'clear' }
  | { state: 'held' }
  | { state: 'refused'; reason: PictureRejectReason }
  | { state: 'child_safety' };

const RANK: Readonly<Record<PictureScanLevel, number>> = { none: 0, possible: 1, likely: 2, certain: 3 };

const atLeast = (level: PictureScanLevel, floor: PictureScanLevel): boolean => RANK[level] >= RANK[floor];

/** The categories that refuse a picture at likely or certain, in the order a tie is named, with the reason its owner sees. */
const REFUSING: ReadonlyArray<readonly [PictureScanCategory, PictureRejectReason]> = [
  ['sexual', 'sexual'],
  ['violence', 'violence'],
  ['self_harm', 'self_harm'],
  ['hate', 'hate'],
  ['shocking', 'other'],
];

/** The policy from findings to an outcome (the table is in the module header of the tests too). */
export function decidePicture(levels: PictureLevels, surface: PictureSurface): PictureOutcome {
  if (atLeast(levels.minor_safety, 'possible')) return { state: 'child_safety' };
  let worst: { rank: number; reason: PictureRejectReason } | null = null;
  for (const [category, reason] of REFUSING) {
    const rank = RANK[levels[category]];
    if (rank >= RANK.likely && (!worst || rank > worst.rank)) worst = { rank, reason };
  }
  if (worst) return surface === 'letter' ? { state: 'held' } : { state: 'refused', reason: worst.reason };
  const uncertain =
    REFUSING.some(([category]) => atLeast(levels[category], 'possible')) ||
    atLeast(levels.suggestive, 'possible') ||
    atLeast(levels.drugs, 'likely');
  return uncertain ? { state: 'held' } : { state: 'clear' };
}

/** Every category at `none`: what a picture nobody could find anything in looks like. */
export const CLEAN_LEVELS: PictureLevels = Object.fromEntries(PICTURE_SCAN_CATEGORIES.map((c) => [c, 'none'])) as PictureLevels;

/** Findings with only some categories named, the rest `none`. */
export function levelsOf(partial: Partial<PictureLevels>): PictureLevels {
  return { ...CLEAN_LEVELS, ...partial };
}

/** Findings read back from storage or an answer, or null unless every category has a known level. */
export function parseLevels(value: unknown): PictureLevels | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const out: Partial<PictureLevels> = {};
  for (const category of PICTURE_SCAN_CATEGORIES) {
    const level = v[category];
    if (typeof level !== 'string' || !(PICTURE_SCAN_LEVELS as readonly string[]).includes(level)) return null;
    out[category] = level as PictureScanLevel;
  }
  return out as PictureLevels;
}

/** The old numeric columns, kept meaningful: none, possible, likely and certain as 0, 0.5, 0.8 and 1. */
export const LEVEL_SCORE: Readonly<Record<PictureScanLevel, number>> = { none: 0, possible: 0.5, likely: 0.8, certain: 1 };

export function legacyScores(levels: PictureLevels): { nsfwScore: number; violenceScore: number; csamMatch: boolean } {
  const top = (...categories: PictureScanCategory[]) => Math.max(...categories.map((c) => LEVEL_SCORE[levels[c]]));
  return {
    nsfwScore: top('sexual', 'suggestive', 'minor_safety'),
    violenceScore: top('violence', 'self_harm', 'shocking'),
    csamMatch: atLeast(levels.minor_safety, 'possible'),
  };
}

/** The old `image_scans.action` for an outcome, so older readers of the table still read it right. */
export function legacyAction(outcome: PictureOutcome): 'allow' | 'gate' | 'auto_block' | 'hard_block' {
  switch (outcome.state) {
    case 'clear':
      return 'allow';
    case 'held':
      return 'gate';
    case 'refused':
      return 'auto_block';
    case 'child_safety':
      return 'hard_block';
  }
}

/** The old `image_scans.reasons` words for findings. */
export function legacyReasons(levels: PictureLevels | null, outcome: PictureOutcome): string[] {
  if (outcome.state === 'child_safety') return ['csam'];
  if (!levels) return [];
  const out: string[] = [];
  if (['sexual', 'suggestive'].some((c) => levels[c as PictureScanCategory] !== 'none')) out.push('nsfw');
  if (['violence', 'self_harm', 'shocking'].some((c) => levels[c as PictureScanCategory] !== 'none')) out.push('violence');
  return out;
}

/** The rule a picture breaks for each category, for a removal decided from what the check found. */
const RULE_OF: Readonly<Record<PictureScanCategory, ReportCategory>> = {
  sexual: 'sexual',
  suggestive: 'sexual',
  minor_safety: 'child_safety',
  violence: 'violence',
  self_harm: 'self_harm',
  hate: 'hate',
  drugs: 'other',
  shocking: 'other',
};

/** The most likely category the check found, or null when it found nothing; ties go to the earlier category. */
export function topCategory(levels: PictureLevels | null): PictureScanCategory | null {
  if (!levels) return null;
  let best: PictureScanCategory | null = null;
  for (const category of PICTURE_SCAN_CATEGORIES) {
    if (levels[category] === 'none') continue;
    if (!best || RANK[levels[category]] > RANK[levels[best]]) best = category;
  }
  return best;
}

/** The rule a held picture would be removed under, from what the check found most strongly. */
export function ruleFor(levels: PictureLevels | null, outcome?: PictureOutcome): ReportCategory {
  if (outcome?.state === 'child_safety') return 'child_safety';
  const top = topCategory(levels);
  return top ? RULE_OF[top] : 'other';
}

/** The report category a refusal reason stands for. */
export function ruleOfReason(reason: PictureRejectReason): ReportCategory {
  return reason;
}

/** Where a picture is shown, from the kind its upload was stored under. */
export const SURFACE_OF_KIND: Readonly<Record<string, PictureSurface>> = {
  'image-post': 'post',
  'profile-photo': 'profile_photo',
  'group-photo': 'group_photo',
  'letter-drawing': 'letter',
};

export function surfaceOfKind(kind: string | null | undefined): PictureSurface {
  return (kind && SURFACE_OF_KIND[kind]) || 'post';
}
