/**
 * A recording's own sound, read through the API, for the admin panel to make
 * its mouth timeline from (GET /admin/audio/:kind/file in routes.ts).
 *
 * The panel's batch job decodes every recording in the browser, and a page may
 * only read a file from another site that allows it to; the media bucket and
 * other sites need not. Sent from here, the file comes from the API's own
 * origin, which the panel may already read.
 *
 * Where the bytes come from:
 *
 *   lesson, alphabet  our bucket, by the stored object key (`media_key`), never by a URL
 *   dictionary        `dict_audio.audio_url`, which an import may have set to another
 *                     site: fetched only from DICTIONARY_AUDIO_HOSTS or our CDN, by
 *                     net/outbound.ts's rules
 *
 * Either way it is streamed, never held whole, and cut off at
 * AUDIO_FILE_MAX_BYTES; the whole read has AUDIO_FILE_TIMEOUT_MS. It is sent
 * as the audio type it was stored as, or as its first bytes show, and never
 * as anything that is not audio.
 */
import { Readable } from 'node:stream';
import type { FastifyReply } from 'fastify';
import type pg from 'pg';
import type { AppConfig } from '../config/env.js';
import type { MediaStorage } from '../media/storage.js';
import { sniffPlayableAudioType } from '../media/mimeSniff.js';
import { fetchFromAllowedHost, OutboundError, type Lookup } from '../net/outbound.js';
import { AppError } from '../plugins/errors.js';

/** The largest file sent: many times a sentence's WAV, and the voice-note upload cap. */
export const AUDIO_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** How long reading one file may take, from the first request to the last byte. */
export const AUDIO_FILE_TIMEOUT_MS = 10_000;

/**
 * Other sites a dictionary pronunciation is fetched from, besides our own CDN
 * (CDN_BASE_URL). Wikimedia Commons is where Wiktionary's pronunciations, the
 * recordings a lexicon import brings with its words, are kept. A host not here
 * is refused, so adding a source of recordings means adding its host.
 */
export const DICTIONARY_AUDIO_HOSTS: readonly string[] = ['upload.wikimedia.org'];

/** The types a file may be sent as. */
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg', 'audio/flac']);

/** Enough of a file to tell what it is (the WebM check reads 64 bytes). */
const SNIFF_BYTES = 64;

/** Test seams: how another site is reached, and how long it may take. */
export interface RecordingFileOptions {
  fetch?: typeof fetch;
  lookup?: Lookup;
  timeoutMs?: number;
}

/** The hosts a dictionary pronunciation may be fetched from: ours, and DICTIONARY_AUDIO_HOSTS. */
export function dictionaryAudioHosts(config: Pick<AppConfig, 'CDN_BASE_URL'>): Set<string> {
  const hosts = new Set(DICTIONARY_AUDIO_HOSTS);
  if (config.CDN_BASE_URL) hosts.add(new URL(config.CDN_BASE_URL).host.toLowerCase());
  return hosts;
}

const unreachable = (message: string, reason: string): AppError =>
  new AppError('AUDIO_UNREACHABLE', 502, message, { reason });

const tooLarge = (): AppError =>
  unreachable(`the recording is larger than ${AUDIO_FILE_MAX_BYTES / (1024 * 1024)} MB`, 'too_large');

/** A file being read: its bytes, and what it was stored as or claims to be. */
interface Source {
  body: AsyncIterable<Uint8Array>;
  /** the type it was stored as; otherwise its first bytes decide */
  storedType?: string;
  /** its length, when it is known for certain */
  length?: number;
}

export class RecordingFiles {
  private readonly hosts: Set<string>;
  readonly timeoutMs: number;

  constructor(
    private readonly db: pg.Pool,
    private readonly storage: MediaStorage | undefined,
    config: Pick<AppConfig, 'CDN_BASE_URL'>,
    private readonly options: RecordingFileOptions = {},
  ) {
    this.hosts = dictionaryAudioHosts(config);
    this.timeoutMs = options.timeoutMs ?? AUDIO_FILE_TIMEOUT_MS;
  }

  /** A lesson or alphabet recording, from our bucket by its object key. */
  async stored(table: 'lesson_audio' | 'alphabet_audio', key: string, missing: string, signal: AbortSignal): Promise<Source> {
    const { rows } = await this.db.query<{ media_key: string; content_type: string }>(
      `SELECT media_key, content_type FROM ${table} WHERE key = $1`,
      [key],
    );
    const row = rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, missing);
    if (!this.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
    let object: Awaited<ReturnType<MediaStorage['read']>>;
    try {
      object = await this.storage.read(row.media_key, signal);
    } catch {
      throw unreachable('the recording could not be read from storage', signal.aborted ? 'timeout' : 'storage');
    }
    if (!object) throw new AppError('NOT_FOUND', 404, 'that recording’s file is not in storage');
    if (object.contentLength !== undefined && object.contentLength > AUDIO_FILE_MAX_BYTES) {
      object.body.destroy();
      throw tooLarge();
    }
    return { body: object.body, storedType: row.content_type, length: object.contentLength };
  }

  /** A dictionary pronunciation, from wherever its URL points, if that is a host allowed. */
  async dictionary(id: string, missing: string, signal: AbortSignal): Promise<Source> {
    const { rows } = await this.db.query<{ audio_url: string }>(`SELECT audio_url FROM dict_audio WHERE id = $1`, [id]);
    const row = rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, missing);
    let res: Response;
    try {
      res = await fetchFromAllowedHost(row.audio_url, {
        hosts: this.hosts,
        signal,
        headers: { accept: 'audio/*' },
        fetch: this.options.fetch,
        lookup: this.options.lookup,
      });
    } catch (err) {
      if (!(err instanceof OutboundError)) throw err;
      if (err.refused) throw new AppError('AUDIO_HOST_NOT_ALLOWED', 422, err.message, { reason: err.reason });
      throw unreachable(err.message, err.reason);
    }
    // a compressed body's length is not the length of what is sent; the count below still holds it
    const declared = Number(res.headers.get('content-length'));
    if (!res.headers.has('content-encoding') && Number.isFinite(declared) && declared > AUDIO_FILE_MAX_BYTES) {
      await res.body?.cancel().catch(() => undefined);
      throw tooLarge();
    }
    if (!res.body) throw unreachable('the recording’s host sent nothing', 'empty');
    return { body: res.body as unknown as AsyncIterable<Uint8Array> };
  }
}

/**
 * Send `source`: its first bytes read to learn its type, then the rest as it
 * arrives. What goes wrong before the first byte is sent is an error the panel
 * can show; after, the response is cut short, which it sees as a failed read.
 */
export async function sendAudio(reply: FastifyReply, source: Source, signal: AbortSignal): Promise<FastifyReply> {
  const reader = source.body[Symbol.asyncIterator]();
  const stop = async (): Promise<void> => {
    await reader.return?.().catch(() => undefined);
  };
  const head: Uint8Array[] = [];
  let read = 0;
  try {
    while (read < SNIFF_BYTES) {
      const next = await reader.next();
      if (next.done) break;
      head.push(next.value);
      read += next.value.length;
      if (read > AUDIO_FILE_MAX_BYTES) throw tooLarge();
    }
  } catch (err) {
    await stop();
    if (err instanceof AppError) throw err;
    throw unreachable('the recording stopped arriving part way', signal.aborted ? 'timeout' : 'network');
  }
  const first = Buffer.concat(head);
  const stored = source.storedType && AUDIO_TYPES.has(source.storedType) ? source.storedType : null;
  const type = stored ?? sniffPlayableAudioType(first);
  if (!type) {
    await stop();
    throw unreachable('the file there is not a recording', 'not_audio');
  }

  async function* rest(): AsyncGenerator<Uint8Array> {
    try {
      if (first.length > 0) yield first;
      let sent = first.length;
      for (;;) {
        const next = await reader.next();
        if (next.done) return;
        sent += next.value.length;
        if (sent > AUDIO_FILE_MAX_BYTES) throw tooLarge();
        yield next.value;
      }
    } finally {
      await stop();
    }
  }

  reply
    .header('content-type', type)
    .header('cache-control', 'private, no-store')
    .header('content-disposition', 'inline')
    .header('x-content-type-options', 'nosniff');
  if (source.length !== undefined) reply.header('content-length', String(source.length));
  return reply.send(Readable.from(rest(), { objectMode: false }));
}
