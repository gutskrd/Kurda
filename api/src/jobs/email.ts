import { z } from 'zod';
import { defineJob } from './registry.js';

/**
 * Email send job — stub until the real provider integration (KUR-098,
 * #98). Exists now so the queue pipeline (KUR-007) has a real, typed
 * consumer and later issues (verification #17, reset #18) can enqueue
 * against a stable contract.
 */
export const sendEmailJob = defineJob({
  name: 'send-email',
  schema: z.object({
    to: z.email(),
    template: z.enum([
      'verify-email',
      'password-reset',
      'password-changed',
      'oauth-no-password',
      'deletion-notice',
    ]),
    vars: z.record(z.string(), z.string()).default({}),
  }),
  handler: async (payload, ctx) => {
    ctx.log.info(
      { to: payload.to, template: payload.template, attempt: ctx.attempt },
      'email sent (stub — real provider lands in KUR-098)',
    );
  },
});
