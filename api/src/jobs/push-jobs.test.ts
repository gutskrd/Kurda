import { describe, expect, it, vi } from 'vitest';
import { makePushSendJob, type PushSendPayload } from './push-jobs.js';
import type { PushService } from '../push/service.js';

/**
 * The push job's part in a push that quiet hours hold back: it is queued
 * again for when they end, once, and when it comes back it goes only if what
 * it tells of is still waiting.
 */

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const letter: PushSendPayload = {
  userId: 'u1',
  notification: { category: 'letters', title: 'A bird came to your window', body: 'Baran wrote you a letter.', data: { kind: 'letter', letterId: 'l1' } },
  recorded: true,
};

function serviceWith(report: Awaited<ReturnType<PushService['deliver']>>) {
  const deliver = vi.fn(async () => report);
  return { service: { deliver } as unknown as PushService, deliver };
}

describe('the push job and quiet hours', () => {
  it('queues a held push again for when quiet hours end, under a key that names it', async () => {
    const morning = new Date(Date.now() + 3 * 3_600_000);
    const { service } = serviceWith({ sent: 0, pruned: 0, suppressed: true, heldUntil: morning });
    const later = vi.fn(async () => undefined);
    const job = makePushSendJob(service, undefined, { later });
    await job.handler(letter, { log } as never);
    expect(later).toHaveBeenCalledTimes(1);
    const [payload, delay, key] = later.mock.calls[0] as unknown as [PushSendPayload, number, string];
    expect(payload).toMatchObject({ held: true, recorded: true, userId: 'u1' });
    expect(delay).toBeGreaterThan(2.9 * 3_600_000);
    expect(key).toBe(`push-held-u1-l1-${morning.getTime()}`);
  });

  it('sends a held push when it comes back only while the letter still waits', async () => {
    const { service, deliver } = serviceWith({ sent: 1, pruned: 0 });
    const stillNews = vi.fn(async () => false);
    const job = makePushSendJob(service, undefined, { stillNews });
    await job.handler({ ...letter, held: true }, { log } as never);
    expect(deliver).not.toHaveBeenCalled();
    stillNews.mockResolvedValueOnce(true);
    await job.handler({ ...letter, held: true }, { log } as never);
    expect(deliver).toHaveBeenCalledTimes(1);
    // a push sent the first time is never asked
    await job.handler(letter, { log } as never);
    expect(stillNews).toHaveBeenCalledTimes(2);
  });
});
