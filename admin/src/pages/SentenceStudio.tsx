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
  /** the stored timeline; null for none, left out while it is not known here */
  lipsync?: LipsyncData | null;
  /** whether a timeline is stored, when the timeline itself has not been read */
  hasLipsync?: boolean;
}

/** Where a sentence's recording is sent: the lesson-audio store, filed under the text itself. */
export function sentenceRecordPath(text: string): string {
  return `/admin/lesson-audio?text=${encodeURIComponent(text)}`;
}

/**
 * The studio for one Kurdish sentence, wherever it is recorded from: who says
 * it (the picker, and the character saying the saved take), then the recorder
 * (record, upload a file, hear it back, save, replace, remove). The lesson
 * studio opens one under each row; the story editor opens one under each of
 * a story's sentences. Both save to the same store the same way — the WAV
 * goes up with the speaker and a mouth timeline made from it (voice.ts) — so
 * a sentence recorded in either place is the one recording the apps play.
 *
 * Removing asks first in the words `removePrompt` gives. A lesson's listening
 * item may play this very recording as its clip: when the server says so
 * (LISTENING_AUDIO_IN_USE) the editor is asked again with what the server
 * knows, and `listeningNeedsIt` skips that second question when the first
 * already said it.
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
  /** the recording's key in the store, for a removal */
  recordKey: string;
  /** where a new take is sent; the lesson store under the text unless the caller files it elsewhere */
  path?: string;
  recording: SentenceRecording | null;
  /** who says it: the saved take's character, or the pick for a new one */
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
  /** something to say above the picker: a conversation line's note */
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
            // the stored timeline; none when the list said there is none; not known when it said nothing
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
            // the prompt the editor just confirmed already said what a listening item loses
            await remove(listeningNeedsIt);
          } catch (err) {
            // a lesson published since the list was loaded: ask again, with what the server knows
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
