import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICIES,
  evaluateForSurface,
  evaluatePolicy,
  onClassifierError,
  type CategoryScores,
} from './policy.js';

const chat = DEFAULT_POLICIES.chat;

describe('evaluatePolicy — thresholds', () => {
  it('allows clean content and queues nothing', () => {
    const r = evaluatePolicy({ toxicity: 0.1, spam: 0.2 }, chat);
    expect(r).toMatchObject({ action: 'allow', topCategory: null, queueForReview: false, blocked: false });
  });

  it('flags borderline content (publish + queue)', () => {
    const r = evaluatePolicy({ toxicity: chat.flag }, chat);
    expect(r.action).toBe('flag');
    expect(r.queueForReview).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.topCategory).toBe('toxicity');
  });

  it('auto-hides high-confidence content', () => {
    expect(evaluatePolicy({ toxicity: chat.autoHide }, chat).action).toBe('auto_hide');
  });

  it('auto-blocks very-high-confidence content', () => {
    const r = evaluatePolicy({ toxicity: chat.autoBlock }, chat);
    expect(r.action).toBe('auto_block');
    expect(r.blocked).toBe(true);
    expect(r.queueForReview).toBe(true); // block is still reviewable/appealable
  });
});

describe('evaluatePolicy — severe categories', () => {
  it('blocks a severe category at a lower threshold than a mild one', () => {
    // a hate score that would only auto-hide as "toxicity" auto-blocks as "hate"
    const score = chat.severeBlock;
    expect(evaluatePolicy({ hate: score }, chat).action).toBe('auto_block');
    expect(evaluatePolicy({ toxicity: score }, chat).action).not.toBe('auto_block');
  });

  it('treats sexual and self_harm as severe too', () => {
    expect(evaluatePolicy({ sexual: chat.severeBlock }, chat).action).toBe('auto_block');
    expect(evaluatePolicy({ self_harm: chat.severeBlock }, chat).action).toBe('auto_block');
  });
});

describe('evaluatePolicy — most severe wins', () => {
  it('takes the most severe action across categories', () => {
    const scores: CategoryScores = { spam: chat.flag, hate: chat.severeBlock };
    const r = evaluatePolicy(scores, chat);
    expect(r.action).toBe('auto_block');
    expect(r.topCategory).toBe('hate');
  });

  it('breaks ties within an action by the higher score', () => {
    // both flag-level; harassment higher → it drives the decision
    const scores: CategoryScores = { toxicity: chat.flag + 0.01, harassment: chat.flag + 0.05 };
    const r = evaluatePolicy(scores, chat);
    expect(r.action).toBe('flag');
    expect(r.topCategory).toBe('harassment');
  });
});

describe('per-surface differences', () => {
  it('is stricter on profiles than on library posts', () => {
    expect(DEFAULT_POLICIES.profile.flag).toBeLessThan(DEFAULT_POLICIES.library.flag);
  });

  it('a mid score can flag on a profile but pass on the library', () => {
    const score = 0.55; // above profile.flag (0.5), below library.flag (0.7)
    expect(evaluateForSurface({ toxicity: score }, 'profile').action).toBe('flag');
    expect(evaluateForSurface({ toxicity: score }, 'library').action).toBe('allow');
  });
});

describe('onClassifierError', () => {
  it('fails open on low-risk surfaces (allow)', () => {
    expect(onClassifierError(false)).toMatchObject({ action: 'allow', queueForReview: false });
  });

  it('fails closed on high-risk surfaces (hide + queue)', () => {
    expect(onClassifierError(true)).toMatchObject({ action: 'auto_hide', queueForReview: true });
  });
});
