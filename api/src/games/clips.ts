/**
 * A round's recordings, played by handle (GET /games/solo/sessions/:id/clips/:clip).
 *
 * A listening game must not hand the app a recording's address: lesson
 * recordings are filed by their bytes, so the same address appears beside its
 * text elsewhere (a lesson's cards, a conversation's lines), and a dictionary
 * pronunciation's address often names its word outright. So each item of a
 * round that plays a recording carries a handle of its own instead — random,
 * minted when the round is made, and good only while that round is — and the
 * recording is sent from here, read through the API (speakers/recording-file.ts:
 * our bucket by its object key, a dictionary pronunciation only from the hosts
 * allowed). Nothing in the address or the reply says what is said.
 *
 * The address is the permission, as a media address is: an <audio> element
 * and a phone's player fetch it without the learner's token, so it asks for
 * none. It is unguessable (the round's id and a 128-bit handle), it stops
 * answering when the round expires, and it is rate-limited per address.
 *
 * The file is read whole (a sentence's recording is small, and capped) so the
 * reply can answer a byte range: Safari and the phones' players ask for the
 * start of a file before they play it. The reply may be kept by the browser
 * for the hour a round takes, never by a shared cache.
 *
 * Any learning game's items may play clips this way: an item with a `clip`
 * and the `recording` it stands for.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { readAudio, type RecordingFiles } from '../speakers/recording-file.js';
import type { RecordingRef } from './hear-it.js';

/** Clips one address may fetch a minute: a round's eight, each replayed and range-read, many times over. */
export const CLIP_RATE = { max: 240, windowMs: 60_000, per: 'ip' as const };

const params = z.object({ id: z.uuid(), clip: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });

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
    const res = await app.db.query<{ items: ClipItem[]; live: boolean }>(`SELECT items, expires_at > now() AS live FROM game_sessions WHERE id = $1`, [id]);
    const row = res.rows[0];
    const item = row?.items.find((i) => i.clip === clip && i.recording);
    // a round that is not there and a handle that is not in it are the same answer
    if (!row || !item?.recording) throw new AppError('NOT_FOUND', 404, 'no such clip');
    if (!row.live) throw new AppError('GAME_SESSION_EXPIRED', 410, 'this round has expired; start a new one');

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
      .header('cache-control', 'private, max-age=3600')
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
