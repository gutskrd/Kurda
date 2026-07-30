import { describe, expect, it } from 'vitest';
import { HeuristicSpamClassifier, classifyForSurface } from './classifier.js';

describe('HeuristicSpamClassifier', () => {
  const c = new HeuristicSpamClassifier();

  it('scores benign text as clean', async () => {
    const { scores } = await c.classify('hello, how are you doing today?');
    expect(scores.spam ?? 0).toBeLessThan(0.3);
  });

  it('flags link-spam and scam keywords high', async () => {
    const { scores, modelVersion } = await c.classify(
      'FREE MONEY click here http://a.com http://b.io buy followers now',
    );
    expect(scores.spam ?? 0).toBeGreaterThanOrEqual(0.9);
    expect(modelVersion).toBe('heuristic-spam-v1');
  });

  it('flags character flooding', async () => {
    const { scores } = await c.classify('wooooooooooow amazing!!!!!!!!!!');
    expect(scores.spam ?? 0).toBeGreaterThanOrEqual(0.6);
  });

  it('maps a high spam score to auto_block on chat, allow when benign', async () => {
    const spam = await classifyForSurface(c, 'crypto giveaway click here http://x.io http://y.io http://z.io', 'chat', false);
    expect(spam.result.action).toBe('auto_block');
    expect(spam.result.topCategory).toBe('spam');

    const ok = await classifyForSurface(c, 'see you tomorrow', 'chat', false);
    expect(ok.result.action).toBe('allow');
  });

  it('fails open or closed on classifier error per config', async () => {
    const throwing = { classify: async () => { throw new Error('provider down'); } };
    const open = await classifyForSurface(throwing, 'x', 'chat', false);
    expect(open.result.action).toBe('allow');
    const closed = await classifyForSurface(throwing, 'x', 'profile', true);
    expect(closed.result.action).toBe('auto_hide');
  });
});
