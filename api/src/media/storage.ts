import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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
 * Asks the CDN in front of the public bucket to forget some URLs; true when it
 * accepted. A deleted object is otherwise served from the edge for as long as
 * its year-long `immutable` cache lasts.
 */
export type CdnPurge = (urls: string[]) => Promise<boolean>;

export interface MediaStorageOptions {
  /**
   * A bucket that is NOT publicly readable, for what moderation keeps as
   * evidence. Without one, evidence goes to an unguessable `quarantine/` key
   * in the public bucket, written `private, no-store` — reachable only by
   * someone who already has the key, never listed and never cached.
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

  private get evidenceBucket(): string {
    return this.options.evidenceBucket ?? this.bucket;
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

  /** Short-lived signed GET for private objects (GDPR exports). */
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
        Bucket: this.bucket,
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
        Bucket: this.evidenceBucket,
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
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.evidenceBucket, Key: target }));
      return true;
    } catch {
      return false;
    }
  }

  /** A short-lived signed GET for a piece of evidence (the case view's media). */
  async createEvidenceDownloadUrl(target: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.evidenceBucket, Key: target }), {
      expiresIn: expiresInSeconds,
    });
  }

  async deleteEvidence(target: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.evidenceBucket, Key: target }));
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
