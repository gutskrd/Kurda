import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_POLICIES,
  evaluateImageForSurface,
  evaluateImageScan,
  onScannerError,
  type ImageScanResult,
} from './image-scan.js';

const feed = DEFAULT_IMAGE_POLICIES.feed;
const clean = (over: Partial<ImageScanResult> = {}): ImageScanResult => ({
  nsfwScore: 0,
  violenceScore: 0,
  csamMatch: false,
  ...over,
});

describe('evaluateImageScan — NSFW/violence thresholds', () => {
  it('allows a clean image and queues nothing', () => {
    expect(evaluateImageScan(clean(), feed)).toMatchObject({
      action: 'allow',
      queueForReview: false,
      withheld: false,
      blocked: false,
    });
  });

  it('flags a borderline image (publish + queue, still served)', () => {
    const v = evaluateImageScan(clean({ nsfwScore: feed.flag }), feed);
    expect(v.action).toBe('flag');
    expect(v.queueForReview).toBe(true);
    expect(v.withheld).toBe(false);
    expect(v.reasons).toContain('nsfw');
  });

  it('gates (blur/hold, not served) a high-NSFW image', () => {
    const v = evaluateImageScan(clean({ nsfwScore: feed.gate }), feed);
    expect(v.action).toBe('gate');
    expect(v.withheld).toBe(true);
    expect(v.blocked).toBe(false);
  });

  it('auto-blocks a very-high-NSFW image', () => {
    const v = evaluateImageScan(clean({ nsfwScore: feed.block }), feed);
    expect(v.action).toBe('auto_block');
    expect(v.blocked).toBe(true);
    expect(v.withheld).toBe(true);
  });

  it('reacts to the violence score too', () => {
    expect(evaluateImageScan(clean({ violenceScore: feed.gate }), feed).reasons).toContain(
      'violence',
    );
  });

  it('takes the most severe of NSFW and violence, listing all reasons at that level', () => {
    const v = evaluateImageScan(clean({ nsfwScore: feed.block, violenceScore: feed.block }), feed);
    expect(v.action).toBe('auto_block');
    expect(v.reasons.sort()).toEqual(['nsfw', 'violence']);
  });
});

describe('evaluateImageScan — CSAM override', () => {
  it('hard-blocks a CSAM hash match and preserves evidence, overriding scores', () => {
    const v = evaluateImageScan(clean({ csamMatch: true, nsfwScore: 0, violenceScore: 0 }), feed);
    expect(v).toMatchObject({
      action: 'hard_block',
      reasons: ['csam'],
      blocked: true,
      withheld: true,
      preserveEvidence: true,
      queueForReview: true,
    });
  });

  it('never soft-deletes — a CSAM match is always hard_block regardless of policy', () => {
    expect(evaluateImageScan(clean({ csamMatch: true }), DEFAULT_IMAGE_POLICIES.profile).action).toBe(
      'hard_block',
    );
  });
});

describe('per-surface strictness', () => {
  it('profiles/avatars are stricter than the feed', () => {
    expect(DEFAULT_IMAGE_POLICIES.profile.gate).toBeLessThan(DEFAULT_IMAGE_POLICIES.feed.gate);
  });

  it('a mid score gates on a profile but only flags on the feed', () => {
    const score = 0.65; // above profile.gate (0.6), between feed.flag (0.6) and feed.gate (0.8)
    expect(evaluateImageForSurface({ nsfwScore: score, violenceScore: 0, csamMatch: false }, 'profile').action).toBe('gate');
    expect(evaluateImageForSurface({ nsfwScore: score, violenceScore: 0, csamMatch: false }, 'feed').action).toBe('flag');
  });
});

describe('onScannerError', () => {
  it('fails closed — holds the upload (gate), never serves unscanned', () => {
    expect(onScannerError()).toMatchObject({
      action: 'gate',
      withheld: true,
      blocked: false,
      queueForReview: true,
    });
  });
});
