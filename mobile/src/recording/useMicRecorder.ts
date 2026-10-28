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
 * The phone's microphone, for whatever records a take: a voice note
 * (library/VoiceRecorder) and a speaking exercise (lesson/useRecorder.native).
 *
 * It asks for the microphone only when record is pressed, and only then turns
 * the audio session over to recording. A take ends with `stop()`, at `maxMs`,
 * or when the app leaves the front (a call, the app switcher, the home
 * screen), so nothing goes on listening where nobody can see it. However it
 * ends, the session is back on playback before the take is handed over, and a
 * take with nobody left to receive it (the screen closed while it ran) is
 * deleted rather than left in the cache.
 *
 * HIGH_QUALITY records .m4a (audio/mp4), which is what the voice-note upload
 * declares.
 */

export type MicPermission = 'unknown' | 'granted' | 'denied';

/** A finished take: its file, and how long it ran. */
export interface MicTake {
  uri: string;
  durationMs: number;
}

/** How a press of record went: recording now, the microphone refused, or something else in the way. */
export type StartOutcome = 'recording' | 'denied' | 'failed';

export interface MicRecorder {
  /** the microphone permission as last found; 'unknown' until record is first pressed */
  permission: MicPermission;
  /** asking for the microphone, readying it, or finishing a take */
  busy: boolean;
  recording: boolean;
  /** how long the take under way has run */
  durationMs: number;
  start: () => Promise<StartOutcome>;
  stop: () => Promise<void>;
}

/** While a take runs: the microphone on, and sound still heard with the ring switch on silent. */
const RECORDING_MODE = { allowsRecording: true, playsInSilentMode: true } as const;

/**
 * After it, for whatever plays next: the take itself, the model, the next
 * exercise's clip. Not a bare `allowsRecording: false`: on iOS a field left out
 * goes back to its default, and `playsInSilentMode` defaults to off, so after
 * one take a lesson's sounds would go quiet behind the ring switch.
 */
export const PLAYBACK_MODE = { allowsRecording: false, playsInSilentMode: true } as const;

/**
 * The playback mode from the moment the app starts, not only after a first
 * take: a learning app's sounds are its lessons, and somebody whose phone is
 * on silent opened a lesson to hear the words. Failing to set it is no reason
 * to stop the app; the default plays everywhere but behind the ring switch.
 */
export async function prepareAudioSession(): Promise<void> {
  try {
    await setAudioModeAsync(PLAYBACK_MODE);
  } catch {
    // the platform's default mode stays
  }
}

/**
 * Whether the microphone has been refused for good: asking again would not
 * bring up the system's question, and only Settings can allow it now. Read
 * without asking, so nothing is shown to find out; not known reads as not
 * refused, and the question is asked when record is pressed.
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
    // never written, or already cleared with the cache
  }
}

export function useMicRecorder({
  maxMs,
  onStop,
}: {
  /** the longest a take may run; it stops there by itself */
  maxMs: number;
  /** a take has ended, however it ended; null when it could not be saved */
  onStop: (take: MicTake | null) => void;
}): MicRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // read ten times a second, so a running clock moves smoothly
  const status = useAudioRecorderState(recorder, 100);
  const [permission, setPermission] = useState<MicPermission>('unknown');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  const live = useRef(true);
  // a take under way, from record() until stop() has it
  const taking = useRef(false);
  const starting = useRef<Promise<StartOutcome> | null>(null);
  // the file the take under way is written to
  const file = useRef<string | null>(null);
  // the session was switched to recording and has not been switched back
  const switched = useRef(false);
  // refused, so coming back to the app is worth asking about again
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
      // nothing else to put back
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
      // read before stopping: iOS puts the clock back to nought when a take ends
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
    // a second press while the first is still asking is the same press
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
        // the preset named again, so each take gets a file of its own: without
        // it iOS writes every take over the last one's
        await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
        file.current = recorder.uri;
        // the screen closed while the microphone was being readied
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

  // the cap: the take stops there by itself
  useEffect(() => {
    if (recording && status.isRecording && status.durationMillis >= maxMs) void stop();
  }, [recording, status.isRecording, status.durationMillis, maxMs, stop]);

  // leaving the front ends the take; coming back finds out whether the
  // microphone has been allowed in Settings in the meantime, so record is
  // offered again without leaving the screen
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

  // the screen closing mid-take ends it the same way, and lets its file go
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
