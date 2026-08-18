import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env.js';
import { exceedsUploadSize, mediaLimits, opLimitReached, wouldExceedStorage } from './mediaLimits.js';

describe('mediaLimits (from config)', () => {
  it('uses the documented defaults', () => {
    const l = mediaLimits(loadConfig({}));
    expect(l.maxUploadBytes).toBe(5 * 1024 * 1024);
    expect(l.maxStoredBytes).toBe(250 * 1024);
    expect(l.maxDimension).toBe(512);
    expect(l.storageLimitBytes).toBe(9 * 1024 * 1024 * 1024);
    expect(l.classALimit).toBe(900_000);
    expect(l.classBLimit).toBe(9_000_000);
    expect(l.uploadRateMax).toBe(10);
    expect(l.uploadRateWindowMs).toBe(60 * 60_000);
    expect([...l.allowedTypes].sort()).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('honours env overrides', () => {
    const l = mediaLimits(loadConfig({ MEDIA_MAX_UPLOAD_MB: '2', MEDIA_STORAGE_LIMIT_GB: '1', MEDIA_ALLOWED_TYPES: 'image/png' }));
    expect(l.maxUploadBytes).toBe(2 * 1024 * 1024);
    expect(l.storageLimitBytes).toBe(1024 * 1024 * 1024);
    expect([...l.allowedTypes]).toEqual(['image/png']);
  });
});

describe('limit decisions', () => {
  it('flags oversized raw uploads', () => {
    expect(exceedsUploadSize(6 * 1024 * 1024, 5 * 1024 * 1024)).toBe(true);
    expect(exceedsUploadSize(1024, 5 * 1024 * 1024)).toBe(false);
  });

  it('storage gate blocks over-limit AND unknown usage (fail-closed)', () => {
    const limit = 9 * 1024 * 1024 * 1024;
    expect(wouldExceedStorage(limit - 100, 250, limit)).toBe(true); // would cross
    expect(wouldExceedStorage(1000, 250, limit)).toBe(false); // fits
    expect(wouldExceedStorage(null, 250, limit)).toBe(true); // unknown -> block
  });

  it('op limit reached at threshold; unknown allowed (soft guard)', () => {
    expect(opLimitReached(900_000, 900_000)).toBe(true);
    expect(opLimitReached(899_999, 900_000)).toBe(false);
    expect(opLimitReached(null, 900_000)).toBe(false);
  });
});
