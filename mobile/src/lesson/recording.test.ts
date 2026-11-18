import { describe, expect, it } from 'vitest';
import { recordingRejection } from './recording';

describe('recordingRejection', () => {
  it('explains a short recording', () => {
    expect(recordingRejection({ durationMs: 200, byteSize: 5000 })).toBe('recorder.tooShort');
  });
  it('explains a silent recording', () => {
    expect(recordingRejection({ durationMs: 3000, byteSize: 0 })).toBe('recorder.silent');
  });
  it('is null for a good recording', () => {
    expect(recordingRejection({ durationMs: 2000, byteSize: 20000 })).toBeNull();
  });
});
