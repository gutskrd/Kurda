/**
 * GET /reactions: Hevalo's and Xezal's recorded reaction lines (shared reactions.ts) for the apps, which play one when
 * its moment comes. Public and small: one indexed read of the catalogue's keys, cached for a few minutes in Redis and
 * at the edge, and dropped from the cache whenever a reaction take is saved or removed. A take is always sent in its
 * line's character's voice, with its mouth timeline or one made from its words.
 */
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { REACTION_LINES, reactionKey, type ReactionTake, type ReactionTakes } from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { voiceOf } from '../speakers/voice.js';

const DOMAIN = 'reactions';
const ID = 'takes';
/** How long the list is kept; a new take also drops it at once. */
const TTL_SECONDS = 300;

const BY_KEY = new Map(REACTION_LINES.map((l) => [reactionKey(l), l]));

/** Every recorded line of the catalogue as it stands now. */
async function reactionTakes(db: Pick<pg.Pool, 'query'>): Promise<ReactionTakes> {
  const res = await db.query<{ key: string; url: string; text: string; duration_ms: number | null; lipsync: unknown }>(
    `SELECT key, url, text, duration_ms, lipsync FROM lesson_audio WHERE key = ANY($1::text[]) ORDER BY key`,
    [[...BY_KEY.keys()]],
  );
  const takes = res.rows.flatMap((r): ReactionTake[] => {
    const l = BY_KEY.get(r.key);
    if (!l) return [];
    const voice = voiceOf({ speaker: l.character, lipsync: r.lipsync }, { text: r.text, durationMs: r.duration_ms });
    return [{ character: l.character, id: l.id, src: r.url, voice: voice ?? null }];
  });
  return { takes };
}

export async function bustReactions(cache: Cache | null | undefined): Promise<void> {
  await cache?.del(DOMAIN, ID);
}

export function registerReactionRoutes(app: FastifyInstance): void {
  app.get('/reactions', { config: { skipValidation: true } }, async () =>
    app.cache.withCache(DOMAIN, ID, TTL_SECONDS, () => reactionTakes(app.db)),
  );
}
