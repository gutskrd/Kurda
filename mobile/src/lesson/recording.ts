/**
 * Speaking-recording validation (KUR-036). The thresholds and the check live
 * in @kurda/shared (lesson-answers.ts), so the browser turns away the same
 * recordings the phone does; what is left here is the phone's words for them,
 * and what a take is to the exercise wherever it was recorded.
 */
import { MIN_RECORDING_BYTES, MIN_RECORDING_MS, recordingProblem } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { MicPermission } from '../recording/useMicRecorder';

export { MIN_RECORDING_BYTES, MIN_RECORDING_MS };
export type { MicPermission };

/** A take is cut off here: a phrase, not a speech (the browser's lessons stop at the same length). */
export const MAX_TAKE_MS = 15_000;

export interface RecordingMeta {
  durationMs: number;
  byteSize: number;
}

/** A take, kept on the device to be heard beside the model. */
export interface Take extends RecordingMeta {
  /** where it plays from: a file on a phone, a blob URL in a browser */
  uri: string;
}

/**
 * The microphone as a speaking exercise sees it, the same wherever it runs:
 * useRecorder.ts records in a browser, useRecorder.native.ts on a phone.
 */
export interface RecorderState {
  /** this device can record at all; where it cannot, the exercise offers only the skip */
  supported: boolean;
  permission: MicPermission;
  /** asking for the microphone, readying it, or keeping a take */
  busy: boolean;
  recording: boolean;
  durationMs: number;
  /** the last take, until another is started or `reset` lets it go */
  result: Take | null;
  /** what went wrong with the last try, when something did */
  failed: 'start' | 'save' | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  /** the system settings, where a refused microphone is allowed again; null where there are none to open */
  openSettings: (() => void) | null;
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
