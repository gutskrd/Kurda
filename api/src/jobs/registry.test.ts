import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineJob, JobRegistry } from './registry.js';
import { sendEmailJob } from './email.js';

describe('JobRegistry', () => {
  it('registers and retrieves job definitions', () => {
    const registry = new JobRegistry();
    registry.register(sendEmailJob);
    expect(registry.get('send-email')?.name).toBe('send-email');
    expect(registry.names()).toEqual(['send-email']);
  });

  it('rejects duplicate job names', () => {
    const registry = new JobRegistry();
    registry.register(sendEmailJob);
    expect(() => registry.register(sendEmailJob)).toThrow(/already registered/);
  });
});

describe('sendEmailJob schema', () => {
  it('accepts a valid payload', () => {
    const parsed = sendEmailJob.schema.safeParse({
      to: 'rojda@example.com',
      template: 'verify-email',
      vars: { token: 'abc' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects bad emails and unknown templates', () => {
    expect(sendEmailJob.schema.safeParse({ to: 'nope', template: 'verify-email' }).success).toBe(false);
    expect(
      sendEmailJob.schema.safeParse({ to: 'a@b.co', template: 'spam-everyone' }).success,
    ).toBe(false);
  });
});

describe('defineJob typing', () => {
  it('preserves payload types through the definition', async () => {
    const job = defineJob({
      name: 'typed',
      schema: z.object({ n: z.number() }),
      handler: async (payload) => {
        // compile-time check: payload.n is number
        void payload.n.toFixed(0);
      },
    });
    expect(job.name).toBe('typed');
  });
});
