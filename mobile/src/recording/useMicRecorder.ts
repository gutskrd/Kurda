import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

/**
 * The microphone, for voice notes (library/VoiceRecorder) and speaking exercises (lesson/useRecorder.native).
 *
 * Permission is asked and the audio session switched to recording only when record is pressed. A take ends on
 * `stop()`, at `maxMs`, or when the app leaves the foreground. The session is always back on playback before the
 * take is handed over, and a take nobody is left to receive is deleted. HIGH_QUALITY records .m4a (audio/mp4),
 * which the voice-note upload declares.
 */

export type MicPermission = 'unknown' | 'granted' | 'denied';

/** A finished take: its file, and how long it ran. */
export interface MicTake {
  uri: string;
  durationMs: number;
}

/** The result of pressing record: recording, permission refused, or another failure. */
export type StartOutcome = 'recording' | 'denied' | 'failed';

export interface MicRecorder {
  /** The microphone permission as last found; 'unknown' until record is first pressed. */
  permission: MicPermission;
  /** Asking for the microphone, readying it, or finishing a take. */
  busy: boolean;
  recording: boolean;
  /** How long the take under way has run. */
  durationMs: number;
  start: () => Promise<StartOutcome>;
  stop: () => Promise<void>;
}

/** While a take runs: the microphone on, and sound still heard with the ring switch on silent. */
const RECORDING_MODE = { allowsRecording: true, playsInSilentMode: true } as const;

/**
 * The playback mode restored after a take. It is set in full rather than as `allowsRecording: false`, because on
 * iOS an omitted field reverts to its default and `playsInSilentMode` defaults to off, which would mute lessons.
 */
export const PLAYBACK_MODE = { allowsRecording: false, playsInSilentMode: true } as const;

/**
 * Set the playback mode at startup so lessons play with the silent switch on. A failure is ignored; the default
 * still plays except behind the silent switch.
 */
export async function prepareAudioSession(): Promise<void> {
  try {
    await setAudioModeAsync(PLAYBACK_MODE);
  } catch {
    // The platform's default mode stays.
  }
}

/**
 * Whether microphone permission is denied for good, so only Settings can grant it. Read without prompting;
 * unknown counts as not denied, and the prompt comes when record is pressed.
 */
export async function micRefused(): Promise<boolean> {
  try {
    const answer = await getRecordingPermissionsAsync();
    return !answer.granted && !answer.canAskAgain;
  } catch {
    return false;
  }
}

/** Delete a take's file: only ever a file on this device, and quietly when it has already gone. */
export async function discardRecording(uri: string | null | undefined): Promise<void> {
  if (!uri?.startsWith('file:')) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Never written, or already cleared with the cache.
  }
}

export function useMicRecorder({
  maxMs,
  onStop,
}: {
  /** The longest a take may run; it stops there by itself. */
  maxMs: number;
  /** A take has ended, however it ended; null when it could not be saved. */
  onStop: (take: MicTake | null) => void;
}): MicRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // Read ten times a second, so a running clock moves smoothly.
  const status = useAudioRecorderState(recorder, 100);
  const [permission, setPermission] = useState<MicPermission>('unknown');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  const live = useRef(true);
  // A take under way, from record() until stop() has it.
  const taking = useRef(false);
  const starting = useRef<Promise<StartOutcome> | null>(null);
  // The file the take under way is written to.
  const file = useRef<string | null>(null);
  // The session was switched to recording and not yet switched back.
  const switched = useRef(false);
  // Refused, so coming back to the app is worth asking about again.
  const denied = useRef(false);
  const handOver = useRef(onStop);
  useEffect(() => {
    handOver.current = onStop;
  }, [onStop]);

  const restore = useCallback(async () => {
    if (!switched.current) return;
    switched.current = false;
    try {
      await setAudioModeAsync(PLAYBACK_MODE);
    } catch {
      // Nothing else to put back.
    }
  }, []);

  /** Give up on a take that never properly started: the session back, its file gone. */
  const abandon = useCallback(async () => {
    await restore();
    void discardRecording(file.current);
    file.current = null;
  }, [restore]);

  const stop = useCallback(async () => {
    if (!taking.current) return;
    taking.current = false;
    const written = file.current;
    file.current = null;
    setBusy(true);
    let take: MicTake | null = null;
    try {
      // Read before stopping: iOS puts the clock back to nought when a take ends.
      const durationMs = recorder.getStatus().durationMillis;
      await recorder.stop();
      const uri = recorder.uri ?? written;
      take = uri ? { uri, durationMs } : null;
    } catch {
      take = null;
    }
    await restore();
    if (!live.current) {
      void discardRecording(take?.uri ?? written);
      return;
    }
    if (!take) void discardRecording(written);
    setBusy(false);
    setRecording(false);
    handOver.current(take);
  }, [recorder, restore]);

  const start = useCallback((): Promise<StartOutcome> => {
    if (taking.current) return Promise.resolve('recording');
    // A second press while the first is still asking is the same press.
    if (starting.current) return starting.current;
    const run = async (): Promise<StartOutcome> => {
      setBusy(true);
      try {
        const answer = await requestRecordingPermissionsAsync();
        denied.current = !answer.granted;
        setPermission(answer.granted ? 'granted' : 'denied');
        if (!answer.granted) return 'denied';
        await setAudioModeAsync(RECORDING_MODE);
        switched.current = true;
        // Pass the preset again so each take gets its own file; without it iOS overwrites the previous take.
        await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
        file.current = recorder.uri;
        // The screen closed while the microphone was being prepared.
        if (!live.current) {
          await abandon();
          return 'failed';
        }
        recorder.record();
        taking.current = true;
        setRecording(true);
        return 'recording';
      } catch {
        await abandon();
        return 'failed';
      } finally {
        starting.current = null;
        setBusy(false);
      }
    };
    starting.current = run();
    return starting.current;
  }, [recorder, abandon]);

  // The cap: the take stops there by itself.
  useEffect(() => {
    if (recording && status.isRecording && status.durationMillis >= maxMs) void stop();
  }, [recording, status.isRecording, status.durationMillis, maxMs, stop]);

  // Leaving the foreground ends the take; returning rechecks the permission, in case it was granted in Settings.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        void stop();
        return;
      }
      if (!denied.current) return;
      void getRecordingPermissionsAsync().then(
        (answer) => {
          if (!answer.granted) return;
          denied.current = false;
          setPermission('granted');
        },
        () => undefined,
      );
    });
    return () => sub?.remove();
  }, [stop]);

  // The screen closing mid-take ends it the same way, and lets its file go.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      void stop();
    };
  }, [stop]);

  return {
    permission,
    busy,
    recording,
    durationMs: recording && status.isRecording ? status.durationMillis : 0,
    start,
    stop,
  };
}
