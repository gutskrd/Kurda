import { useState } from 'react';
import { storyTextDirection } from '@kurda/shared';
import type { Saved } from '../lessonAudio';
import type { AdminStory, StorySentenceAudio } from '../stories';
import { Banner, Icon, useDialogs } from '../ui';
import { bustUrl, speakerName, useSpeakerChange } from '../ui/SpeakerPicker';
import { rememberSpeaker, rememberedSpeaker, type Speaker } from '../voice';
import { SentenceStudio, usePlayer } from './SentenceStudio';
import { EditorSection } from './StoryEditorFields';
import { storyRecordHref } from './StoryList';

type StoryAudio = AdminStory['audio'];

/** A recording's length as the recorder shows it: "1.2 s". */
function clipSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** The story's recordings after a sentence was saved: the row recorded, with what the server stored. */
export function withSentenceRecording(audio: StoryAudio, saved: Saved): StoryAudio {
  const sentences = audio.sentences.map((s) =>
    s.key === saved.key ? { ...s, recorded: true, url: saved.url, durationMs: saved.durationMs, updatedAt: saved.updatedAt, speaker: saved.speaker ?? null } : s,
  );
  return { ...audio, sentences, recorded: sentences.filter((s) => s.recorded).length };
}

/** The story's recordings after one was removed: the row back to missing. */
export function withoutSentenceRecording(audio: StoryAudio, key: string): StoryAudio {
  const sentences = audio.sentences.map((s) =>
    s.key === key ? { paragraph: s.paragraph, sentence: s.sentence, text: s.text, key: s.key, recorded: false, speaker: null } : s,
  );
  return { ...audio, sentences, recorded: sentences.filter((s) => s.recorded).length };
}

/** Who says a sentence, changed on screen before the server has answered. */
export function withSentenceSpeaker(audio: StoryAudio, key: string, speaker: Speaker): StoryAudio {
  return { ...audio, sentences: audio.sentences.map((s) => (s.key === key ? { ...s, speaker } : s)) };
}

/**
 * The story's sentences in reading order, each with its recording, and a
 * studio under the one that is open: record, upload a file, hear it back,
 * save (replacing an old take), remove. The same store and the same studio as
 * the audio studio's "Record story sentences" side, which stays a link away
 * for recording several stories in a row. The sentences are the saved text's:
 * what the reader cuts, which an unsaved edit has not reached yet.
 */
export function AudioSection({
  story,
  textChanged,
  onAudio,
}: {
  story: AdminStory | null;
  /** the text has unsaved changes, so the sentences here may not be the ones on screen */
  textChanged: boolean;
  onAudio: (next: StoryAudio) => void;
}): React.JSX.Element {
  const dialogs = useDialogs();
  const player = usePlayer();
  const [open, setOpen] = useState<string | null>(null);
  // who says the next new recording: the last choice made for one
  const [nextSpeaker, setNextSpeaker] = useState<Speaker>(rememberedSpeaker);
  const changeSpeaker = useSpeakerChange('lesson', (key, speaker) => {
    if (story) onAudio(withSentenceSpeaker(story.audio, key, speaker));
  });

  if (!story) {
    return (
      <EditorSection id="audio" title="Audio">
        <p className="subtle st-hint">Save the story first: its sentences are recorded from the saved text, as the reader will cut it.</p>
      </EditorSection>
    );
  }

  const { audio } = story;
  const script = storyTextDirection(story.dialect);
  const archived = story.status === 'archived';
  const move = (step: number): void => {
    const at = audio.sentences.findIndex((s) => s.key === open);
    const next = audio.sentences[Math.max(0, Math.min(audio.sentences.length - 1, at + step))];
    if (next) setOpen(next.key);
  };

  return (
    <EditorSection
      id="audio"
      title="Audio"
      count={audio.total > 0 ? `(${audio.recorded} of ${audio.total} sentences recorded)` : undefined}
      tools={
        !archived ? (
          <a className="button-link" href={storyRecordHref(story.id)}>
            <Icon name="mic" />
            Open in the audio studio
          </a>
        ) : undefined
      }
      hint="Each sentence is recorded on its own and played where the reader highlights it. A story with every sentence recorded can be listened to from start to end; a sentence recorded here is the recording the audio studio shows too."
    >
      {textChanged && (
        <Banner tone="warn" title="The text has unsaved changes.">
          These are the sentences of the text as it was last saved. Save, and the list follows the new text.
        </Banner>
      )}
      {audio.total === 0 ? (
        <p className="subtle">No sentence to record yet: write the text and save it.</p>
      ) : (
        <>
          <div className="progress" role="progressbar" aria-label="Sentences recorded" aria-valuemin={0} aria-valuemax={audio.total} aria-valuenow={audio.recorded}>
            <div className="progress-bar" style={{ width: `${(audio.recorded / audio.total) * 100}%` }} />
          </div>
          <ol className="st-audio">
            {audio.sentences.map((s) => (
              <SentenceRow
                key={s.key}
                sentence={s}
                script={script}
                open={open === s.key}
                playing={player.playing}
                onPlay={() => s.url && player.toggle(s.url)}
                onToggle={() => setOpen(open === s.key ? null : s.key)}
                studio={
                  open === s.key && !archived ? (
                    <SentenceStudio
                      text={s.text}
                      recordKey={s.key}
                      recording={s.recorded && s.url ? { url: s.url, durationMs: s.durationMs ?? null, updatedAt: s.updatedAt ?? null, speaker: s.speaker ?? null } : null}
                      speaker={s.recorded ? (s.speaker ?? null) : nextSpeaker}
                      onSpeaker={(speaker) => {
                        if (s.recorded) changeSpeaker({ key: s.key, from: s.speaker ?? null, to: speaker, label: s.text });
                        else {
                          setNextSpeaker(speaker);
                          rememberSpeaker(speaker);
                        }
                      }}
                      onSaved={(saved) => onAudio(withSentenceRecording(story.audio, saved))}
                      onRemoved={() => onAudio(withoutSentenceRecording(story.audio, s.key))}
                      removePrompt={`Remove the recording of “${s.text}”?\n\nThe story goes without a recording of this sentence until a new one is saved, and so does any lesson that uses the same sentence.`}
                      confirm={dialogs.confirm}
                      shortcuts
                      onPrev={() => move(-1)}
                      onNext={() => move(1)}
                    />
                  ) : null
                }
              />
            ))}
          </ol>
        </>
      )}
    </EditorSection>
  );
}

function SentenceRow({
  sentence: s,
  script,
  open,
  playing,
  onPlay,
  onToggle,
  studio,
}: {
  sentence: StorySentenceAudio;
  script: { lang: string; dir: 'ltr' | 'rtl' };
  open: boolean;
  playing: string | null;
  onPlay: () => void;
  onToggle: () => void;
  studio: React.ReactNode;
}): React.JSX.Element {
  return (
    <li className={`la-row st-audio-row${open ? ' is-on' : ''}`}>
      <div className="la-row-line">
        <button
          type="button"
          className="ghost la-play"
          onClick={onPlay}
          disabled={!s.url}
          aria-label={s.url ? `Play “${s.text}”` : 'No recording yet'}
          title={s.url ? 'Play' : 'No recording yet'}
        >
          <Icon name={s.url && playing === s.url ? 'stop' : 'play'} size={16} />
        </button>
        <button type="button" className="ghost la-row-main" onClick={onToggle} aria-expanded={open}>
          <span className="subtle st-audio-where">
            Paragraph {s.paragraph + 1} · sentence {s.sentence + 1}
          </span>
          <span className="la-text st-audio-text" lang={script.lang} dir={script.dir}>
            {s.text}
          </span>
        </button>
        {s.recorded && s.speaker && (
          <img className="voice-tag" src={bustUrl(s.speaker)} width={28} height={28} alt={`Said by ${speakerName(s.speaker)}`} title={`Said by ${speakerName(s.speaker)}`} />
        )}
        <span className={`badge${s.recorded ? ' ok' : ' mid'}`}>{s.recorded ? `Recorded${s.durationMs ? ` · ${clipSeconds(s.durationMs)}` : ''}` : 'Missing'}</span>
      </div>
      {studio}
    </li>
  );
}
