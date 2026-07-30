import { describe, expect, it } from 'vitest';
import {
  MIN_RECORDING_BYTES,
  MIN_RECORDING_MS,
  isRecordingUsable,
  recordingRejection,
} from './recording';

describe('isRecordingUsable', () => {
  it('accepts a long-enough, non-empty clip', () => {
    expect(isRecordingUsable({ durationMs: MIN_RECORDING_MS, byteSize: MIN_RECORDING_BYTES })).toBe(true);
  });

  it('rejects a too-short clip', () => {
    expect(isRecordingUsable({ durationMs: 400, byteSize: 5000 })).toBe(false);
  });

  it('rejects an empty/silent clip', () => {
    expect(isRecordingUsable({ durationMs: 3000, byteSize: 10 })).toBe(false);
  });
});

describe('recordingRejection', () => {
  it('explains a short recording', () => {
    expect(recordingRejection({ durationMs: 200, byteSize: 5000 })).toMatch(/short/i);
  });
  it('explains a silent recording', () => {
    expect(recordingRejection({ durationMs: 3000, byteSize: 0 })).toMatch(/hear/i);
  });
  it('is null for a good recording', () => {
    expect(recordingRejection({ durationMs: 2000, byteSize: 20000 })).toBeNull();
  });
});
