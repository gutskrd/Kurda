import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WIDGET_HITS_PER_HOUR, WIDGET_IMAGE, WIDGET_SKIES, type WidgetSky } from '@kurda/shared';
import { requireAccount } from '../plugins/auth.js';
import { MemoryRateLimitStore, RedisRateLimitStore, type RateLimitStore } from '../ratelimit/store.js';
import { widgetImage, widgetImageEtag, widgetImageKey, widgetPixels } from './widget-image.js';
import type { LetterWidgetService, WidgetCaller } from './widget.js';

const side = z.coerce.number().int().min(WIDGET_IMAGE.minSide).max(WIDGET_IMAGE.maxSide);
const imageQuery = z.object({
  w: side,
  h: side,
  scale: z.coerce.number().min(1).max(WIDGET_IMAGE.maxScale).default(1),
  sky: z.enum(WIDGET_SKIES).optional(),
});
// Either may be left out to change only the other: the letter page pins, the settings switch shows the words.
const prefsBody = z.object({ pinnedLetterId: z.uuid().nullable().optional(), showWords: z.boolean().optional() });
// the token this phone had before, if any, goes when the new one is made
const tokenBody = z.object({ replaces: z.string().max(200).optional() }).nullish();

/** The hour a widget's budget runs over. */
const HOUR_MS = 3_600_000;
/** The address-wide limit on every route: high, since many phones may share a network, each with its own budget below. */
const BY_ADDRESS = { rateLimit: { max: 600, windowMs: 60_000, per: 'ip' as const } };

/**
 * The letter widget (letters/widget.ts):
 *
 *   POST   /letters/widget/tokens          (account) a token for this phone's widget, shown once, ending with this session
 *   DELETE /letters/widget/tokens          (account) every widget of the account, on every phone
 *   DELETE /letters/widget/tokens/current  (widget)  this widget's own token, when the app signs out
 *   GET    /letters/widget/prefs           (account) the pin, the words switch, the letter shown, how many phones
 *   PUT    /letters/widget/prefs           (account) pin or unpin a letter, show the words or not
 *   GET    /letters/widget/feed            (widget)  the letter to show, and when to ask again
 *   GET    /letters/widget/image?w&h&scale&sky  (widget)  its picture, without text
 *
 * "(widget)" routes take only `Authorization: Widget <token>`, which no other route accepts, so a token on a home
 * screen can read only the letter it shows. Each widget has `WIDGET_HITS_PER_HOUR` requests an hour across its routes.
 */
export function registerLetterWidgetRoutes(app: FastifyInstance, widget: LetterWidgetService, store?: RateLimitStore): void {
  const budget: RateLimitStore = store ?? (app.hasDecorator('redis') && app.redis ? new RedisRateLimitStore(app.redis) : new MemoryRateLimitStore());
  const callers = new WeakMap<FastifyRequest, WidgetCaller>();

  async function requireWidget(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
    // nothing a widget is answered is for a shared cache, refusals included
    reply.header('cache-control', 'private, no-store');
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? /^Widget ([^\s]+)$/.exec(header) : null;
    const caller = match ? await widget.authenticate(match[1]!) : null;
    if (!caller) return reply.code(401).send({ code: 'WIDGET_UNAUTHORIZED', message: 'this widget is signed out', requestId: req.id });
    const now = Date.now();
    try {
      const hit = await budget.hit(`ratelimit:letters-widget:${caller.tokenId}`, HOUR_MS, now);
      if (hit.count > WIDGET_HITS_PER_HOUR) {
        const retry = Math.max(1, Math.ceil((hit.oldestMs + HOUR_MS - now) / 1000));
        return reply.code(429).header('retry-after', String(retry)).send({ code: 'RATE_LIMITED', message: 'too many requests', requestId: req.id });
      }
    } catch (err) {
      // a limiter that cannot be reached must not take the widget down, as everywhere else
      req.log.warn({ err }, 'widget rate limit store failed; allowing request');
    }
    callers.set(req, caller);
  }
  const callerOf = (req: FastifyRequest): WidgetCaller => callers.get(req)!;

  app.post(
    '/letters/widget/tokens',
    { schema: { body: tokenBody }, config: { rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } }, preHandler: requireAccount },
    // made in this request's session, and ended with it
    async (req) => widget.createToken(req.user!.id, req.user!.familyId, (req.body as { replaces?: string } | null | undefined)?.replaces),
  );

  app.delete('/letters/widget/tokens', { preHandler: requireAccount }, async (req, reply) => {
    await widget.revokeAll(req.user!.id);
    return reply.code(204).send();
  });

  app.delete('/letters/widget/tokens/current', { config: BY_ADDRESS, preHandler: requireWidget }, async (req, reply) => {
    await widget.revokeToken(callerOf(req).tokenId);
    return reply.code(204).send();
  });

  app.get('/letters/widget/prefs', { preHandler: requireAccount }, async (req) => widget.settings(req.user!.id));

  app.put(
    '/letters/widget/prefs',
    { schema: { body: prefsBody }, config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } }, preHandler: requireAccount },
    async (req) => widget.setPrefs(req.user!.id, req.body as z.infer<typeof prefsBody>),
  );

  app.get('/letters/widget/feed', { config: BY_ADDRESS, preHandler: requireWidget }, async (req) => widget.feed(callerOf(req).userId));

  app.get('/letters/widget/image', { schema: { querystring: imageQuery }, config: BY_ADDRESS, preHandler: requireWidget }, async (req, reply) => {
    const q = req.query as z.infer<typeof imageQuery>;
    const sky: WidgetSky = q.sky ?? 'day';
    const picture = await widget.picture(callerOf(req).userId);
    // The same picture at the same size has the same tag, so a widget that has it gets a 304 without drawing.
    const { width, height } = widgetPixels({ w: q.w, h: q.h, scale: q.scale });
    const etag = widgetImageEtag(widgetImageKey(picture, sky, width, height));
    // a private cache may keep it, but asks each time whether it is still the letter shown
    reply.header('cache-control', 'private, no-cache').header('etag', etag);
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    const { png } = await widgetImage(picture, sky, { w: q.w, h: q.h, scale: q.scale });
    return reply.type('image/png').send(png);
  });
}
