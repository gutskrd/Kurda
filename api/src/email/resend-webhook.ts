import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { EmailService } from './service.js';
import type { SupportInbox } from './support-inbox.js';

/** How far a webhook's timestamp may be from now before it is taken for a replay. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Whether a webhook really comes from Resend: an HMAC-SHA256 keyed with the base64 secret after `whsec_`, over
 * `<id>.<timestamp>.<raw body>`, sent base64 in `svix-signature` as space-separated `v1,<sig>` entries (several
 * while a secret is rotated). The body must be the bytes as received, not re-serialised JSON.
 */
export function verifyResendSignature(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** A received mail as the webhook announces it: who, to whom, what about — never the body. */
const receivedData = z.object({
  email_id: z.string().min(1).max(200),
  from: z.string().max(500),
  to: z.array(z.string().max(500)).max(50).default([]),
  cc: z.array(z.string().max(500)).max(50).optional(),
  subject: z.string().max(2000).optional(),
  message_id: z.string().max(1000).optional(),
  created_at: z.string().optional(),
  attachments: z
    .array(
      z.object({
        id: z.string().max(200).optional(),
        filename: z.string().max(500).optional(),
        content_type: z.string().max(200).optional(),
        size: z.number().optional(),
      }),
    )
    .max(100)
    .optional(),
});

/** A bounce or complaint: the addresses a message to which went wrong. */
const deliveryData = z.object({ to: z.array(z.string().max(500)).max(50).default([]) });

const event = z.object({ type: z.string().max(100), created_at: z.string().optional(), data: z.unknown() });

/**
 * Resend's webhook: mail received at the support address goes to the support inbox, and a bounce or complaint
 * suppresses the address. Fails closed: 503 while no secret is set, 401 for a bad signature. Any other signed event
 * gets 200, unused ones included, since anything else would be retried.
 */
export function registerResendWebhookRoutes(
  app: FastifyInstance,
  deps: { secret: string | undefined; email: EmailService; inbox: SupportInbox },
): void {
  // the signature is over the bytes as sent, so this one route reads its body raw
  void app.register(async (scope) => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 512 * 1024 }, (_req, body, done) =>
      done(null, body),
    );

    scope.post('/webhooks/resend', { config: { skipValidation: true } }, async (req, reply) => {
      if (!deps.secret) return reply.code(503).send({ error: { code: 'NOT_CONFIGURED', message: 'resend webhook disabled' } });
      const raw = typeof req.body === 'string' ? req.body : '';
      const header = (name: string): string | undefined => {
        const value = req.headers[name];
        return typeof value === 'string' ? value : undefined;
      };
      const signed = verifyResendSignature(
        deps.secret,
        { id: header('svix-id'), timestamp: header('svix-timestamp'), signature: header('svix-signature') },
        raw,
      );
      if (!signed) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'bad signature' } });

      let parsed: z.infer<typeof event>;
      try {
        parsed = event.parse(JSON.parse(raw));
      } catch {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'not a webhook event' } });
      }

      if (parsed.type === 'email.received') {
        const data = receivedData.safeParse(parsed.data);
        if (!data.success) return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'not a received email' } });
        const d = data.data;
        const id = await deps.inbox.record({
          providerId: d.email_id,
          from: d.from,
          to: d.to,
          cc: d.cc ?? [],
          subject: d.subject ?? '',
          messageId: d.message_id ?? null,
          attachments: (d.attachments ?? []).map((a) => ({
            id: a.id ?? null,
            filename: a.filename ?? null,
            contentType: a.content_type ?? null,
            size: a.size ?? null,
          })),
          receivedAt: d.created_at ?? parsed.created_at ?? new Date().toISOString(),
        });
        // Fetch the body now; if that fails it is read when an admin opens the mail.
        if (id) await deps.inbox.fetchBody(id).catch((err) => req.log.warn({ err }, 'support email body not fetched'));
      } else if (parsed.type === 'email.bounced' || parsed.type === 'email.complained') {
        const data = deliveryData.safeParse(parsed.data);
        if (data.success) {
          for (const address of data.data.to) {
            await deps.email.suppress(address, parsed.type === 'email.bounced' ? 'bounce' : 'complaint');
          }
        }
      }
      return { ok: true };
    });
  });
}
