/** Speaking-recording validation (KUR-036). Pure, so it's unit-testable. */

/** Recordings shorter than this are almost certainly accidental. */
export const MIN_RECORDING_MS = 1000;
/** A plausible clip has at least this many bytes (guards silent/empty blobs). */
export const MIN_RECORDING_BYTES = 800;

export interface RecordingMeta {
  durationMs: number;
  byteSize: number;
}

/**
 * Whether a recording is worth uploading. Rejects very short or empty
 * (silent/failed) captures client-side, before spending an upload.
 */
export function isRecordingUsable({ durationMs, byteSize }: RecordingMeta): boolean {
  return durationMs >= MIN_RECORDING_MS && byteSize >= MIN_RECORDING_BYTES;
}

/** Human-friendly reason a recording was rejected, or null if it's fine. */
export function recordingRejection(meta: RecordingMeta): string | null {
  if (meta.durationMs < MIN_RECORDING_MS) return 'Too short — hold to record a little longer.';
  if (meta.byteSize < MIN_RECORDING_BYTES) return 'We couldn’t hear anything — try again.';
  return null;
}
