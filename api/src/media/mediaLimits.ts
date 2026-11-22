import type { AppConfig } from '../config/env.js';

/** Numeric media cost limits derived from config. */
export interface MediaLimits {
  maxUploadBytes: number;
  maxStoredBytes: number;
  maxDimension: number;
  storageLimitBytes: number;
  classALimit: number;
  classBLimit: number;
  uploadRateMax: number;
  uploadRateWindowMs: number;
  allowedTypes: Set<string>;
}

export function mediaLimits(config: AppConfig): MediaLimits {
  return {
    maxUploadBytes: Math.round(config.MEDIA_MAX_UPLOAD_MB * 1024 * 1024),
    maxStoredBytes: Math.round(config.MEDIA_MAX_STORED_KB * 1024),
    maxDimension: config.MEDIA_MAX_DIMENSION,
    storageLimitBytes: Math.round(config.MEDIA_STORAGE_LIMIT_GB * 1024 * 1024 * 1024),
    classALimit: config.MEDIA_MONTHLY_CLASS_A_LIMIT,
    classBLimit: config.MEDIA_MONTHLY_CLASS_B_LIMIT,
    uploadRateMax: config.MEDIA_UPLOAD_RATE_MAX,
    uploadRateWindowMs: Math.round(config.MEDIA_UPLOAD_RATE_WINDOW_MIN * 60_000),
    allowedTypes: new Set(
      config.MEDIA_ALLOWED_TYPES.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  };
}

/** Limits for image posts: the avatar's storage and op ceilings and types, with a larger size and its own rate limit. */
export function imagePostLimits(config: AppConfig): MediaLimits {
  return {
    ...mediaLimits(config),
    maxStoredBytes: Math.round(config.MEDIA_IMAGE_MAX_STORED_KB * 1024),
    maxDimension: config.MEDIA_IMAGE_MAX_DIMENSION,
    uploadRateMax: config.MEDIA_IMAGE_UPLOAD_RATE_MAX,
    uploadRateWindowMs: Math.round(config.MEDIA_IMAGE_UPLOAD_RATE_WINDOW_MIN * 60_000),
  };
}

/** Limits for voice-note audio, stored as uploaded, so `maxUploadBytes` is the cost lever; shares the storage and op ceilings. */
export interface AudioLimits {
  maxUploadBytes: number;
  maxSeconds: number;
  storageLimitBytes: number;
  classALimit: number;
  uploadRateMax: number;
  uploadRateWindowMs: number;
  allowedTypes: Set<string>;
}

export function audioLimits(config: AppConfig): AudioLimits {
  return {
    maxUploadBytes: Math.round(config.MEDIA_AUDIO_MAX_UPLOAD_MB * 1024 * 1024),
    maxSeconds: config.MEDIA_AUDIO_MAX_SECONDS,
    storageLimitBytes: Math.round(config.MEDIA_STORAGE_LIMIT_GB * 1024 * 1024 * 1024),
    classALimit: config.MEDIA_MONTHLY_CLASS_A_LIMIT,
    uploadRateMax: config.MEDIA_AUDIO_UPLOAD_RATE_MAX,
    uploadRateWindowMs: Math.round(config.MEDIA_AUDIO_UPLOAD_RATE_WINDOW_MIN * 60_000),
    allowedTypes: new Set(
      config.MEDIA_AUDIO_ALLOWED_TYPES.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  };
}

export function exceedsUploadSize(byteLength: number, maxUploadBytes: number): boolean {
  return byteLength > maxUploadBytes;
}

/**
 * Bytes one account's uploads may hold in all, pictures, photos and recordings together: hundreds of posts' worth, so
 * only a script meets it, and one account can no longer fill the bucket the whole service shares.
 */
export const ACCOUNT_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024;

/** What an upload past `ACCOUNT_STORAGE_LIMIT_BYTES` is told, under the shared storage ceiling's code. */
export const ACCOUNT_STORAGE_MESSAGE = 'your uploads have reached the storage one account may use; remove some posts to add more';

/** Fail-closed storage gate: unknown usage (`null`, e.g. a failed count) blocks the upload. */
export function wouldExceedStorage(currentBytes: number | null, addBytes: number, limitBytes: number): boolean {
  if (currentBytes === null) return true;
  return currentBytes + addBytes > limitBytes;
}

/**
 * Class A/B op ceiling. A soft guard, since the storage limit is the hard cap and every op belongs to a gated upload,
 * so an unknown count (`null`) is allowed and logged. Stops at the threshold.
 */
export function opLimitReached(count: number | null, limit: number): boolean {
  if (count === null) return false;
  return count >= limit;
}
