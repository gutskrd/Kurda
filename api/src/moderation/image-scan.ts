/**
 * Image-scan verdicts, pure and deterministic: given NSFW and violence scores and a known-illegal-content hash match,
 * decide allow, flag, gate or block, or a hard block with evidence preservation for a CSAM match. The scanner is
 * injected behind a provider-agnostic seam.
 *
 * An image is never served publicly until it clears this verdict (the upload pipeline holds it), and a CSAM match is
 * always hard-blocked with evidence preserved.
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
 * `flag`       — publish but enqueue for review.
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
  /** enters the moderation queue — flag or worse */
  queueForReview: boolean;
  /** not publicly served (gate or any block) */
  withheld: boolean;
  /** rejected on upload (any block) */
  blocked: boolean;
  /** CSAM: retain evidence + trigger the mandated reporting path */
  preserveEvidence: boolean;
}

/**
 * Map a scan result to a verdict. A CSAM hash match overrides everything with a hard block and evidence preservation.
 * Otherwise NSFW and violence are each mapped to an action and the most severe wins, listing every category at that
 * severity as a reason.
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
 * When the scanner is unavailable, images fail closed: the upload is held (gate). An unscanned image must never be
 * served publicly.
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
