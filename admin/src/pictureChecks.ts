/**
 * Picture checks as data: names for where a picture is shown, why it waits, how it was checked and what the check
 * found, the rule a removal starts from, and the list's addresses, kept apart from the page so they test without a
 * browser.
 */
import {
  PICTURE_CASE_VIEWS,
  PICTURE_SCAN_CATEGORIES,
  PICTURE_SCAN_LEVELS,
  type PictureCaseItem,
  type PictureCaseOrigin,
  type PictureCaseView,
  type PictureScanCategory,
  type PictureScanLevel,
  type PictureSurface,
  type ReportCategory,
} from '@kurda/shared';

export const PICTURES_PAGE = 'picture-checks';

export const VIEW_NAME: Readonly<Record<PictureCaseView, string>> = {
  waiting: 'Waiting',
  asked: 'Asked',
  reported: 'Reported',
  decided: 'Decided',
};

/** The tab an address asks for; anything else is the waiting list. */
export function viewFrom(query: URLSearchParams): PictureCaseView {
  const raw = query.get('view');
  return (PICTURE_CASE_VIEWS as readonly string[]).includes(raw ?? '') ? (raw as PictureCaseView) : 'waiting';
}

export function viewHref(view: PictureCaseView): string {
  return view === 'waiting' ? `#/${PICTURES_PAGE}` : `#/${PICTURES_PAGE}?view=${view}`;
}

export function picturesPath(view: PictureCaseView, cursor?: string | null): string {
  return `/admin/pictures?view=${view}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
}

export function decidePath(caseId: string): string {
  return `/admin/pictures/${encodeURIComponent(caseId)}/decide`;
}

export const SURFACE_NAME: Readonly<Record<PictureSurface, string>> = {
  post: 'Post',
  profile_photo: 'Profile photo',
  group_photo: 'Group photo',
  letter: 'Letter drawing',
};

export const ORIGIN_NAME: Readonly<Record<PictureCaseOrigin, string>> = {
  held: 'Held at upload',
  asked: 'Owner asked for a look',
  reported: 'Reported',
  child_safety: 'Child safety',
};

export const CHECKED_BY_TEXT: Readonly<Record<PictureCaseItem['checkedBy'], string>> = {
  auto: 'Checked automatically',
  people_only: 'Held for people to check',
  checker_unavailable: 'Checker unavailable, held for people',
};

const CATEGORY_NAME: Readonly<Record<PictureScanCategory, string>> = {
  sexual: 'Nudity',
  suggestive: 'Suggestive',
  minor_safety: 'Child safety',
  violence: 'Violence or gore',
  self_harm: 'Self-harm',
  hate: 'Hate symbols',
  drugs: 'Drugs',
  shocking: 'Shocking',
};

const rank = (level: PictureScanLevel | undefined): number => (level ? PICTURE_SCAN_LEVELS.indexOf(level) : 0);

export interface Finding {
  category: PictureScanCategory;
  level: PictureScanLevel;
  /** "Nudity — likely" */
  text: string;
}

/** What the check found at possible or above, surest first; an empty list when it found nothing or did not run. */
export function findings(levels: PictureCaseItem['levels']): Finding[] {
  if (!levels) return [];
  return PICTURE_SCAN_CATEGORIES.filter((c) => rank(levels[c]) >= rank('possible'))
    .map((c) => ({ category: c, level: levels[c]!, text: `${CATEGORY_NAME[c]} — ${levels[c]}` }))
    .sort((a, b) => rank(b.level) - rank(a.level));
}

/** The rule a finding falls under; what has no rule of its own starts at "something else". */
const RULE_OF: Readonly<Record<PictureScanCategory, ReportCategory>> = {
  sexual: 'sexual',
  suggestive: 'sexual',
  minor_safety: 'child_safety',
  violence: 'violence',
  self_harm: 'self_harm',
  hate: 'hate',
  drugs: 'other',
  shocking: 'violence',
};

/**
 * The rule a removal starts on: the one reporters chose most for a reported picture, else the surest finding's, never
 * child safety, which is decided on its case.
 */
export function defaultRule(item: Pick<PictureCaseItem, 'levels' | 'reportCategory'>): ReportCategory {
  if (item.reportCategory && item.reportCategory !== 'child_safety') return item.reportCategory;
  const rule = findings(item.levels).map((f) => RULE_OF[f.category]).find((r) => r !== 'child_safety');
  return rule ?? 'other';
}

/** What the removal rule was picked from, for the hint under it; null when nothing suggested one. */
export function ruleSource(item: Pick<PictureCaseItem, 'levels' | 'reportCategory'>): 'reports' | 'check' | null {
  if (item.reportCategory && item.reportCategory !== 'child_safety') return 'reports';
  return findings(item.levels).some((f) => RULE_OF[f.category] !== 'child_safety') ? 'check' : null;
}

/** Whether a picture can be decided on this page: still open, and not a child-safety hit. */
export function decidable(item: PictureCaseItem): boolean {
  return !item.decided && !item.sensitive && ['open', 'in_review'].includes(item.status);
}

/** A post's words cut to a line or two, at a word where one is near. */
export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** What the moderator is told once a decision is in, by why the picture was waiting. */
export function decidedText(origin: PictureCaseOrigin, decision: 'approve' | 'remove'): string {
  if (decision === 'remove') return 'Removed. The owner is told which rule it breaks and how to appeal.';
  if (origin === 'asked') return 'Approved. The owner is told they can share it.';
  if (origin === 'reported') return 'Approved. The picture stays up.';
  return 'Approved. It is public now, and the owner is told.';
}
