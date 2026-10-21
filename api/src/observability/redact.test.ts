import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { LOG_REDACT, maskEmail } from './redact.js';
import { makeSendEmailJob, sendEmailJob } from '../jobs/email.js';
import type { EmailService } from '../email/service.js';

/** A logger that writes its lines to an array, so a test can read what would be stored. */
function capture(redact?: typeof LOG_REDACT): { log: pino.Logger; lines: () => string } {
  const out: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      out.push(String(chunk));
      done();
    },
  });
  return { log: pino({ level: 'info', ...(redact ? { redact } : {}) }, stream), lines: () => out.join('') };
}

describe('log redaction', () => {
  it('redacts credentials and addresses logged at the top of the object, not only one level down', () => {
    const { log, lines } = capture(LOG_REDACT);
    log.info({ email: 'top@x.test', password: 'pw-top', token: 'tok-top', refreshToken: 'rt-top' }, 'top');
    log.info({ user: { email: 'nested@x.test', password: 'pw-nested' } }, 'nested');
    log.info({ req: { headers: { authorization: 'Bearer abc', cookie: 'c=1' } } }, 'headers');
    const text = lines();
    for (const secret of ['top@x.test', 'pw-top', 'tok-top', 'rt-top', 'nested@x.test', 'pw-nested', 'Bearer abc', 'c=1']) {
      expect(text, secret).not.toContain(secret);
    }
    expect(text).toContain('[redacted]');
  });

  it('redacts a password change and a second-factor secret too', () => {
    const { log, lines } = capture(LOG_REDACT);
    log.info({ body: { currentPassword: 'old-pw', newPassword: 'new-pw' }, secret: 'totp-secret' }, 'change');
    const out = lines();
    for (const secret of ['old-pw', 'new-pw', 'totp-secret']) expect(out).not.toContain(secret);
  });

  it('masks an address to its first letter and its domain', () => {
    expect(maskEmail('rojda@example.com')).toBe('r***@example.com');
    expect(maskEmail('a@b.test')).toBe('a***@b.test');
    expect(maskEmail('not-an-address')).toBe('***');
    expect(maskEmail('@nobody.test')).toBe('***');
  });
});

describe('the send-email job’s log lines', () => {
  const payload = { to: 'rojda@example.com', template: 'password-reset' as const, vars: { link: 'https://x/reset?token=t' } };

  it('name the recipient only masked, whatever logger the worker was given', async () => {
    const email = { send: async () => ({ sent: true, suppressed: false, messageId: 'm1' }) } as unknown as EmailService;
    const { log, lines } = capture(); // a logger with no redaction of its own
    await makeSendEmailJob(email).handler(payload, { log, attempt: 1 });
    await sendEmailJob.handler(payload, { log, attempt: 1 });
    expect(lines()).not.toContain('rojda@example.com');
    expect(lines()).toContain('r***@example.com');
    // nor the link, which carries the reset token
    expect(lines()).not.toContain('token=t');
  });
});
