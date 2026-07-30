import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Mic recording for speaking exercises (KUR-036). Uses MediaRecorder +
 * getUserMedia (present on Expo web); where unavailable at runtime (native
 * today), `supported` is false so the caller falls back to the skip path.
 * Native capture will bind to an Expo audio package alongside the real
 * scorer (KUR-120) — the exercise UI and grading don't change when it does.
 */
export type MicPermission = 'unknown' | 'granted' | 'denied';

// DOM types exist in the tsconfig lib; these globals are simply absent at
// runtime on native, which the `supported` guard handles.
function webApis() {
  const g = globalThis as typeof globalThis & {
    MediaRecorder?: typeof MediaRecorder;
    navigator?: Navigator;
  };
  const getUserMedia = g.navigator?.mediaDevices?.getUserMedia?.bind(g.navigator.mediaDevices);
  return { MediaRecorder: g.MediaRecorder, getUserMedia };
}

export interface RecorderResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface RecorderState {
  supported: boolean;
  permission: MicPermission;
  recording: boolean;
  durationMs: number;
  result: RecorderResult | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useRecorder(): RecorderState {
  const { MediaRecorder: Recorder, getUserMedia } = webApis();
  const supported = !!Recorder && !!getUserMedia && typeof Blob !== 'undefined';

  const [permission, setPermission] = useState<MicPermission>('unknown');
  const [recording, setRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [result, setResult] = useState<RecorderResult | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (!Recorder || !getUserMedia) return;
    let stream: MediaStream;
    try {
      stream = await getUserMedia({ audio: true });
      setPermission('granted');
    } catch {
      setPermission('denied');
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const rec = new Recorder(stream);
    rec.ondataavailable = (e: BlobEvent) => chunksRef.current.push(e.data);
    rec.onstop = () => {
      const mimeType = chunksRef.current[0]?.type || 'audio/mp4';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setResult({ blob, mimeType, durationMs: Date.now() - startedAtRef.current });
      cleanup();
      setRecording(false);
    };
    recRef.current = rec;
    startedAtRef.current = Date.now();
    setDurationMs(0);
    setResult(null);
    rec.start();
    setRecording(true);
    timerRef.current = setInterval(() => setDurationMs(Date.now() - startedAtRef.current), 100);
  }, [Recorder, getUserMedia, cleanup]);

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setDurationMs(0);
  }, []);

  return { supported, permission, recording, durationMs, result, start, stop, reset };
}
