import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The microphone for a speaking exercise: asked only when Record is tapped, the take kept in memory, the microphone
 * released as soon as it stops. Each failure is its own state because each needs a different answer: no recorder (skip),
 * refused permission (allow it in the address bar), no microphone, or anything else.
 */
export type RecorderPhase = 'idle' | 'asking' | 'recording' | 'denied' | 'noMic' | 'failed';

export interface Take {
  blob: Blob;
  durationMs: number;
}

/** A take stops here: a phrase, not a speech, and a small upload. */
const MAX_TAKE_MS = 15_000;

/**
 * The recording type to ask for. The server accepts WebM, MP4 or MP3 (MEDIA_AUDIO_ALLOWED_TYPES), and some browsers
 * record Ogg unless asked, so WebM is asked for where supported and MP4 otherwise; undefined leaves the browser's choice.
 */
function recordingType(): string | undefined {
  const can = (t: string): boolean => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t);
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(can);
}

export function recorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

export function useRecorder(): {
  phase: RecorderPhase;
  take: Take | null;
  start: () => Promise<void>;
  stop: () => void;
} {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [take, setTake] = useState<Take | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const live = useRef(true);

  const release = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // Leaving mid-take stops recording and releases the microphone.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
      release();
    };
  }, [release]);

  const start = useCallback(async () => {
    if (!recorderSupported()) {
      setPhase('failed');
      return;
    }
    setPhase('asking');
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (!live.current) return;
      const name = err instanceof DOMException ? err.name : '';
      setPhase(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' ? 'noMic' : 'failed');
      return;
    }
    if (!live.current) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    stream.current = media;
    const chunks: Blob[] = [];
    let rec: MediaRecorder;
    try {
      const mimeType = recordingType();
      rec = mimeType ? new MediaRecorder(media, { mimeType }) : new MediaRecorder(media);
    } catch {
      release();
      setPhase('failed');
      return;
    }
    recorder.current = rec;
    const started = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      release();
      recorder.current = null;
      if (!live.current) return;
      setTake({ blob: new Blob(chunks, { type: rec.mimeType || chunks[0]?.type || 'audio/webm' }), durationMs: Date.now() - started });
      setPhase('idle');
    };
    setTake(null);
    try {
      rec.start();
    } catch {
      // A recorder that will not start is a failure to report, never a permanent "waiting for the microphone".
      recorder.current = null;
      release();
      setPhase('failed');
      return;
    }
    setPhase('recording');
    timer.current = window.setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, MAX_TAKE_MS);
  }, [release]);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  return { phase, take, start, stop };
}
