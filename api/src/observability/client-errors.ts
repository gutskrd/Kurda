import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  APP_PLATFORMS,
  CLIENT_ERROR_BODY_MAX,
  CLIENT_ERROR_KINDS,
  CLIENT_ERROR_LIMITS as LIMIT,
  CLIENT_ERROR_TOKEN,
  scrubClientErrorStack,
  scrubClientErrorText,
  type ClientErrorBatch,
} from '@kurda/shared';

/**
 * Crash reports from the apps (shapes and limits in `@kurda/shared`
 * client-errors.ts), written to the server's log.
 *
 * Until now a crash on a phone was seen only by the person holding it. The app
 * now posts a small report when a screen fails to render or an error reaches
 * nothing that handles it, and this writes each one down as a warning line,
 * `client error reported`, with the report under `clientError`, so it can be
 * found in the log next to the requests around it.
 *
 * The log and not a table: a report is read when something is being fixed and
 * is of no use after, and the log already ages out on its own schedule. No
 * migration, nothing to prune, nothing to export with an account.
 *
 * Open without signing in, because an app can crash before anyone has. The
 * line is written with the server's own logger rather than the request's, so
 * it never carries an account id even if a caller sends a token, and the text
 * is cleaned again here (the phone cleans it too) so the log never depends on
 * the phone having done so. What keeps it from being a free notepad on the
 * internet is the limit on each field, on the body, and per network.
 */

/**
 * Batches one network may send in ten minutes. An app sends one batch at a
 * time, seconds apart and a few per launch at most, so ten is room for several
 * phones behind one address and nothing like room for a flood.
 */
export const CLIENT_ERROR_RATE_LIMIT = { max: 10, windowMs: 10 * 60_000, per: 'ip' as const };

const token = (max: number) => z.string().min(1).max(max).regex(CLIENT_ERROR_TOKEN);

const report = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  fatal: z.boolean(),
  name: z.string().max(LIMIT.name).optional(),
  message: z.string().max(LIMIT.message),
  stack: z.string().max(LIMIT.stack).optional(),
  componentStack: z.string().max(LIMIT.componentStack).optional(),
  screen: token(LIMIT.screen).optional(),
  count: z.number().int().min(1).max(LIMIT.count),
});

const batchBody = z.object({
  platform: z.enum(APP_PLATFORMS),
  appVersion: token(LIMIT.appVersion),
  buildNumber: token(LIMIT.buildNumber).optional(),
  osVersion: token(LIMIT.osVersion).optional(),
  reports: z.array(report).min(1).max(LIMIT.reports),
});

export function registerClientErrorRoutes(app: FastifyInstance): void {
  app.post(
    '/client-errors',
    { schema: { body: batchBody }, bodyLimit: CLIENT_ERROR_BODY_MAX, config: { rateLimit: CLIENT_ERROR_RATE_LIMIT } },
    async (req, reply) => {
      const batch = req.body as ClientErrorBatch;
      for (const r of batch.reports) {
        app.log.warn(
          {
            reqId: req.id,
            clientError: {
              platform: batch.platform,
              appVersion: batch.appVersion,
              buildNumber: batch.buildNumber,
              osVersion: batch.osVersion,
              kind: r.kind,
              fatal: r.fatal,
              screen: r.screen,
              count: r.count,
              name: r.name === undefined ? undefined : scrubClientErrorText(r.name, LIMIT.name),
              message: scrubClientErrorText(r.message, LIMIT.message),
              stack: r.stack === undefined ? undefined : scrubClientErrorStack(r.stack, LIMIT.stack),
              componentStack: r.componentStack === undefined ? undefined : scrubClientErrorStack(r.componentStack, LIMIT.componentStack),
            },
          },
          'client error reported',
        );
      }
      return reply.code(202).send({ accepted: batch.reports.length });
    },
  );
}
