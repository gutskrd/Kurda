/**
 * Speaking-recording validation (KUR-036). The thresholds and the check live
 * in @kurda/shared (lesson-answers.ts), so the browser turns away the same
 * recordings the phone does; what is left here is the phone's words for them.
 */
import { MIN_RECORDING_BYTES, MIN_RECORDING_MS, recordingProblem } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

export { MIN_RECORDING_BYTES, MIN_RECORDING_MS };

export interface RecordingMeta {
  durationMs: number;
  byteSize: number;
}

/**
 * Whether a recording is worth uploading. Rejects very short or empty
 * (silent/failed) captures client-side, before spending an upload.
 */
export function isRecordingUsable(meta: RecordingMeta): boolean {
  return recordingProblem(meta) === null;
}

/**
 * Why a recording was rejected, or null if it's fine.
 *
 * A key rather than a sentence: there is nothing to pass through here, so the
 * module stays pure and the screen that has a translator does the looking up.
 */
export function recordingRejection(meta: RecordingMeta): TranslationKey | null {
  switch (recordingProblem(meta)) {
    case 'tooShort':
      return 'recorder.tooShort';
    case 'silent':
      return 'recorder.silent';
    case null:
      return null;
  }
}
