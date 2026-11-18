/**
 * Speaking recordings. The thresholds and the check live in @kurda/shared (lesson-answers.ts), so the website turns
 * away the same recordings; this adds the phone's words for them and the take an exercise works with.
 */
import { recordingProblem } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { MicPermission } from '../recording/useMicRecorder';

export type { MicPermission };

/** A take's length limit: a phrase, not a speech (the website stops at the same length). */
export const MAX_TAKE_MS = 15_000;

interface RecordingMeta {
  durationMs: number;
  byteSize: number;
}

/** A take, kept on the device to be heard beside the model. */
export interface Take extends RecordingMeta {
  /** Where it plays from: a file on a phone, a blob URL in a browser. */
  uri: string;
}

/** The microphone as a speaking exercise sees it: useRecorder.ts in a browser, useRecorder.native.ts on a phone. */
export interface RecorderState {
  /** This device can record; where it cannot, the exercise offers only the skip. */
  supported: boolean;
  permission: MicPermission;
  /** Asking for the microphone, readying it, or keeping a take. */
  busy: boolean;
  recording: boolean;
  durationMs: number;
  /** The last take, until another starts or `reset` releases it. */
  result: Take | null;
  /** What went wrong with the last try, if anything. */
  failed: 'start' | 'save' | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  /** Opens the system settings to allow a refused microphone; null where there are none. */
  openSettings: (() => void) | null;
}

/** Why a recording was rejected, or null if fine. A key rather than a sentence, so the module stays pure and the screen translates. */
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
