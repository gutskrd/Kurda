import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import type { AppConfig } from '../config/env.js';

/** Only formats the product actually uses; anything else is rejected. */
export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  // what a browser's MediaRecorder produces on Chrome and Firefox
  'audio/webm': 'webm',
  // the audio studio's recordings of letters and lesson sentences: trimmed and
  // levelled in the admin panel, a few seconds each
  'audio/wav': 'wav',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  // GDPR data exports (KUR-024) — served via signed GET only, never CDN
  'application/json': 'json',
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const UPLOAD_URL_TTL_SECONDS = 300;

/** Content-hashed keys make objects immutable — same bytes, same key. */
export function mediaKey(kind: string, sha256Hex: string, contentType: string): string {
  const ext = ALLOWED_CONTENT_TYPES[contentType];
  if (!ext) throw new Error(`unsupported content type: ${contentType}`);
  if (!/^[a-f0-9]{64}$/.test(sha256Hex)) throw new Error('sha256 must be 64 lowercase hex chars');
  if (!/^[a-z-]{2,32}$/.test(kind)) throw new Error('kind must be a short lowercase slug');
  return `${kind}/${sha256Hex}.${ext}`;
}

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** What an object nobody but its owner (or a moderator) may fetch is stored with. */
export const PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0';

/**
 * Where private files live, by the start of their key: what moderation keeps
 * as evidence (moderation/pseudonym.ts `quarantine/…`) and one person's data
 * export (gdpr/service.ts `user-export/…`). With a private bucket they are
 * kept there; these are also the prefixes moved out of the public bucket when
 * one is first configured (`movePrivateFiles`).
 */
export const PRIVATE_PREFIXES = ['quarantine/', 'user-export/'] as const;

const isPrivateKey = (key: string): boolean => PRIVATE_PREFIXES.some((prefix) => key.startsWith(prefix));

/**
 * Private buckets that refused a write at start-up (`checkPrivateBucket`), for
 * every storage in the process: the background jobs build their own, and a
 * data export must not go to a bucket the API has found it cannot write to.
 */
const refusedPrivateBuckets = new Set<string>();

/**
 * Asks the CDN in front of the public bucket to forget some URLs; true when it
 * accepted. A deleted object is otherwise served from the edge for as long as
 * its year-long `immutable` cache lasts.
 */
export type CdnPurge = (urls: string[]) => Promise<boolean>;

export interface MediaStorageOptions {
  /**
   * A bucket that is NOT publicly readable, for what moderation keeps as
   * evidence and for people's data exports (PRIVATE_PREFIXES). Without one,
   * they go to unguessable keys in the public bucket, written `private,
   * no-store` — never listed and never cached, but readable by anyone who has
   * the address.
   */
  evidenceBucket?: string;
  purge?: CdnPurge;
}

export interface UploadTicket {
  key: string;
  uploadUrl: string;
  /** Headers the client MUST send on the PUT (they are part of the signature). */
  requiredHeaders: Record<string, string>;
  publicUrl: string;
  expiresInSeconds: number;
}

export class MediaStorage {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
    private readonly cdnBaseUrl: string,
    private readonly options: MediaStorageOptions = {},
  ) {}

  /** Where private files go: the private bucket, or the public one when there is none (or it refused). */
  private get privateBucket(): string {
    const own = this.options.evidenceBucket;
    return own && !refusedPrivateBuckets.has(own) ? own : this.bucket;
  }

  /** Whether private files have a bucket of their own (and older ones may still be in the public one). */
  get hasPrivateBucket(): boolean {
    return this.privateBucket !== this.bucket;
  }

  private async inBucket(bucket: string, key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The bucket a private file is in: the private one, or — for a file kept
   * before there was a private bucket, and not yet moved — the public one.
   */
  private async bucketOfPrivate(key: string): Promise<string> {
    if (!this.hasPrivateBucket || (await this.inBucket(this.privateBucket, key))) return this.privateBucket;
    return (await this.inBucket(this.bucket, key)) ? this.bucket : this.privateBucket;
  }

  publicUrl(key: string): string {
    return `${this.cdnBaseUrl}/${key}`;
  }

  async createUploadUrl(input: {
    kind: string;
    contentType: string;
    contentLength: number;
    sha256Hex: string;
  }): Promise<UploadTicket> {
    if (input.contentLength <= 0 || input.contentLength > MAX_UPLOAD_BYTES) {
      throw new Error(`contentLength must be 1..${MAX_UPLOAD_BYTES} bytes`);
    }
    const key = mediaKey(input.kind, input.sha256Hex, input.contentType);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });
    return {
      key,
      uploadUrl,
      requiredHeaders: {
        'content-type': input.contentType,
        'cache-control': IMMUTABLE_CACHE_CONTROL,
      },
      publicUrl: this.publicUrl(key),
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    };
  }

  /** Short-lived signed GET for a private file (a data export), wherever it is kept. */
  async createPrivateDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: await this.bucketOfPrivate(key), Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  /** Short-lived signed GET for an object in the public bucket (a case's media, read by a moderator). */
  async createDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  /** Object metadata for verification/tooling; null when absent. */
  async headMetadata(key: string): Promise<{ cacheControl?: string; contentType?: string } | null> {
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { cacheControl: head.CacheControl, contentType: head.ContentType };
    } catch {
      return null;
    }
  }

  /**
   * An object's bytes, as they stream from the bucket, with what it was stored
   * as; null when there is no such object. `signal` stops the read, body and
   * all.
   */
  async read(
    key: string,
    signal?: AbortSignal,
  ): Promise<{ body: Readable; contentType?: string; contentLength?: number } | null> {
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: signal });
      if (!res.Body) return null;
      return { body: res.Body as Readable, contentType: res.ContentType, contentLength: res.ContentLength };
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    // a private file (a data export) is in the private bucket, or in this one
    // if it was kept before there was one: deleting a key that is not there is
    // no error, so both are asked
    if (this.hasPrivateBucket && isPrivateKey(key)) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.privateBucket, Key: key }));
    }
  }

  /** Upload a processed object directly (through-server flow, KUR-177 hardening). */
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    );
  }

  /**
   * Store something that is one person's, and must not be cached as if it were
   * everyone's.
   *
   * The GDPR export is a JSON file containing a reader's account, their
   * sessions and their linked identities, and it was being written through the
   * ordinary upload path — which stamps `public, max-age=31536000, immutable`
   * on everything, because everything else it stores is a picture. The bucket
   * is public-read, since that is how images are served, so the export was a
   * public object with a year-long cache directive, in a fixed `user-export/`
   * prefix, sitting behind nothing but the unguessability of its key. The code
   * that handed out a signed download URL was the only part treating it as
   * private.
   *
   * `private, no-store` tells the CDN and every proxy in between not to keep a
   * copy. The right long-term answer is a second bucket that is not public at
   * all; this is the part that does not need one.
   */
  async putPrivate(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.privateBucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
        CacheControl: PRIVATE_CACHE_CONTROL,
      }),
    );
  }

  // ---- evidence moderation keeps off the public bucket ------------------------

  /**
   * Copy a public object to `target` in evidence storage, private and uncached.
   * The caller deletes the public original once this has succeeded, so a failed
   * copy never loses the evidence.
   */
  async copyToEvidence(key: string, target: string, contentType?: string): Promise<void> {
    await this.s3.send(
      new CopyObjectCommand({
        Bucket: this.privateBucket,
        Key: target,
        // keys are `kind/<sha256>.ext` (mediaKey), nothing that needs escaping
        CopySource: `${this.bucket}/${key}`,
        MetadataDirective: 'REPLACE',
        CacheControl: PRIVATE_CACHE_CONTROL,
        ...(contentType ? { ContentType: contentType } : {}),
      }),
    );
  }

  async evidenceExists(target: string): Promise<boolean> {
    if (await this.inBucket(this.privateBucket, target)) return true;
    // kept before there was a private bucket, and not moved yet
    return this.hasPrivateBucket && this.inBucket(this.bucket, target);
  }

  /** A short-lived signed GET for a piece of evidence (the case view's media). */
  async createEvidenceDownloadUrl(target: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: await this.bucketOfPrivate(target), Key: target }), {
      expiresIn: expiresInSeconds,
    });
  }

  async deleteEvidence(target: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.privateBucket, Key: target }));
    if (this.hasPrivateBucket) await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: target }));
  }

  // ---- the private bucket, once there is one ---------------------------------

  /**
   * Whether the private bucket takes a write and a delete with these
   * credentials: an R2 token scoped to the public bucket alone would refuse,
   * and evidence could then not be taken off the public bucket. Asked once at
   * start-up (`preparePrivateStorage`), so a missing grant shows in the log
   * the moment the bucket is configured. Null when there is no private bucket.
   */
  async checkPrivateBucket(): Promise<{ ok: true } | { ok: false; error: string } | null> {
    const own = this.options.evidenceBucket;
    if (!own || own === this.bucket) return null;
    const key = 'quarantine/.write-check';
    try {
      await this.s3.send(
        new PutObjectCommand({ Bucket: own, Key: key, Body: Buffer.from('ok'), ContentType: 'text/plain', CacheControl: PRIVATE_CACHE_CONTROL }),
      );
      await this.s3.send(new DeleteObjectCommand({ Bucket: own, Key: key }));
      refusedPrivateBuckets.delete(own);
      return { ok: true };
    } catch (err) {
      const e = err as { name?: string; message?: string };
      // until the next start, private files are kept as they were before
      // there was a private bucket, rather than not kept at all
      refusedPrivateBuckets.add(own);
      return { ok: false, error: e.name ?? e.message ?? 'unknown error' };
    }
  }

  /**
   * Move the private files kept in the public bucket before there was a
   * private one (PRIVATE_PREFIXES) into the private bucket: copied, then
   * deleted from the public one, then forgotten by the CDN — a data export
   * from before exports were written `no-store` carried a year-long cache
   * directive. A file that fails is left where it was, still found there, and
   * tried again at the next start.
   */
  async movePrivateFiles(): Promise<{ moved: number; failed: number }> {
    let moved = 0;
    let failed = 0;
    if (!this.hasPrivateBucket) return { moved, failed };
    const done: string[] = [];
    for (const prefix of PRIVATE_PREFIXES) {
      let token: string | undefined;
      do {
        const page = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
        for (const item of page.Contents ?? []) {
          if (!item.Key) continue;
          try {
            await this.s3.send(
              new CopyObjectCommand({
                Bucket: this.privateBucket,
                Key: item.Key,
                CopySource: `${this.bucket}/${item.Key}`,
                MetadataDirective: 'REPLACE',
                CacheControl: PRIVATE_CACHE_CONTROL,
              }),
            );
            await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: item.Key }));
            done.push(item.Key);
            moved++;
          } catch {
            failed++;
          }
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    }
    if (done.length > 0) await this.purgePublic(done);
    return { moved, failed };
  }

  /** Ask the CDN to drop these keys' public URLs. Null when no purge is configured. */
  async purgePublic(keys: string[]): Promise<boolean | null> {
    if (!this.options.purge || keys.length === 0) return null;
    try {
      return await this.options.purge(keys.map((k) => this.publicUrl(k)));
    } catch {
      return false;
    }
  }
}

/**
 * Cloudflare's purge-by-URL, for a bucket served through a Cloudflare zone (R2
 * on a custom domain). The token needs only the zone's Cache Purge permission.
 */
export function cloudflarePurge(zoneId: string, apiToken: string, fetchFn: typeof fetch = fetch): CdnPurge {
  return async (urls) => {
    const res = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ files: urls }),
    });
    return res.ok;
  };
}

/**
 * At start-up, with a private bucket configured: prove it takes a write, then
 * move what was kept privately in the public bucket into it. Neither holds up
 * the start, and a refusal leaves private files where they always went.
 */
export async function preparePrivateStorage(
  storage: MediaStorage,
  log: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
): Promise<void> {
  const check = await storage.checkPrivateBucket();
  if (!check) return;
  if (!check.ok) {
    log.error(
      { error: check.error },
      'private storage refused a write: evidence and data exports stay in the public bucket under unguessable keys until the token can write to S3_EVIDENCE_BUCKET',
    );
    return;
  }
  try {
    const result = await storage.movePrivateFiles();
    log.info(result, 'private storage ready: private files are kept in the private bucket');
  } catch (err) {
    log.error({ err }, 'private storage could not list the public bucket to move older private files; they are still found where they are');
  }
}

export function createStorage(config: AppConfig): MediaStorage | null {
  if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
    return null;
  }
  const s3 = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    // path-style is required by MinIO and harmless elsewhere
    forcePathStyle: Boolean(config.S3_ENDPOINT),
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
  const cdn =
    config.CDN_BASE_URL ??
    (config.S3_ENDPOINT
      ? `${config.S3_ENDPOINT.replace(/\/$/, '')}/${config.S3_BUCKET}`
      : `https://${config.S3_BUCKET}.s3.${config.S3_REGION}.amazonaws.com`);
  return new MediaStorage(s3, config.S3_BUCKET, cdn.replace(/\/$/, ''), {
    evidenceBucket: config.S3_EVIDENCE_BUCKET,
    purge:
      config.CDN_PURGE_ZONE_ID && config.CDN_PURGE_API_TOKEN
        ? cloudflarePurge(config.CDN_PURGE_ZONE_ID, config.CDN_PURGE_API_TOKEN)
        : undefined,
  });
}
