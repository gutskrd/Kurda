import { describe, expect, it } from 'vitest';
import pino from 'pino';
import type pg from 'pg';
import { EmailService } from '../email/service.js';
import { StubEmailProvider } from '../email/provider.js';
import { makeSendEmailJob, SEND_EMAIL_JOB_NAME } from './email.js';

/** A database with nobody on the suppression list. */
const nobodySuppressed = { query: async () => ({ rowCount: 0, rows: [] }) } as unknown as pg.Pool;

describe('the send-email job', () => {
  const log = pino({ level: 'silent' });
  const payload = { to: 'reader@example.com', template: 'verify-email-code' as const, vars: { code: '123456' } };

  it('sends under the job key, the same for every attempt of the job', async () => {
    const provider = new StubEmailProvider();
    const job = makeSendEmailJob(new EmailService(nobodySuppressed, provider));
    await job.handler(payload, { log, attempt: 1, key: '42@1793180000000' });
    await job.handler(payload, { log, attempt: 2, key: '42@1793180000000' });

    expect(provider.sent.map((m) => m.idempotencyKey)).toEqual([
      `${SEND_EMAIL_JOB_NAME}/42@1793180000000`,
      `${SEND_EMAIL_JOB_NAME}/42@1793180000000`,
    ]);
  });

  it('sends with no key when run outside the queue', async () => {
    const provider = new StubEmailProvider();
    await makeSendEmailJob(new EmailService(nobodySuppressed, provider)).handler(payload, { log, attempt: 1 });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).not.toHaveProperty('idempotencyKey');
  });
});
