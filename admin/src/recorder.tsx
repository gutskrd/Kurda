import { useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import { ClipError, prepare, type Clip } from './audioClip';
import { allowMicHowTo, micPermission, micPlatform, micProblem, startCapture, type Capture } from './micCapture';
import { useDialogs } from './ui/Dialog';
import { Icon } from './ui/icons';

/** A recording already saved on the server. */
export interface SavedClip {
  url: string;
  durationMs: number | null;
  updatedAt: string | null;
}

type Phase =
  | { name: 'idle' }
  | { name: 'starting' }
  | { name: 'recording'; started: number }
  | { name: 'working' }
  | { name: 'ready'; clip: Clip }
  | { name: 'saving'; clip: Clip };

/**
 * Record → stop → hear it back → save, or take a file instead: the one
 * recorder the audio studio has, for a letter and for a lesson sentence alike.
 *
 * Every take goes through the same pipeline (audioClip.ts): trimmed, levelled
 * and encoded as a short mono WAV before the editor hears it, so what they
 * approve is exactly what is saved. The microphone side (micCapture.ts) works
 * the same on a laptop, an Android phone and an iPhone. The parent does the
 * upload; this only hands it the WAV.
 *
 * With `shortcuts`, R records and stops, Space plays the take back, Enter
 * saves and the arrows move between items — none of them while the editor is
 * typing in a field. Only one recorder on a page should have them.
 */
export function ClipRecorder({
  say,
  maxSeconds,
  what,
  recording,
  onSave,
  onRemove,
  removePrompt,
  onPrev,
  onNext,
  shortcuts = false,
}: {
  /** the text being recorded, as the editor sees it */
  say: string;
  maxSeconds: number;
  /** how errors name the thing to say: "one letter or one word", "one sentence" */
  what: string;
  recording: SavedClip | null;
  /** store the WAV; throw (an ApiError, ideally) to keep the take and say why */
  onSave: (wav: Uint8Array) => Promise<void>;
  /** remove the saved recording, once the editor has confirmed `removePrompt` */
  onRemove?: () => Promise<void>;
  removePrompt: string;
  onPrev?: () => void;
  onNext?: () => void;
  shortcuts?: boolean;
}): React.JSX.Element {
  const dialogs = useDialogs();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [problem, setProblem] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const capture = useRef<Capture | null>(null);
  const frame = useRef(0);
  const stopTimer = useRef<number | null>(null);
  const preview = useRef<HTMLAudioElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // a raw take may start and end with silence; it is trimmed to maxSeconds afterwards,
  // and a file over 30 s is refused before it is decoded
  const maxTakeMs = Math.min(maxSeconds * 2, 28) * 1000;
  const platform = typeof navigator === 'undefined' ? 'other' : micPlatform(navigator.userAgent, navigator.maxTouchPoints);

  // if the microphone is already refused for this site, say how to allow it before a press fails
  useEffect(() => {
    let alive = true;
    void micPermission().then((state) => {
      if (alive) setBlocked(state === 'denied');
    });
    return () => {
      alive = false;
    };
  }, []);

  // let go of a preview URL once it is no longer shown
  const previewUrl = phase.name === 'ready' || phase.name === 'saving' ? phase.clip.url : null;
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  // and of the microphone, if the editor moves on mid-take
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
      capture.current?.cancel();
      capture.current = null;
    },
    [],
  );

  const process = async (data: ArrayBuffer): Promise<void> => {
    setPhase({ name: 'working' });
    try {
      const ready = await prepare(data, maxSeconds, what);
      setPhase({ name: 'ready', clip: ready });
      // hear it straight away: that is the moment to judge it (a phone may refuse to play unasked; the player is there)
      requestAnimationFrame(() => void preview.current?.play().catch(() => undefined));
    } catch (err) {
      setProblem(err instanceof ClipError ? err.message : 'Could not read that recording.');
      setPhase({ name: 'idle' });
    }
  };

  const record = async (): Promise<void> => {
    setProblem(null);
    setPhase({ name: 'starting' });
    let take: Capture;
    try {
      take = await startCapture();
    } catch (err) {
      setProblem(micProblem(err, platform, typeof window === 'undefined' || window.isSecureContext !== false));
      setBlocked((err as { name?: string })?.name === 'NotAllowedError');
      setPhase({ name: 'idle' });
      return;
    }
    capture.current = take;
    setBlocked(false);
    const started = performance.now();
    const tick = (): void => {
      setLevel(take.level());
      setElapsed(performance.now() - started);
      frame.current = requestAnimationFrame(tick);
    };
    tick();
    setPhase({ name: 'recording', started });
    stopTimer.current = window.setTimeout(() => void stop(), maxTakeMs);
  };

  const stop = async (): Promise<void> => {
    const take = capture.current;
    if (!take) return;
    capture.current = null;
    cancelAnimationFrame(frame.current);
    if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
    setLevel(0);
    setPhase({ name: 'working' });
    try {
      await process(await take.stop());
    } catch {
      setProblem('The recording could not be read. Press Record again.');
      setPhase({ name: 'idle' });
    }
  };

  const upload = async (file: File): Promise<void> => {
    setProblem(null);
    await process(await file.arrayBuffer());
  };

  const save = async (): Promise<void> => {
    if (phase.name !== 'ready') return;
    const ready = phase.clip;
    setPhase({ name: 'saving', clip: ready });
    try {
      await onSave(ready.wav);
      // the parent usually moves on to the next item, which mounts a fresh
      // recorder; when it stays here (nothing left to record), show the saved one
      setPhase({ name: 'idle' });
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save it. Try again.');
      setPhase({ name: 'ready', clip: ready });
    }
  };

  const remove = async (): Promise<void> => {
    if (!recording || !onRemove) return;
    const [title, ...rest] = removePrompt.split('\n\n');
    const yes = await dialogs.confirm({ title: title ?? 'Remove the recording?', body: rest.join('\n\n'), confirmLabel: 'Remove', tone: 'danger' });
    if (!yes) return;
    try {
      await onRemove();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not remove it.');
    }
  };

  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"]')) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (phase.name === 'recording') void stop();
        else if (phase.name === 'idle' || phase.name === 'ready') void record();
      } else if (e.key === 'Enter' && phase.name === 'ready') {
        e.preventDefault();
        void save();
      } else if (e.key === ' ' && phase.name === 'ready') {
        e.preventDefault();
        void preview.current?.play();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && phase.name === 'idle' && onNext) {
        e.preventDefault();
        onNext();
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && phase.name === 'idle' && onPrev) {
        e.preventDefault();
        onPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const seconds = Math.min(elapsed, maxTakeMs) / 1000;
  const busy = phase.name === 'working' || phase.name === 'saving' || phase.name === 'starting';

  return (
    <div className="rec" role="group" aria-label={`Record “${say}”`}>
      {recording && phase.name === 'idle' && (
        <div className="aa-current">
          <audio controls src={recording.url} preload="none" />
          <div className="rec-saved">
            <span className="subtle">
              {recording.updatedAt ? `Saved ${new Date(recording.updatedAt).toLocaleDateString()}` : 'Saved'}
              {recording.durationMs ? ` · ${(recording.durationMs / 1000).toFixed(1)} s` : ''}
            </span>
            {onRemove && (
              <button type="button" className="danger" onClick={() => void remove()}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}

      {blocked && phase.name === 'idle' && !problem && (
        <p className="rec-hint" role="note">
          The microphone is turned off for this site. {allowMicHowTo(platform)}
        </p>
      )}

      {phase.name === 'recording' && (
        <div className="aa-live" role="status">
          <span className="aa-rec-dot" aria-hidden="true" />
          <span>Recording… {seconds.toFixed(1)} s</span>
          <div className="aa-meter" aria-hidden="true">
            <div style={{ width: `${Math.min(100, level * 140)}%` }} />
          </div>
        </div>
      )}

      {phase.name === 'starting' && <div className="subtle aa-live">Starting the microphone…</div>}
      {phase.name === 'working' && <div className="subtle aa-live" role="status">Trimming and levelling…</div>}

      {(phase.name === 'ready' || phase.name === 'saving') && (
        <div className="aa-preview">
          <div className="aa-say-label">Listen back · {phase.clip.seconds.toFixed(1)} s</div>
          <audio ref={preview} controls src={phase.clip.url} playsInline />
        </div>
      )}

      {problem && (
        <div className="field-error aa-problem" role="alert">
          {problem}
        </div>
      )}

      <div className="aa-actions">
        {phase.name === 'recording' ? (
          <button type="button" className="primary aa-big" onClick={() => void stop()}>
            <Icon name="stop" />
            Stop
          </button>
        ) : phase.name === 'ready' || phase.name === 'saving' ? (
          <>
            <button type="button" className="primary aa-big" onClick={() => void save()} disabled={phase.name === 'saving'}>
              <Icon name="check" />
              {phase.name === 'saving' ? 'Saving…' : recording ? 'Save, replacing the old one' : 'Save'}
            </button>
            <button type="button" onClick={() => void record()} disabled={phase.name === 'saving'}>
              <Icon name="mic" />
              Record again
            </button>
          </>
        ) : (
          <button type="button" className="primary aa-big" onClick={() => void record()} disabled={busy}>
            <Icon name="mic" />
            {recording ? 'Record a new one' : 'Record'}
          </button>
        )}
        {phase.name !== 'recording' && (
          <>
            <button type="button" className="ghost" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Icon name="upload" />
              Upload a file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void upload(f);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** The keys, for a page that turns them on. */
export function ShortcutHint({ moves = 'previous / next' }: { moves?: string }): React.JSX.Element {
  return (
    <p className="aa-keys">
      <kbd>R</kbd> record / stop · <kbd>Space</kbd> listen · <kbd>Enter</kbd> save · <kbd>↑</kbd>
      <kbd>↓</kbd> {moves}
    </p>
  );
}
