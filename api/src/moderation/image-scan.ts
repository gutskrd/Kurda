/**
 * Automatic image-scan verdict mapping (KUR-294). Pure and deterministic: given
 * an automated image scan (NSFW / violence scores + a known-illegal-content
 * hash match), decide what happens to the upload — allow / flag / gate / block,
 * or a hard-block-with-evidence-preservation for a CSAM hash match. The scanner
 * itself (a cloud vision API or self-hosted model + a hashing service) is
 * injected behind a provider-agnostic seam; this module has no I/O so every
 * threshold branch is unit-testable.
 *
 * Baseline safety default: an image is never publicly served until it clears
 * this verdict (the upload pipeline #013 holds it), and a CSAM match is always
 * hard-blocked with evidence preserved — never a soft-delete.
 */

export interface ImageScanResult {
  /** adult/sexual content confidence in [0,1] */
  nsfwScore: number;
  /** violence/gore confidence in [0,1] */
  violenceScore: number;
  /** matched a known-illegal-content (CSAM) hash database */
  csamMatch: boolean;
}

export interface ImageScanPolicy {
  /** publish but enqueue for review */
  flag: number;
  /** blur/hold pending review (not served normally) */
  gate: number;
  /** reject on upload */
  block: number;
}

/**
 * `allow`      — publish.
 * `flag`       — publish but enqueue for review (#102).
 * `gate`       — blur/hold pending review (not publicly served).
 * `auto_block` — reject the upload (logged, appealable).
 * `hard_block` — CSAM: reject + preserve evidence + reporting path. Never soft-delete.
 */
export type ImageAction = 'allow' | 'flag' | 'gate' | 'auto_block' | 'hard_block';

const SEVERITY: Record<ImageAction, number> = {
  allow: 0,
  flag: 1,
  gate: 2,
  auto_block: 3,
  hard_block: 4,
};

export type ImageSurface = 'feed' | 'profile';

/** Default thresholds. Profiles/avatars are stricter than the meme feed. Tunable. */
export const DEFAULT_IMAGE_POLICIES: Record<ImageSurface, ImageScanPolicy> = {
  feed: { flag: 0.6, gate: 0.8, block: 0.95 },
  profile: { flag: 0.4, gate: 0.6, block: 0.85 },
};

function scoreAction(score: number, policy: ImageScanPolicy): ImageAction {
  if (score >= policy.block) return 'auto_block';
  if (score >= policy.gate) return 'gate';
  if (score >= policy.flag) return 'flag';
  return 'allow';
}

export type ImageReason = 'csam' | 'nsfw' | 'violence';

export interface ImageVerdict {
  action: ImageAction;
  reasons: ImageReason[];
  /** enters the moderation queue (#102) — flag or worse */
  queueForReview: boolean;
  /** not publicly served (gate or any block) */
  withheld: boolean;
  /** rejected on upload (any block) */
  blocked: boolean;
  /** CSAM: retain evidence + trigger the mandated reporting path */
  preserveEvidence: boolean;
}

/**
 * Map a scan result to a verdict. A CSAM hash match overrides everything with a
 * hard block + evidence preservation. Otherwise the NSFW and violence scores
 * are each mapped to an action and the most severe wins, with every category at
 * that severity listed as a reason.
 */
export function evaluateImageScan(result: ImageScanResult, policy: ImageScanPolicy): ImageVerdict {
  if (result.csamMatch) {
    return {
      action: 'hard_block',
      reasons: ['csam'],
      queueForReview: true,
      withheld: true,
      blocked: true,
      preserveEvidence: true,
    };
  }

  const nsfw = scoreAction(result.nsfwScore, policy);
  const violence = scoreAction(result.violenceScore, policy);
  const action = SEVERITY[nsfw] >= SEVERITY[violence] ? nsfw : violence;

  const reasons: ImageReason[] = [];
  if (action !== 'allow') {
    if (nsfw === action) reasons.push('nsfw');
    if (violence === action) reasons.push('violence');
  }

  return {
    action,
    reasons,
    queueForReview: SEVERITY[action] >= SEVERITY.flag,
    withheld: SEVERITY[action] >= SEVERITY.gate,
    blocked: action === 'auto_block',
    preserveEvidence: false,
  };
}

export function evaluateImageForSurface(
  result: ImageScanResult,
  surface: ImageSurface,
): ImageVerdict {
  return evaluateImageScan(result, DEFAULT_IMAGE_POLICIES[surface]);
}

/**
 * When the scanner is unavailable, fail closed for images: **hold** the upload
 * (gate) rather than serve it unscanned. There is no fail-open for image
 * uploads — an unscanned image must never be publicly served.
 */
export function onScannerError(): ImageVerdict {
  return {
    action: 'gate',
    reasons: [],
    queueForReview: true,
    withheld: true,
    blocked: false,
    preserveEvidence: false,
  };
}
