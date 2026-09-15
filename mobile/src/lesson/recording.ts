/** Speaking-recording validation (KUR-036). Pure, so it's unit-testable. */
import type { TranslationKey } from '../i18n/translations';

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

/**
 * Why a recording was rejected, or null if it's fine.
 *
 * A key rather than a sentence: there is nothing to pass through here, so the
 * module stays pure and the screen that has a translator does the looking up.
 */
export function recordingRejection(meta: RecordingMeta): TranslationKey | null {
  if (meta.durationMs < MIN_RECORDING_MS) return 'recorder.tooShort';
  if (meta.byteSize < MIN_RECORDING_BYTES) return 'recorder.silent';
  return null;
}
