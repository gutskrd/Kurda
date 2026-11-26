/**
 * A round's recordings, played by handle (GET /games/solo/sessions/:id/clips/:clip).
 *
 * A listening game must not give the app a recording's address: lesson recordings are filed by their bytes, so the
 * address appears beside its text elsewhere, and a dictionary pronunciation's address often names the word. So each
 * item carries a random handle minted with the round and valid only while it lasts, and the recording is streamed from
 * here (speakers/recording-file.ts: our bucket by object key, dictionary pronunciations only from allowed hosts).
 * Nothing in the address or reply says what is said.
 *
 * The address is the permission, like a media address: <audio> elements and phone players fetch without the learner's
 * token. It is unguessable (round id plus a 128-bit handle), stops answering when the round expires, is rate-limited
 * per address, and one round's clips answer `CLIP_FETCHES_PER_ROUND` times in all, wherever they are fetched from.
 *
 * The file is read whole (sentence recordings are small and capped) so the reply can serve byte ranges, which some
 * players request before playing. Browsers may cache it for as long as the round has left; shared caches may not.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { AppError } from '../plugins/errors.js';
import { takeCount } from '../limits/counters.js';
import { readAudio, type RecordingFiles } from '../speakers/recording-file.js';
import type { RecordingRef } from './hear-it.js';

/** Clips one address may fetch a minute: a round's eight, each replayed and range-read, many times over. */
export const CLIP_RATE = { max: 240, windowMs: 60_000, per: 'ip' as const };

/**
 * Fetches one round's clips answer in all, counted in Redis for the round's lifetime: its items played and replayed,
 * range-read and fetched again by a player that ignored its cache, many times over; not a loop pulling the bucket.
 */
export const CLIP_FETCHES_PER_ROUND = 300;

const params = z.object({ id: lowerUuid(), clip: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });

/** A single byte range a reply can answer, or why it cannot (pure, for the tests). */
export function byteRange(header: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  // several ranges, or another unit: the whole file answers, as a server without ranges would
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}

interface ClipItem {
  clip?: unknown;
  recording?: RecordingRef;
}

export function registerGameClipRoute(app: FastifyInstance, files: RecordingFiles): void {
  app.get('/games/solo/sessions/:id/clips/:clip', { schema: { params }, config: { rateLimit: CLIP_RATE } }, async (req, reply) => {
    const { id, clip } = req.params as z.infer<typeof params>;
    const res = await app.db.query<{ items: ClipItem[]; live: boolean; seconds_left: number }>(
      `SELECT items, expires_at > now() AS live, GREATEST(1, ceil(extract(epoch FROM expires_at - now())))::int AS seconds_left FROM game_sessions WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    const item = row?.items.find((i) => i.clip === clip && i.recording);
    // a round that is not there and a handle that is not in it are the same answer
    if (!row || !item?.recording) throw new AppError('NOT_FOUND', 404, 'no such clip');
    if (!row.live) throw new AppError('GAME_SESSION_EXPIRED', 410, 'this round has expired; start a new one');
    if (!(await takeCount(app.hasDecorator('redis') ? app.redis : undefined, `clips:round:${id}`, CLIP_FETCHES_PER_ROUND, row.seconds_left, app.log))) {
      throw new AppError('RATE_LIMITED', 429, 'too many requests', { retryAfterSec: row.seconds_left });
    }

    const signal = AbortSignal.timeout(files.timeoutMs);
    const { source, id: ref } = item.recording;
    const missing = 'that recording is no longer there';
    const from =
      source === 'dictionary'
        ? await files.dictionary(ref, missing, signal)
        : await files.stored(source === 'lesson' ? 'lesson_audio' : 'alphabet_audio', ref, missing, signal);
    const { bytes, type } = await readAudio(from, signal);

    reply
      .header('content-type', type)
      .header('accept-ranges', 'bytes')
      // the same clip for the rest of the round, so a replay costs nothing here
      .header('cache-control', `private, max-age=${row.seconds_left}, immutable`)
      .header('content-disposition', 'inline')
      .header('x-content-type-options', 'nosniff');
    const range = byteRange(req.headers.range, bytes.length);
    if (range === 'unsatisfiable') {
      return reply.code(416).header('content-range', `bytes */${bytes.length}`).send();
    }
    if (range) {
      return reply
        .code(206)
        .header('content-range', `bytes ${range.start}-${range.end}/${bytes.length}`)
        .send(bytes.subarray(range.start, range.end + 1));
    }
    return reply.send(bytes);
  });
}
