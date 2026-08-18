import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from '../config/env.js';

/** Only formats the product actually uses; anything else is rejected. */
export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
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
  ) {}

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
  return new MediaStorage(s3, config.S3_BUCKET, cdn.replace(/\/$/, ''));
}
