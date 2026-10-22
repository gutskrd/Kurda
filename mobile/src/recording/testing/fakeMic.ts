import { useEffect, useState } from 'react';

/**
 * expo-audio's recorder and expo-file-system's file calls, for the tests of
 * what records a take: a speaking exercise and a voice note.
 *
 * The microphone answers as the test says (`mic.answer`), every audio mode
 * set is kept in order (`mic.modes`), and a take runs on the test's clock
 * (`mic.recorder.run(ms)`) rather than a real one. As on an iPhone, a take's
 * clock goes back to nought the moment it stops, so a duration read after
 * stopping is caught out. Each take is written to a file of its own, which
 * `mic.files` holds until something deletes it.
 *
 * Wired with `vi.mock('expo-audio', () => import('…/recording/testing/fakeMic'))`
 * and the same for 'expo-file-system/legacy'.
 */

interface Permission {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied';
  expires: 'never';
}

export const GRANTED: Permission = { granted: true, canAskAgain: true, status: 'granted', expires: 'never' };
export const DENIED: Permission = { granted: false, canAskAgain: false, status: 'denied', expires: 'never' };

export class FakeRecorder {
  uri: string | null = null;
  private on = false;
  private ms = 0;
  private readonly listeners = new Set<() => void>();

  async prepareToRecordAsync(options?: unknown): Promise<void> {
    if (mic.failToPrepare) throw new Error('the microphone is in use');
    mic.prepared.push(options);
    mic.takes += 1;
    this.uri = `file:///cache/Audio/take-${mic.takes}.m4a`;
    mic.files.set(this.uri, mic.nextSize);
    mic.calls.push('prepare');
  }

  record(): void {
    this.on = true;
    this.ms = 0;
    mic.calls.push('record');
    this.emit();
  }

  async stop(): Promise<void> {
    this.on = false;
    this.ms = 0;
    mic.calls.push('stop');
    this.emit();
  }

  getStatus(): { canRecord: boolean; isRecording: boolean; durationMillis: number; mediaServicesDidReset: boolean; url: string | null } {
    return { canRecord: true, isRecording: this.on, durationMillis: this.ms, mediaServicesDidReset: false, url: this.uri };
  }

  /** the take goes on for `ms` more */
  run(ms: number): void {
    this.ms += ms;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export const mic = {
  /** what a request for the microphone is answered with */
  answer: GRANTED,
  /** what asking again later finds (Settings visited in the meantime); `answer` when unset */
  later: null as Permission | null,
  /** every audio mode set, in order */
  modes: [] as Array<Record<string, unknown>>,
  /** what the recorder was asked, in order: ask, prepare, record, stop */
  calls: [] as string[],
  /** the options each take was readied with */
  prepared: [] as unknown[],
  /** the take files on the device, and their size in bytes */
  files: new Map<string, number>(),
  deleted: [] as string[],
  takes: 0,
  /** how big the next take's file turns out */
  nextSize: 24_000,
  failToPrepare: false,
  /** the recorder the component under test made */
  recorder: null as FakeRecorder | null,
  reset(): void {
    mic.answer = GRANTED;
    mic.later = null;
    mic.modes = [];
    mic.calls = [];
    mic.prepared = [];
    mic.files = new Map();
    mic.deleted = [];
    mic.takes = 0;
    mic.nextSize = 24_000;
    mic.failToPrepare = false;
    mic.recorder = null;
  },
};

// expo-audio

export const RecordingPresets = { HIGH_QUALITY: { extension: '.m4a' } };

export async function requestRecordingPermissionsAsync(): Promise<Permission> {
  mic.calls.push('ask');
  return mic.answer;
}

export async function getRecordingPermissionsAsync(): Promise<Permission> {
  return mic.later ?? mic.answer;
}

export async function setAudioModeAsync(mode: Record<string, unknown>): Promise<void> {
  mic.modes.push(mode);
}

export function useAudioRecorder(): FakeRecorder {
  const [recorder] = useState(() => new FakeRecorder());
  mic.recorder = recorder;
  return recorder;
}

/** The recorder's state, read whenever it changes (the real hook polls for it). */
export function useAudioRecorderState(recorder: FakeRecorder): ReturnType<FakeRecorder['getStatus']> {
  const [, redraw] = useState(0);
  useEffect(() => recorder.subscribe(() => redraw((n) => n + 1)), [recorder]);
  return recorder.getStatus();
}

// expo-file-system/legacy

export async function getInfoAsync(uri: string): Promise<{ exists: true; size: number } | { exists: false }> {
  const size = mic.files.get(uri);
  return size === undefined ? { exists: false } : { exists: true, size };
}

export async function deleteAsync(uri: string): Promise<void> {
  mic.files.delete(uri);
  mic.deleted.push(uri);
}
