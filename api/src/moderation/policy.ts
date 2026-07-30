/**
 * AI-assisted moderation policy engine (KUR-293). Pure and deterministic: given
 * per-category confidence scores from a text classifier, map them to an action
 * — allow / flag / auto-hide / auto-block — using per-surface thresholds. This
 * is the decision layer that sits *after* the fast wordlist filter (#086) and
 * feeds the moderation queue (#102); the classifier itself (a hosted API or a
 * self-hosted model) is injected elsewhere behind a provider-agnostic seam.
 * No I/O here, so every threshold branch is unit-testable.
 */

export type ModerationCategory =
  | 'toxicity'
  | 'hate'
  | 'harassment'
  | 'sexual'
  | 'self_harm'
  | 'spam';

export const MODERATION_CATEGORIES: readonly ModerationCategory[] = [
  'toxicity',
  'hate',
  'harassment',
  'sexual',
  'self_harm',
  'spam',
];

/** Per-category confidence in [0,1]; absent categories are treated as 0. */
export type CategoryScores = Partial<Record<ModerationCategory, number>>;

/** Where the content lives — thresholds differ (a profile is stricter than chat). */
export type Surface = 'chat' | 'library' | 'caption' | 'profile';

/**
 * `allow` — publish untouched.
 * `flag` — publish but enqueue for human review (#102).
 * `auto_hide` — hide pending review (also enqueued).
 * `auto_block` — reject on write (still logged + appealable).
 */
export type ModerationAction = 'allow' | 'flag' | 'auto_hide' | 'auto_block';

const SEVERITY: Record<ModerationAction, number> = {
  allow: 0,
  flag: 1,
  auto_hide: 2,
  auto_block: 3,
};

export interface SurfacePolicy {
  flag: number;
  autoHide: number;
  autoBlock: number;
  /** high-harm categories get a stricter (lower) block threshold */
  severeCategories: readonly ModerationCategory[];
  severeBlock: number;
}

const SEVERE = ['hate', 'sexual', 'self_harm'] as const;

/** Default per-surface thresholds. Tunable / config-overridable. */
export const DEFAULT_POLICIES: Record<Surface, SurfacePolicy> = {
  chat: { flag: 0.6, autoHide: 0.8, autoBlock: 0.95, severeCategories: SEVERE, severeBlock: 0.85 },
  library: { flag: 0.7, autoHide: 0.85, autoBlock: 0.97, severeCategories: SEVERE, severeBlock: 0.9 },
  caption: { flag: 0.6, autoHide: 0.8, autoBlock: 0.95, severeCategories: SEVERE, severeBlock: 0.85 },
  profile: { flag: 0.5, autoHide: 0.75, autoBlock: 0.9, severeCategories: SEVERE, severeBlock: 0.8 },
};

/** The action a single category's score would trigger under a policy. */
function categoryAction(
  category: ModerationCategory,
  score: number,
  policy: SurfacePolicy,
): ModerationAction {
  const blockAt = policy.severeCategories.includes(category) ? policy.severeBlock : policy.autoBlock;
  if (score >= blockAt) return 'auto_block';
  if (score >= policy.autoHide) return 'auto_hide';
  if (score >= policy.flag) return 'flag';
  return 'allow';
}

export interface PolicyResult {
  action: ModerationAction;
  /** the category that drove the decision (null when everything is allowed) */
  topCategory: ModerationCategory | null;
  topScore: number;
  /** enters the moderation queue (#102) — flag or worse */
  queueForReview: boolean;
  /** rejected on write */
  blocked: boolean;
}

/**
 * Evaluate classifier scores against a surface policy. The overall action is
 * the most severe any category triggers; the driving category is the one that
 * produced it (ties broken by higher score). Anything above `allow` enters the
 * review queue; `auto_block` also marks the content blocked.
 */
export function evaluatePolicy(scores: CategoryScores, policy: SurfacePolicy): PolicyResult {
  let action: ModerationAction = 'allow';
  let topCategory: ModerationCategory | null = null;
  let topScore = 0;

  for (const category of MODERATION_CATEGORIES) {
    const score = scores[category] ?? 0;
    const candidate = categoryAction(category, score, policy);
    const moreSevere = SEVERITY[candidate] > SEVERITY[action];
    const tieHigherScore = SEVERITY[candidate] === SEVERITY[action] && candidate !== 'allow' && score > topScore;
    if (moreSevere || tieHigherScore) {
      action = candidate;
      topCategory = category;
      topScore = score;
    }
  }

  return {
    action,
    topCategory,
    topScore,
    queueForReview: SEVERITY[action] >= SEVERITY.flag,
    blocked: action === 'auto_block',
  };
}

/** Convenience: evaluate against the default policy for a surface. */
export function evaluateForSurface(scores: CategoryScores, surface: Surface): PolicyResult {
  return evaluatePolicy(scores, DEFAULT_POLICIES[surface]);
}

/**
 * The action to take when the classifier is unavailable. High-risk surfaces
 * fail closed (hide pending review) rather than publish unscreened content;
 * low-risk surfaces may fail open (publish, rely on reports + the wordlist).
 */
export function onClassifierError(failClosed: boolean): PolicyResult {
  const action: ModerationAction = failClosed ? 'auto_hide' : 'allow';
  return {
    action,
    topCategory: null,
    topScore: 0,
    queueForReview: SEVERITY[action] >= SEVERITY.flag,
    blocked: false,
  };
}
