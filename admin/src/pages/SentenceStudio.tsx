import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LESSON_AUDIO_MAX_SECONDS, type LipsyncData, type SpeakerId } from '@kurda/shared';
import { api, ApiError } from '../api';
import type { Saved } from '../lessonAudio';
import { ClipRecorder } from '../recorder';
import type { useDialogs } from '../ui';
import { SpeakerPicker } from '../ui/SpeakerPicker';
import { SpeakingPreview } from '../ui/SpeakingPreview';
import { uploadWithVoice, type Speaker } from '../voice';

/** A sentence's recording as the studio knows it: the file, who says it, and the mouth timeline when it is known here. */
export interface SentenceRecording {
  url: string;
  durationMs: number | null;
  updatedAt: string | null;
  speaker: SpeakerId | null;
  /** The stored timeline; null for none, left out while it is not known here. */
  lipsync?: LipsyncData | null;
  /** Whether a timeline is stored, when the timeline itself has not been read. */
  hasLipsync?: boolean;
}

/** Where a sentence's recording is sent: the lesson-audio store, filed under the text itself. */
export function sentenceRecordPath(text: string): string {
  return `/admin/lesson-audio?text=${encodeURIComponent(text)}`;
}

/**
 * The studio for one Kurdish sentence, in the lesson studio and the story editor alike: who says it, then the recorder.
 * Both save the same way (voice.ts), so either place makes the one recording the apps play. When the server says a
 * listening item plays this recording (LISTENING_AUDIO_IN_USE), a removal asks again, unless `listeningNeedsIt` said so.
 */
export function SentenceStudio({
  text,
  recordKey,
  path = sentenceRecordPath(text),
  recording,
  speaker,
  speakerHint,
  onSpeaker,
  onSaved,
  onRemoved,
  removePrompt,
  listeningNeedsIt = false,
  confirm,
  shortcuts = false,
  onPrev,
  onNext,
  children,
}: {
  text: string;
  /** The recording's key in the store, for a removal. */
  recordKey: string;
  /** Where a new take is sent; the lesson store under the text unless the caller files it elsewhere. */
  path?: string;
  recording: SentenceRecording | null;
  /** Who says it: the saved take's character, or the pick for a new one. */
  speaker: Speaker;
  speakerHint?: ReactNode;
  onSpeaker: (speaker: Speaker) => void;
  onSaved: (saved: Saved) => void;
  onRemoved: () => void;
  removePrompt: string;
  listeningNeedsIt?: boolean;
  confirm: ReturnType<typeof useDialogs>['confirm'];
  shortcuts?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  /** Something to say above the picker: a conversation line's note. */
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="la-studio">
      {children}
      <div className="voice-row">
        <SpeakerPicker value={speaker} onChange={onSpeaker} hint={speakerHint ?? (recording ? 'Changed as soon as you choose.' : 'Saved with the recording, and kept for the next one.')} />
        {recording?.speaker && (
          <SpeakingPreview
            key={`${recording.url}|${recording.speaker}`}
            speaker={recording.speaker}
            url={recording.url}
            text={text}
            // The stored timeline; none when the list said there is none; not known when it said nothing.
            lipsync={recording.lipsync ?? (recording.hasLipsync === false ? null : undefined)}
            durationMs={recording.durationMs}
          />
        )}
      </div>
      <ClipRecorder
        say={text}
        maxSeconds={LESSON_AUDIO_MAX_SECONDS}
        what="one sentence"
        recording={recording ? { url: recording.url, durationMs: recording.durationMs, updatedAt: recording.updatedAt } : null}
        shortcuts={shortcuts}
        onPrev={onPrev}
        onNext={onNext}
        onSave={async (wav) => {
          const res = await uploadWithVoice<Saved>(path, wav, { speaker, text });
          onSaved({ ...res, key: recordKey });
        }}
        removePrompt={removePrompt}
        onRemove={async () => {
          const remove = (force: boolean) => api(`/admin/lesson-audio?key=${encodeURIComponent(recordKey)}${force ? '&force=1' : ''}`, { method: 'DELETE' });
          try {
            // The prompt the editor just confirmed already said what a listening item loses.
            await remove(listeningNeedsIt);
          } catch (err) {
            // A lesson published since the list was loaded: ask again, with what the server knows.
            if (!(err instanceof ApiError && err.code === 'LISTENING_AUDIO_IN_USE')) throw err;
            const yes = await confirm({ title: 'A listening item plays this', body: err.message, confirmLabel: 'Remove anyway', tone: 'danger' });
            if (!yes) return;
            await remove(true);
          }
          onRemoved();
        }}
      />
    </div>
  );
}

export interface Player {
  playing: string | null;
  toggle: (url: string) => void;
}

/** One audio element for a whole list, so starting a row stops the last one. */
export function usePlayer(): Player {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );
  const toggle = (url: string): void => {
    const el = (audio.current ??= new Audio());
    if (playing === url && !el.paused) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.onended = () => setPlaying(null);
    el.onerror = () => setPlaying(null);
    el.src = url;
    setPlaying(url);
    void el.play().catch(() => setPlaying(null));
  };
  return { playing, toggle };
}
