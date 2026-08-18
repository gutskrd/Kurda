import type { AppConfig } from '../config/env.js';

/** Numeric cost-safety limits derived from env config (KUR-177 hardening). */
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

/**
 * Limits for community image/meme posts (KUR-290/291): same storage/op ceilings
 * and accepted types as avatars (shared R2 budget), but a larger dimension + stored
 * cap and its own upload rate limit.
 */
export function imagePostLimits(config: AppConfig): MediaLimits {
  return {
    ...mediaLimits(config),
    maxStoredBytes: Math.round(config.MEDIA_IMAGE_MAX_STORED_KB * 1024),
    maxDimension: config.MEDIA_IMAGE_MAX_DIMENSION,
    uploadRateMax: config.MEDIA_IMAGE_UPLOAD_RATE_MAX,
    uploadRateWindowMs: Math.round(config.MEDIA_IMAGE_UPLOAD_RATE_WINDOW_MIN * 60_000),
  };
}

export function exceedsUploadSize(byteLength: number, maxUploadBytes: number): boolean {
  return byteLength > maxUploadBytes;
}

/**
 * Fail-closed storage gate: if current usage is unknown (`null` — e.g. the count
 * query failed), block the upload rather than risk uncontrolled growth.
 */
export function wouldExceedStorage(currentBytes: number | null, addBytes: number, limitBytes: number): boolean {
  if (currentBytes === null) return true;
  return currentBytes + addBytes > limitBytes;
}

/**
 * Class A/B op ceiling. Soft guard (the storage limit is the hard cost cap, and
 * each op is tied to a storage-gated upload), so an unknown count (`null`) is
 * allowed — the caller logs it. `>=` so we stop *at* the threshold.
 */
export function opLimitReached(count: number | null, limit: number): boolean {
  if (count === null) return false;
  return count >= limit;
}
